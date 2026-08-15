import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

const REALM = 'CookOut AI';

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    timingSafeEqual(aBuf, aBuf); // still constant-time on the failure path
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Deliberate stopgap, not real auth: a single shared password from APP_ACCESS_PASSWORD,
 * gating both the API and the static frontend (both served by this same Express process).
 * Meant to be ripped out once real multi-user auth exists — kept intentionally minimal.
 *
 * HTTP Basic Auth over a custom login page: the browser handles the prompt natively (zero
 * frontend work), at the cost of no logout button and no per-user identity — acceptable
 * for a handful of trusted users behind TLS.
 */
export function accessGate(req: Request, res: Response, next: NextFunction) {
  if (req.path === '/api/health') {
    return next();
  }

  const password = process.env.APP_ACCESS_PASSWORD;
  if (!password) {
    return res.status(500).json({
      error: 'ServerConfigurationError',
      message: 'Server is not configured with an access password.',
    });
  }

  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    const suppliedPassword = separatorIndex === -1 ? decoded : decoded.slice(separatorIndex + 1);

    if (safeEqual(suppliedPassword, password)) {
      return next();
    }
  }

  res.setHeader('WWW-Authenticate', `Basic realm="${REALM}", charset="UTF-8"`);
  return res.status(401).json({ error: 'Unauthorized', message: 'Access password required.' });
}
