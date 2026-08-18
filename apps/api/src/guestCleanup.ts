import { prisma } from './prisma.js';

export const GUEST_SWEEP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * The only cleanup path for a guest who never revisits the app after their session expires —
 * getSessionUser's lazy expiry check (auth.ts) only fires for guests who DO come back. Deleting
 * a guest User cascades (onDelete: Cascade on every owned table) to reclaim everything they own
 * in one statement.
 */
export async function sweepExpiredGuests(): Promise<number> {
  const result = await prisma.user.deleteMany({
    where: { isGuest: true, guestExpiresAt: { lt: new Date() } },
  });
  return result.count;
}

let sweepHandle: NodeJS.Timeout | null = null;

export function startGuestCleanupSweep(): void {
  if (sweepHandle) {
    return;
  }
  sweepHandle = setInterval(() => {
    sweepExpiredGuests().catch((err) => console.error('guestCleanup: sweep failed', err));
  }, GUEST_SWEEP_INTERVAL_MS);
  sweepHandle.unref();
}
