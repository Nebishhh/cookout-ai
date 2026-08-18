import request from 'supertest';
import type { Test } from 'supertest';
import { app } from '../app.js';

// Matches allowedOrigins.ts's default allowlist (ALLOWED_ORIGINS is unset in the test
// environment) — csrfGuard rejects state-changing requests without a matching Origin, so
// every test request needs one attached, same as a real browser would send.
const TEST_ORIGIN = 'http://localhost:3000';
const TEST_PASSWORD = 'TestPassword123!';

export interface TestAgent {
  get(url: string): Test;
  post(url: string): Test;
  put(url: string): Test;
  patch(url: string): Test;
  delete(url: string): Test;
}

function withOrigin(raw: ReturnType<typeof request.agent>): TestAgent {
  return {
    get: (url: string) => raw.get(url).set('Origin', TEST_ORIGIN),
    post: (url: string) => raw.post(url).set('Origin', TEST_ORIGIN),
    put: (url: string) => raw.put(url).set('Origin', TEST_ORIGIN),
    patch: (url: string) => raw.patch(url).set('Origin', TEST_ORIGIN),
    delete: (url: string) => raw.delete(url).set('Origin', TEST_ORIGIN),
  };
}

let counter = 0;

export interface AuthenticatedTestAgent {
  /** Origin header pre-attached — the normal path for every route/data test in this file. */
  agent: TestAgent;
  /** The same cookie-carrying session, but WITHOUT an auto-attached Origin — only for
   * exercising csrfGuard itself (see the "Authentication" describe block in app.test.ts). */
  rawAgent: ReturnType<typeof request.agent>;
  user: { id: string; email: string };
}

export interface GuestTestAgent {
  agent: TestAgent;
  rawAgent: ReturnType<typeof request.agent>;
  user: { id: string; email: null; isGuest: true };
}

/** Signs up a fresh, uniquely-emailed user and returns a cookie-authenticated test agent. */
export async function createAuthenticatedAgent(): Promise<AuthenticatedTestAgent> {
  const raw = request.agent(app);
  const email = `test-user-${Date.now()}-${counter++}@example.com`;

  const signupRes = await raw
    .post('/api/auth/signup')
    .set('Origin', TEST_ORIGIN)
    .send({ email, password: TEST_PASSWORD });

  if (signupRes.status !== 201) {
    throw new Error(
      `createAuthenticatedAgent: signup failed (${signupRes.status}): ${JSON.stringify(signupRes.body)}`
    );
  }

  return {
    agent: withOrigin(raw),
    rawAgent: raw,
    user: signupRes.body as { id: string; email: string },
  };
}

/** Creates a guest session via POST /api/auth/guest — no email/password involved. */
export async function createGuestAgent(): Promise<GuestTestAgent> {
  const raw = request.agent(app);

  const guestRes = await raw.post('/api/auth/guest').set('Origin', TEST_ORIGIN).send();

  if (guestRes.status !== 201) {
    throw new Error(
      `createGuestAgent: guest creation failed (${guestRes.status}): ${JSON.stringify(guestRes.body)}`
    );
  }

  return {
    agent: withOrigin(raw),
    rawAgent: raw,
    user: guestRes.body as { id: string; email: null; isGuest: true },
  };
}

export { TEST_ORIGIN, TEST_PASSWORD };
