import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAuthRateLimit, guestRateLimit } from './authRateLimit.js';

function buildTestApp(max: number) {
  const app = express();
  // skip: () => false forces the limiter active regardless of NODE_ENV, since the real
  // default (see authRateLimit.ts) deliberately no-ops under Vitest's NODE_ENV=test so the
  // rest of the suite's many signups aren't themselves rate-limited.
  app.post(
    '/test',
    createAuthRateLimit({
      windowMs: 60_000,
      max,
      message: 'Too many test requests.',
      skip: () => false,
    }),
    (_req, res) => res.status(200).json({ ok: true })
  );
  return app;
}

describe('createAuthRateLimit', () => {
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
      message: 'Too many test requests.',
    });
  });

  it('sets standard RateLimit-* headers, not the legacy X-RateLimit-* ones', async () => {
    const app = buildTestApp(5);

    const res = await request(app).post('/test');

    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('defaults to skipping entirely under NODE_ENV=test when no explicit skip is passed', async () => {
    expect(process.env.NODE_ENV).toBe('test');
    const app = express();
    app.post(
      '/test',
      createAuthRateLimit({ windowMs: 60_000, max: 1, message: 'Should never fire.' }),
      (_req, res) => res.status(200).json({ ok: true })
    );

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/test');
      expect(res.status).toBe(200);
    }
  });

  it("a standalone limiter with skip: () => false blocks the same way guestRateLimit's underlying config would (10/hour)", async () => {
    const app = buildTestApp(10);

    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/test');
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).post('/test');
    expect(blocked.status).toBe(429);
  });

  it('the exported guestRateLimit keeps the default no-op-under-NODE_ENV=test contract', async () => {
    expect(process.env.NODE_ENV).toBe('test');
    const app = express();
    app.post('/test', guestRateLimit, (_req, res) => res.status(200).json({ ok: true }));

    for (let i = 0; i < 15; i++) {
      const res = await request(app).post('/test');
      expect(res.status).toBe(200);
    }
  });
});
