import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { prisma } from './prisma.js';

export const SESSION_COOKIE_NAME = 'cookout_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const GUEST_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const BCRYPT_COST = 10;

export class InvalidCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}

export class EmailAlreadyRegisteredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailAlreadyRegisteredError';
  }
}

export interface AuthUser {
  id: string;
  email: string | null;
  isGuest: boolean;
}

export function validateSignupInput(
  email: unknown,
  password: unknown
): { email: string; password: string } {
  if (typeof email !== 'string' || !email.includes('@') || email.trim() === '') {
    throw new InvalidCredentialsError('A valid email address is required.');
  }
  if (typeof password !== 'string' || password.length < 8) {
    throw new InvalidCredentialsError('Password must be at least 8 characters.');
  }
  return { email: email.trim().toLowerCase(), password };
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

// Session lookup needs a fast deterministic hash (not bcrypt's slow salted one) — the raw
// token itself already carries 256 bits of entropy, so SHA-256 here is purely to avoid
// storing a directly-usable credential at rest, not to slow down brute-forcing.
function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export async function createSession(
  userId: string,
  ttlMs: number = SESSION_TTL_MS
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs);
  await prisma.session.create({
    data: { id: hashToken(rawToken), userId, expiresAt },
  });
  return { rawToken, expiresAt };
}

export async function getSessionUser(rawToken: string): Promise<AuthUser | null> {
  const session = await prisma.session.findUnique({
    where: { id: hashToken(rawToken) },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    // A returning-but-too-late guest gets cleaned up immediately here rather than waiting for
    // guestCleanup.ts's periodic sweep — deleting the User cascades to everything they own.
    if (session.user.isGuest) {
      await prisma.user.delete({ where: { id: session.userId } }).catch(() => undefined);
    } else {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
    return null;
  }

  return { id: session.user.id, email: session.user.email, isGuest: session.user.isGuest };
}

// Real users: end just this session, same as before. Guests: delete the User outright — cascade
// (onDelete: Cascade on every owned table) reclaims 100% of their data in one statement, which is
// how "end guest session" fulfills the "data is deleted, not just logged out" requirement.
export async function endSession(rawToken: string): Promise<void> {
  const hashed = hashToken(rawToken);
  const session = await prisma.session.findUnique({
    where: { id: hashed },
    include: { user: true },
  });
  if (!session) {
    return;
  }
  if (session.user.isGuest) {
    await prisma.user.delete({ where: { id: session.userId } }).catch(() => undefined);
  } else {
    await prisma.session.delete({ where: { id: hashed } }).catch(() => undefined);
  }
}

export async function signup(email: string, password: string): Promise<AuthUser> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new EmailAlreadyRegisteredError('An account with that email already exists.');
  }
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { email, passwordHash } });
  return { id: user.id, email: user.email, isGuest: false };
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !user.passwordHash) {
    throw new InvalidCredentialsError('Invalid email or password.');
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new InvalidCredentialsError('Invalid email or password.');
  }
  return { id: user.id, email: user.email, isGuest: false };
}

// Zero-friction entry point: no email/password, immediately usable, data auto-deleted after
// GUEST_SESSION_TTL_MS (see getSessionUser's lazy-expiry branch and guestCleanup.ts's periodic
// sweep) or sooner via POST /api/auth/logout (see endSession's isGuest branch above).
export async function createGuestUser(): Promise<AuthUser> {
  const guestExpiresAt = new Date(Date.now() + GUEST_SESSION_TTL_MS);
  const user = await prisma.user.create({ data: { isGuest: true, guestExpiresAt } });
  return { id: user.id, email: null, isGuest: true };
}
