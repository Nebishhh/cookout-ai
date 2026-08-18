import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAiImportRateLimit, recipeImportRateLimit } from './aiImportRateLimit.js';

/** Stands in for requireAuth — every route this limiter is mounted on always runs after
 * requireAuth in the real app, so req.user is always set by the time the limiter's
 * keyGenerator reads req.user!.id. */
function withFakeUser(userId: string) {
  return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { id: userId, email: null, isGuest: false };
    next();
  };
}

function buildTestApp(max: number) {
  const app = express();
  app.use(withFakeUser('test-user-1'));
  // skip: () => false forces the limiter active regardless of NODE_ENV, since the real default
  // (see aiImportRateLimit.ts) deliberately no-ops under Vitest's NODE_ENV=test so the rest of
  // the suite's many AI-import calls through one shared test user aren't themselves limited.
  app.post(
    '/test',
    createAiImportRateLimit({
      windowMs: 60_000,
      max,
      message: 'Too many test imports.',
      skip: () => false,
    }),
    (_req, res) => res.status(200).json({ ok: true })
  );
  return app;
}

describe('createAiImportRateLimit', () => {
  it('allows requests under the limit and blocks the one that exceeds it with 429', async () => {
    const app = buildTestApp(3);

    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/test');
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).post('/test');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: 'TooManyRequests',
      message: 'Too many test imports.',
    });
  });

  it('keys the bucket per-user (req.user.id), not per-IP: a different user on the same connection gets a fresh bucket', async () => {
    const app = express();
    let currentUserId = 'user-a';
    app.use((req, _res, next) => {
      req.user = { id: currentUserId, email: null, isGuest: false };
      next();
    });
    app.post(
      '/test',
      createAiImportRateLimit({
        windowMs: 60_000,
        max: 1,
        message: 'Blocked.',
        skip: () => false,
      }),
      (_req, res) => res.status(200).json({ ok: true })
    );

    const first = await request(app).post('/test');
    expect(first.status).toBe(200);

    const secondSameUser = await request(app).post('/test');
    expect(secondSameUser.status).toBe(429);

    currentUserId = 'user-b';
    const differentUser = await request(app).post('/test');
    expect(differentUser.status).toBe(200);
  });

  it('the exported recipeImportRateLimit keeps the default no-op-under-NODE_ENV=test contract', async () => {
    expect(process.env.NODE_ENV).toBe('test');
    const app = express();
    app.use(withFakeUser('test-user-1'));
    app.post('/test', recipeImportRateLimit, (_req, res) => res.status(200).json({ ok: true }));

    for (let i = 0; i < 35; i++) {
      const res = await request(app).post('/test');
      expect(res.status).toBe(200);
    }
  });
});
