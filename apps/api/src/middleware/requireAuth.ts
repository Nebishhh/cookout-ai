import type { Request, Response, NextFunction } from 'express';
import { getSessionUser, SESSION_COOKIE_NAME, type AuthUser } from '../auth.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

/**
 * Resolves the session cookie into `req.user`. Mounted on every `/api/*` route except
 * `/api/health` and `/api/auth/*` (those are handled before this middleware in app.ts).
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof rawToken !== 'string' || rawToken === '') {
    return res.status(401).json({ error: 'Unauthorized', message: 'Login required.' });
  }

  // Express 4 doesn't catch rejected promises from async middleware, so a failed session
  // lookup (e.g. SQLite busy) must be handed to the error handler explicitly — otherwise it
  // escapes as an unhandled rejection and takes the whole process down.
  let user: AuthUser | null;
  try {
    user = await getSessionUser(rawToken);
  } catch (err) {
    return next(err);
  }
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Session expired or invalid.' });
  }

  req.user = user;
  return next();
}
