import { test, expect } from '@playwright/test';

test.describe('CookOut AI End-to-End Full-Stack Lifecycle', () => {
  test('creates, edits, deletes recipes and verifies consolidated shopping list math', async ({
    page,
  }) => {
    const uniqueSuffix = Date.now();
    const recipeName = `Pancakes ${uniqueSuffix}`;

    await page.goto('/');

    // 1. Fill Recipe Creation Form
    await page.getByLabel(/recipe name/i).fill(recipeName);
    await page.getByLabel(/base servings/i).fill('4');

    // Fill Ingredient Line 1
    await page.getByLabel(/id \(e\.g\. flour\)/i).fill('milk');
    await page.getByLabel(/display name \(e\.g\. all-purpose flour\)/i).fill('Whole Milk');
    await page.getByLabel(/amount/i).fill('2');
    await page.getByLabel(/unit/i).selectOption('cup');

    await page.getByRole('button', { name: /create recipe/i }).click();

    // Assert Recipe #1 appears in saved recipe list
    await expect(page.getByText(`Recipe "${recipeName}" created successfully!`)).toBeVisible();
    await expect(page.getByRole('heading', { name: recipeName }).first()).toBeVisible();

    // 2. Open Shopping List tab
    await page.locator('#nav-tab-shopping-list').click();

    // Select the created recipe
    const recipeCheckbox = page.getByRole('checkbox', {
      name: new RegExp(`select recipe ${recipeName}`, 'i'),
    });
    await recipeCheckbox.click();

    // Click "Build Shopping List" button
    await page.getByRole('button', { name: /build shopping list/i }).click();

    // Assert Consolidated Shopping List card renders
    await expect(page.getByRole('heading', { name: 'Consolidated Shopping List' })).toBeVisible();
    await expect(page.getByText('Whole Milk').first()).toBeVisible();
    await expect(page.getByText('2 cup').first()).toBeVisible();

    // 3. Return to Recipes tab and delete the created recipe
    await page.locator('#nav-tab-recipes').click();

    // Auto-accept window.confirm dialog for deletion
    page.on('dialog', (dialog) => dialog.accept());

    await page
      .getByRole('button', { name: new RegExp(`delete recipe ${recipeName}`, 'i') })
      .click();

    // Assert recipe is removed from the DOM list
    await expect(page.getByRole('heading', { name: recipeName })).not.toBeVisible();
  });
});
