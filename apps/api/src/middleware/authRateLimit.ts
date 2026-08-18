import rateLimit, { type Options } from 'express-rate-limit';

export interface AuthRateLimitConfig {
  windowMs: number;
  max: number;
  message: string;
  skip?: Options['skip'];
}

/**
 * Per-IP rate limiter for auth endpoints, keyed on `req.ip` (see app.ts's `trust proxy`
 * setting, required for this to see the real client IP rather than Caddy's).
 *
 * Defaults to skipping entirely when NODE_ENV=test (set automatically by Vitest, not
 * something this file sets) — the existing test suite signs up dozens of users per run
 * through a single shared supertest agent hitting the same loopback IP, so a real per-IP
 * cap here would fail the suite itself, not just an attacker. Pass an explicit `skip` to
 * exercise the limiter's real behavior in an isolated test (see authRateLimit.test.ts).
 */
export function createAuthRateLimit({ windowMs, max, message, skip }: AuthRateLimitConfig) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skip ?? (() => process.env.NODE_ENV === 'test'),
    handler: (_req, res) => {
      res.status(429).json({ error: 'TooManyRequests', message });
    },
  });
}

export const signupRateLimit = createAuthRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many accounts created from this network. Please try again later.',
});

export const loginRateLimit = createAuthRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many login attempts from this network. Please try again later.',
});

// Tighter than signup: creating a guest needs no email uniqueness check and no password, so
// it's a cheaper spam vector — each accepted request allocates a full User row (plus whatever
// data a scripted abuser adds) that sits until guestCleanup.ts's sweep reclaims it.
export const guestRateLimit = createAuthRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many guest sessions created from this network. Please try again later.',
});
