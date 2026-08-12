import { test, expect } from '@playwright/test';

test.describe('Event Planner E2E Tests', () => {
  test('creates recipes, plans event with guest group mix, and asserts exact domain math & consolidated list', async ({
    page,
    request,
  }) => {
    // 1. Seed 3 unique recipes directly via API (port 3011)
    const uniqueSuffix = Date.now();
    const recipe1Name = `BBQ Chicken Skewers ${uniqueSuffix}`;
    const recipe2Name = `Vegetarian Pasta Bake ${uniqueSuffix}`;
    const recipe3Name = `Vegan Garden Salad ${uniqueSuffix}`;

    const recipe1Res = await request.post('http://localhost:3011/api/recipes', {
      data: {
        name: recipe1Name,
        baseServings: 4,
        dietaryTags: [],
        ingredients: [
          { ingredientId: 'chicken', displayName: 'Chicken Breast', amount: 1000, unit: 'g' },
          { ingredientId: 'bbq_sauce', displayName: 'BBQ Sauce', amount: 200, unit: 'ml' },
        ],
      },
    });
    expect(recipe1Res.status()).toBe(201);

    const recipe2Res = await request.post('http://localhost:3011/api/recipes', {
      data: {
        name: recipe2Name,
        baseServings: 4,
        dietaryTags: ['Vegetarian'],
        ingredients: [
          { ingredientId: 'pasta', displayName: 'Penne Pasta', amount: 400, unit: 'g' },
          { ingredientId: 'cheese', displayName: 'Mozzarella Cheese', amount: 250, unit: 'g' },
        ],
      },
    });
    expect(recipe2Res.status()).toBe(201);

    const recipe3Res = await request.post('http://localhost:3011/api/recipes', {
      data: {
        name: recipe3Name,
        baseServings: 2,
        dietaryTags: ['Vegan', 'Vegetarian'],
        ingredients: [
          { ingredientId: 'lettuce', displayName: 'Romaine Lettuce', amount: 300, unit: 'g' },
          { ingredientId: 'olive_oil', displayName: 'Olive Oil', amount: 2, unit: 'tbsp' },
        ],
      },
    });
    expect(recipe3Res.status()).toBe(201);

    // 2. Open Event Planner tab in browser
    await page.goto('/');
    await page.locator('#nav-tab-event-planner').click();

    await expect(
      page.getByRole('heading', { name: '1. Event Name, Guest Breakdown & Recipe Selection' })
    ).toBeVisible();

    // 3. Fill Guest Group Form: Total Guests=8, Vegetarians=4 (inclusive of 2 vegans), Vegans=2 -> (4 Omnivores, 2 Vegetarians, 2 Vegans)
    await page.locator('#input-total-guests').fill('8');
    await page.locator('#input-vegetarian-count').fill('4');
    await page.locator('#input-vegan-count').fill('2');

    // 4. Select the 3 newly seeded recipes
    const bbqCheckbox = page.getByRole('checkbox', {
      name: new RegExp(`select recipe ${recipe1Name}`, 'i'),
    });
    const pastaCheckbox = page.getByRole('checkbox', {
      name: new RegExp(`select recipe ${recipe2Name}`, 'i'),
    });
    const saladCheckbox = page.getByRole('checkbox', {
      name: new RegExp(`select recipe ${recipe3Name}`, 'i'),
    });

    await bbqCheckbox.click();
    await pastaCheckbox.click();
    await saladCheckbox.click();

    expect(await bbqCheckbox.isChecked()).toBe(true);
    expect(await pastaCheckbox.isChecked()).toBe(true);
    expect(await saladCheckbox.isChecked()).toBe(true);

    // 5. Submit "Plan Event"
    await page.getByRole('button', { name: /plan event/i }).click();

    // 6. Assert Included Recipes Heading
    await expect(page.getByRole('heading', { name: 'Included Recipes' })).toBeVisible();

    // Domain Math Assertions:
    // Recipe 1 (BBQ Chicken, 0 tags, baseServings 4):
    // Eligible guests = 4 omnivores. Eligible servings = 4.
    await expect(page.getByText(recipe1Name).first()).toBeVisible();
    await expect(page.getByText('serves 4 guests')).toBeVisible();

    // Recipe 2 (Vegetarian Pasta Bake, ['Vegetarian'], baseServings 4):
    // Eligible guests = 4 omnivores + (4 vegetarians - 2 vegans) = 6 eligible guests.
    await expect(page.getByText(recipe2Name).first()).toBeVisible();
    await expect(page.getByText('serves 6 guests')).toBeVisible();

    // Recipe 3 (Vegan Garden Salad, ['Vegan', 'Vegetarian'], baseServings 2):
    // Eligible guests = 8 (all guests).
    await expect(page.getByText(recipe3Name).first()).toBeVisible();
    await expect(page.getByText('serves 8 guests')).toBeVisible();

    // 7. Consolidated Event Shopping List Verification
    await expect(
      page.getByRole('heading', { name: 'Consolidated Event Shopping List' })
    ).toBeVisible();

    // Verify consolidated ingredient quantities in rendered table
    await expect(page.getByText('Chicken Breast').first()).toBeVisible();
    await expect(page.getByText('1000 g').first()).toBeVisible();

    await expect(page.getByText('Penne Pasta').first()).toBeVisible();
    await expect(page.getByText('600 g').first()).toBeVisible();

    await expect(page.getByText('Romaine Lettuce').first()).toBeVisible();
    await expect(page.getByText('1200 g').first()).toBeVisible();
  });

  test('displays 400 error banner when submitting an invalid guest group (e.g. vegans > vegetarians)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('#nav-tab-event-planner').click();

    // Select at least 1 recipe so "Plan Event" button is enabled
    const firstCheckbox = page.getByRole('checkbox', { name: /select recipe/i }).first();
    if (await firstCheckbox.isVisible()) {
      await firstCheckbox.click();
    }

    // Invalid guest group: Total=10, Vegetarians=2, Vegans=5 (violates veganCount <= vegetarianCount)
    await page.locator('#input-total-guests').fill('10');
    await page.locator('#input-vegetarian-count').fill('2');
    await page.locator('#input-vegan-count').fill('5');

    await page.getByRole('button', { name: /plan event/i }).click();

    // Assert 400 error banner displays cleanly in UI
    await expect(page.getByText(/cannot exceed vegetarianCount/i)).toBeVisible();
  });
});
