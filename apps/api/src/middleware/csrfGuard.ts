import type { Request, Response, NextFunction } from 'express';
import { isOriginAllowed } from '../allowedOrigins.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function refererOrigin(referer: string | undefined): string | undefined {
  if (!referer) {
    return undefined;
  }
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/**
 * Defense in depth against CSRF for cookie-authenticated state-changing requests.
 * SameSite=Lax (see auth cookie options in app.ts) already blocks most cross-site
 * fetch/XHR requests, but doesn't cover every client — this adds an explicit
 * Origin/Referer check against the same allowlist CORS uses, matching OWASP's
 * "verify Origin, fall back to Referer, reject if neither is present" guidance.
 * Applied to every state-changing /api/* route, including /api/auth/login and
 * /api/auth/signup themselves (login CSRF is a real, distinct attack this also blocks).
 */
export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const origin = req.headers.origin ?? refererOrigin(req.headers.referer);
  if (!isOriginAllowed(origin)) {
    return res.status(403).json({ error: 'Forbidden', message: 'Cross-origin request rejected.' });
  }

  return next();
}
