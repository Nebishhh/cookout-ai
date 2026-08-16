import { test, expect } from '@playwright/test';

/**
 * Regression coverage for a real bug caught during this feature's manual two-user
 * verification pass: `App.tsx`'s TanStack Query persister wrote every successful query
 * (recipes, events, shopping lists) to localStorage by default, not just the one
 * offline-toggle mutation it was meant to persist. Since `AppShell` fully unmounts on logout
 * and remounts fresh on the next login, a second user logging in on the same browser
 * rehydrated the *first* user's cached data straight out of localStorage — a real
 * cross-user data leak, entirely invisible to the backend-only cross-user isolation tests in
 * `apps/api/src/app.test.ts`, since the API itself was scoping correctly the whole time; the
 * leak was purely client-side cache reuse across the login/logout boundary. Fixed by adding
 * `shouldDehydrateQuery: () => false` to the persister's `dehydrateOptions`.
 *
 * Starts from a fresh, unauthenticated context (no seeded storageState from globalSetup.ts)
 * so it can exercise the real signup/login/logout UI directly, matching how the bug was
 * actually found.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Auth session isolation (client-side cache)', () => {
  test('a second user logging in on the same browser never sees the first user’s cached recipes', async ({
    page,
  }) => {
    const uniqueSuffix = Date.now();
    const userAEmail = `isolation-a-${uniqueSuffix}@example.com`;
    const userBEmail = `isolation-b-${uniqueSuffix}@example.com`;
    const password = 'IsolationTest123!';
    const recipeName = `User A Only Recipe ${uniqueSuffix}`;

    // 1. Sign up User A and create a recipe.
    await page.goto('/');
    await page.getByRole('button', { name: /sign up/i }).click();
    await page.getByLabel(/email/i).fill(userAEmail);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^sign up$/i }).click();

    await expect(page.getByRole('button', { name: /log out/i })).toBeVisible();

    await page.getByLabel(/recipe name/i).fill(recipeName);
    await page.getByLabel(/base servings/i).fill('4');
    await page.getByLabel(/id \(e\.g\. flour\)/i).fill('flour');
    await page.getByLabel(/display name \(e\.g\. all-purpose flour\)/i).fill('Flour');
    await page.getByLabel(/amount/i).fill('1');
    await page.getByRole('button', { name: /create recipe/i }).click();
    await expect(page.getByText(`Recipe "${recipeName}" created successfully!`)).toBeVisible();
    await expect(page.getByRole('heading', { name: recipeName })).toBeVisible();

    // 2. Log out User A.
    await page.getByRole('button', { name: /log out/i }).click();
    await expect(page.getByRole('heading', { name: /log in to cookout ai/i })).toBeVisible();

    // 3. Sign up User B on the SAME browser/page — the exact scenario that leaked before the fix.
    await page.getByRole('button', { name: /sign up/i }).click();
    await page.getByLabel(/email/i).fill(userBEmail);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^sign up$/i }).click();

    await expect(page.getByRole('button', { name: /log out/i })).toBeVisible();

    // 4. User B must see an empty catalog, never User A's recipe.
    await expect(page.getByText(/no recipes available/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: recipeName })).not.toBeVisible();
  });
});
