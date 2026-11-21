import { test, expect, type Page } from '@playwright/test';

/**
 * Phone-width navigation (runs only in the `phone` project: 390x844, touch). Regression coverage
 * for a header that made the page 540px wide at 390px, pushed the Event Planner tab off-screen so
 * a real tap failed, and hid the log-out button below 640px.
 *
 * Starts unauthenticated so it can log out without ending the shared session the other specs use.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const TABS = [
  { name: 'Recipes', heading: /create new recipe/i },
  { name: 'Shopping List', heading: /shopping list builder/i },
  { name: 'Event Planner', heading: /^event planner$/i },
] as const;

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, 'page must not be wider than the viewport').toBe(clientWidth);
}

/**
 * Only the tab row is pinned on phones: after scrolling a long view, it sits at the very top of
 * the viewport while the brand row (title, theme toggle, log-out) has scrolled away.
 */
async function expectOnlyTabRowPinned(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main Navigation' })
    .getByRole('button', { name: 'Recipes' })
    .tap();
  const viewportHeight = page.viewportSize()!.height;
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(pageHeight, 'the Recipes view must be long enough to scroll').toBeGreaterThan(
    viewportHeight * 1.5
  );

  await page.evaluate(() => window.scrollTo(0, 900));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(600);

  const tabRow = await page.getByTestId('tab-row').boundingBox();
  expect(tabRow!.y, 'tab row stays at the top of the viewport').toBeGreaterThanOrEqual(0);
  expect(tabRow!.y).toBeLessThanOrEqual(1);
  expect(tabRow!.height / viewportHeight, 'pinned part stays under 10% of the screen').toBeLessThan(
    0.1
  );
  await expect(page.getByRole('heading', { name: 'CookOut AI' })).not.toBeInViewport();

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole('heading', { name: 'CookOut AI' })).toBeInViewport();
}

async function tapEveryTab(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Main Navigation' });
  for (const tab of TABS) {
    // tap() is a real touch with actionability checks: it fails if the tab is off-screen or covered.
    await nav.getByRole('button', { name: tab.name }).tap();
    await expect(page.getByRole('heading', { name: tab.heading })).toBeVisible();
    await expect(nav.getByRole('button', { name: tab.name })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expectNoHorizontalScroll(page);
  }
}

test.describe('Phone navigation (390px)', () => {
  test('a signed-up user can reach every tab by tapping and can log out', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /sign up/i }).tap();
    await page.getByLabel(/email/i).fill(`phone-nav-${Date.now()}@example.com`);
    await page.getByLabel(/password/i).fill('PhoneNavTest123!');
    await page.getByRole('button', { name: /^sign up$/i }).tap();

    const logOut = page.getByRole('button', { name: /^log out$/i });
    await expect(logOut).toBeVisible();
    await expectNoHorizontalScroll(page);

    await tapEveryTab(page);
    await expectOnlyTabRowPinned(page);
    await expect(logOut).toBeInViewport();
    await logOut.tap();
    await expect(page.getByRole('heading', { name: /log in to cookout ai/i })).toBeVisible();
  });

  test('a guest can reach every tab by tapping and can end the session', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /continue as guest/i }).tap();

    const endSession = page.getByRole('button', { name: /end guest session/i });
    await expect(endSession).toBeVisible();

    await tapEveryTab(page);
    await expectOnlyTabRowPinned(page);
    await expect(endSession).toBeInViewport();
    await endSession.tap();
    await expect(page.getByRole('button', { name: /continue as guest/i })).toBeVisible();
  });
});
