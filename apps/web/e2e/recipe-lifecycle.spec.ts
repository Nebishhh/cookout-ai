import { test, expect } from '@playwright/test';

/**
 * Open Questions & Scope Notes:
 * - This E2E test runs against a real Express backend (:3011) and real Vite frontend (:3010)
 *   connected to a fresh, isolated SQLite database (prisma/e2e.db).
 * - No fetch, API, or database mocking is used anywhere in this suite.
 * - This covers a single coherent happy-path user journey across the full stack.
 *   Fine-grained edge case coverage remains handled by Vitest unit/integration tests.
 * - Single worker execution (workers: 1) ensures deterministic state reset per test run.
 */

test.describe('CookOut AI End-to-End Full-Stack Lifecycle', () => {
  test('creates, edits, deletes recipes and verifies consolidated shopping list math', async ({
    page,
  }) => {
    // 1. Open live application homepage
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'CookOut AI' })).toBeVisible();

    // 2. Create Recipe #1 ("Pancakes", 4 servings, 2 cups milk)
    await page.getByLabel(/recipe name/i).fill('Pancakes');
    await page.getByLabel(/base servings/i).fill('4');

    await page.getByLabel(/id \(e.g. flour\)/i).fill('milk');
    await page.getByLabel(/display name/i).fill('Whole Milk');
    await page.getByLabel(/amount/i).fill('2');
    await page.getByLabel(/unit/i).selectOption('cup');

    await page.getByRole('button', { name: /create recipe/i }).click();

    // Assert Recipe #1 appears in saved recipe list
    await expect(page.getByText('Recipe "Pancakes" created successfully!')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pancakes' })).toBeVisible();
    await expect(page.getByText('4 servings')).toBeVisible();
    await expect(page.getByText('Whole Milk')).toBeVisible();

    // 3. Create Recipe #2 ("Waffles", 2 servings, 1 egg)
    await page.getByLabel(/recipe name/i).fill('Waffles');
    await page.getByLabel(/base servings/i).fill('2');

    await page.getByLabel(/id \(e.g. flour\)/i).fill('egg');
    await page.getByLabel(/display name/i).fill('Large Egg');
    await page.getByLabel(/amount/i).fill('1');
    await page.getByLabel(/unit/i).selectOption('egg');

    await page.getByRole('button', { name: /create recipe/i }).click();

    // Assert Recipe #2 appears in saved recipe list
    await expect(page.getByText('Recipe "Waffles" created successfully!')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Waffles' })).toBeVisible();

    // 4. Edit Recipe #1 (Change milk from 2 cups to 4 cups)
    await page.getByRole('button', { name: /edit recipe pancakes/i }).click();
    await expect(page.getByRole('heading', { name: 'Edit Recipe: Pancakes' })).toBeVisible();

    // Update ingredient amount to 4 cups
    await page.getByLabel(/amount/i).fill('4');
    await page.getByRole('button', { name: /save changes/i }).click();

    // Assert form closes and updated recipe card displays '4 cup'
    await expect(page.getByRole('heading', { name: 'Saved Recipes (2)' })).toBeVisible();
    await expect(page.getByText('4 cup')).toBeVisible();

    // 5. Delete Recipe #2 ("Waffles") with browser confirmation dialog
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Are you sure you want to delete "Waffles"?');
      await dialog.accept();
    });

    await page.getByRole('button', { name: /delete recipe waffles/i }).click();

    // Confirm "Waffles" is removed from the rendered recipe grid
    await expect(page.getByRole('heading', { name: 'Waffles' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Saved Recipes (1)' })).toBeVisible();

    // 6. Switch to Shopping List tab
    await page.getByRole('button', { name: 'Shopping List' }).click();
    await expect(page.getByRole('heading', { name: 'Shopping List Builder' })).toBeVisible();

    // Select "Pancakes" recipe checkbox
    const pancakesCheckbox = page.getByRole('checkbox', { name: /select recipe pancakes/i });
    await pancakesCheckbox.click();
    await expect(pancakesCheckbox).toBeChecked();

    // Set Target Servings to 8 (scaling 4 base servings by scale factor 2.0)
    await page.getByLabel(/target servings/i).fill('8');

    // Click Build Shopping List
    await page.getByRole('button', { name: /build shopping list/i }).click();

    // Assert Consolidated Shopping List displays
    await expect(page.getByRole('heading', { name: 'Consolidated Shopping List' })).toBeVisible();

    // 7. Float Math Verification (4 cups * 2 scale factor * 236.5882365 ml/cup = 1892.705892 ml)
    const quantityBadge = page.locator('span', { hasText: 'ml' }).first();
    await expect(quantityBadge).toBeVisible();

    const quantityText = await quantityBadge.innerText();
    // Extract numerical value from "1892.705892 ml"
    const numericAmount = parseFloat(quantityText.replace(/[^0-9.]/g, ''));
    const expectedMl = 4 * 2 * 236.5882365; // 1892.705892 ml

    // Assert numerical result matches hand-computed value within 0.01 tolerance
    expect(Math.abs(numericAmount - expectedMl)).toBeLessThan(0.01);
  });
});
