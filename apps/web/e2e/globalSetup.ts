import { chromium, errors, request } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE_URL = 'http://localhost:3011';
const TEST_ORIGIN = 'http://localhost:3010';
const APP_READY_TIMEOUT_MS = 180_000;

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

  await waitForUsableApp();
}

/**
 * Loads the app once in a real browser, with the saved session, and waits until the
 * authenticated UI renders. The webServer readiness check passes as soon as Vite answers
 * HTTP, but on a cold dependency cache Vite holds every pre-bundled module request until
 * its optimizer finishes — which can take longer than one test's 30 s budget, so without
 * this gate the first spec's page.goto would absorb (and time out on) that wait.
 */
async function waitForUsableApp() {
  const startedAt = Date.now();
  const deadline = startedAt + APP_READY_TIMEOUT_MS;
  const remaining = () => Math.max(deadline - Date.now(), 1);
  const pageErrors: string[] = [];

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
    try {
      const page = await context.newPage();
      page.on('console', (msg) => {
        if (msg.type() === 'error') pageErrors.push(`console.error: ${msg.text()}`);
      });
      page.on('pageerror', (error) => pageErrors.push(`pageerror: ${error.message}`));

      try {
        await page.goto(TEST_ORIGIN, { waitUntil: 'load', timeout: remaining() });
        await page
          .getByRole('button', { name: /paste recipe text/i })
          .waitFor({ state: 'visible', timeout: remaining() });
      } catch (error) {
        if (!(error instanceof errors.TimeoutError)) throw error;
        throw new Error(
          `globalSetup: the "Paste recipe text" button at ${TEST_ORIGIN} never became visible ` +
            `within ${APP_READY_TIMEOUT_MS / 1000} s. The most common reason is slow Vite ` +
            `dependency bundling on a cold cache.` +
            (pageErrors.length
              ? `\nPage errors seen:\n${pageErrors.join('\n')}`
              : '\nNo page errors were seen.')
        );
      }

      if (pageErrors.length) {
        throw new Error(
          `globalSetup: the app logged errors while loading:\n${pageErrors.join('\n')}`
        );
      }

      console.log(`globalSetup: app usable after ${Date.now() - startedAt} ms`);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
