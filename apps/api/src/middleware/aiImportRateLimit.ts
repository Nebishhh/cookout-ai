import rateLimit, { type Options } from 'express-rate-limit';

export interface AiImportRateLimitConfig {
  windowMs: number;
  max: number;
  message: string;
  skip?: Options['skip'];
}

/**
 * Per-user (not per-IP) rate limiter factory for the AI recipe-import routes, keyed on
 * `req.user!.id` rather than `req.ip` — every route this is mounted on is registered after
 * `app.use('/api', requireAuth)` in app.ts, so `req.user` is always populated by the time this
 * middleware runs. Per-user keying (vs. per-IP, as authRateLimit.ts uses for the pre-auth
 * signup/login/guest routes) means users behind a shared/NAT'd IP don't share a bucket, and one
 * authenticated user can't dodge the limit by switching networks.
 *
 * Defaults to skipping entirely when NODE_ENV=test (set automatically by Vitest, not something
 * this file sets), same precedent as authRateLimit.ts's createAuthRateLimit — this project's
 * existing test suite exercises these routes many times per run through one shared test user.
 * Pass an explicit `skip` to exercise the limiter's real behavior in an isolated test (see
 * aiImportRateLimit.test.ts).
 */
export function createAiImportRateLimit({ windowMs, max, message, skip }: AiImportRateLimitConfig) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user!.id,
    skip: skip ?? (() => process.env.NODE_ENV === 'test'),
    handler: (_req, res) => {
      res.status(429).json({ error: 'TooManyRequests', message });
    },
  });
}

// A single shared bucket across import-text/import-url/import-image (not one limiter per route)
// — they're the same underlying action (an AI recipe import, each costing one Gemini call) just
// different input modes, so a per-route limit would let someone bypass it by switching modes.
export const recipeImportRateLimit = createAiImportRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  message: 'Too many recipe imports. Please try again later.',
});
