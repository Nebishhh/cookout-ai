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

  const user = await getSessionUser(rawToken);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Session expired or invalid.' });
  }

  req.user = user;
  return next();
}
