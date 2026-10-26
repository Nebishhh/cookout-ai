import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// getSessionUser is wrapped (not replaced) so the 401 cases below exercise the real session
// lookup against test.db, while the 500 case can make a single call reject.
const { getSessionUserMock } = vi.hoisted(() => ({ getSessionUserMock: vi.fn() }));

vi.mock('../auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth.js')>();
  getSessionUserMock.mockImplementation(actual.getSessionUser);
  return { ...actual, getSessionUser: getSessionUserMock };
});

const { app } = await import('../app.js');

describe('requireAuth', () => {
  beforeEach(() => {
    getSessionUserMock.mockClear();
  });

  it('returns 500 when the session lookup rejects, and keeps serving requests', async () => {
    getSessionUserMock.mockRejectedValueOnce(new Error('SQLITE_BUSY: database is locked'));

    const res = await request(app)
      .get('/api/recipes')
      .set('Cookie', 'cookout_session=any-token')
      .timeout(3000);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: 'InternalServerError',
      message: 'An unexpected error occurred.',
    });

    // The same app instance still answers afterwards — the rejection didn't escape as an
    // unhandled promise rejection (which would crash a real process).
    const health = await request(app).get('/api/health').timeout(3000);
    expect(health.status).toBe(200);
  });

  it('returns 401 when there is no session cookie', async () => {
    const res = await request(app).get('/api/recipes');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized', message: 'Login required.' });
    expect(getSessionUserMock).not.toHaveBeenCalled();
  });

  it('returns 401 for a token that matches no session', async () => {
    const res = await request(app)
      .get('/api/recipes')
      .set('Cookie', 'cookout_session=not-a-real-session-token');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized', message: 'Session expired or invalid.' });
    expect(getSessionUserMock).toHaveBeenCalledTimes(1);
  });
});
