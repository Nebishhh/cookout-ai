import { request } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE_URL = 'http://localhost:3011';
const TEST_ORIGIN = 'http://localhost:3010';

export const STORAGE_STATE_PATH = path.resolve(__dirname, '.auth/storageState.json');

/**
 * Signs up one seeded e2e test user directly against the API (bypassing the UI) and saves
 * the resulting session cookie to disk as Playwright storageState — every spec file then
 * starts already authenticated (see playwright.config.ts's `use.storageState`), matching how
 * a real browser session would carry the cookie. The signup call needs an explicit Origin
 * header since this is a plain HTTP client, not a browser — csrfGuard requires one on every
 * state-changing request, same as the real app's login flow gets from the browser for free.
 */
export default async function globalSetup() {
  const requestContext = await request.newContext({
    baseURL: API_BASE_URL,
    extraHTTPHeaders: { Origin: TEST_ORIGIN },
  });

  const email = `e2e-user-${Date.now()}@example.com`;
  const password = 'E2ETestPassword123!';

  const res = await requestContext.post('/api/auth/signup', { data: { email, password } });
  if (!res.ok()) {
    throw new Error(
      `globalSetup: failed to create the e2e test user (${res.status()}): ${await res.text()}`
    );
  }

  await requestContext.storageState({ path: STORAGE_STATE_PATH });
  await requestContext.dispose();
}
