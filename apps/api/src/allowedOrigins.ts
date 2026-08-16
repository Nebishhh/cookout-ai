// Shared allowlist for both the CORS layer (app.ts) and the CSRF Origin/Referer check
// (middleware/csrfGuard.ts) — a credentialed-cookie deployment needs both to agree on
// exactly which origins are trusted, rather than CORS allowing broadly and CSRF narrowly
// (or vice versa).
const DEFAULT_DEV_ORIGIN = 'http://localhost:3000';

export function getAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw || raw.trim() === '') {
    return [DEFAULT_DEV_ORIGIN];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
}

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) {
    return false;
  }
  return getAllowedOrigins().includes(origin);
}
