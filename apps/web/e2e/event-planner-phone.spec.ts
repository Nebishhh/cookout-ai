import { test, expect, type Page } from '@playwright/test';

/**
 * The Event Planner's per-dish course picker and servings override at phone width (runs only in
 * the `phone` project: 390x844, touch). Uses the shared signed-in session from globalSetup.
 */

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, 'page must not be wider than the viewport').toBe(clientWidth);
}

test.describe('Event Planner at phone width (390px)', () => {
  test('a dish can be given a course and an override, and the plan shows the course total', async ({
    page,
    request,
  }) => {
    const recipeName = `Phone Course Dish ${Date.now()}`;
    const res = await request.post('http://localhost:3011/api/recipes', {
      data: {
        name: recipeName,
        baseServings: 4,
        dietaryTags: ['Vegan'],
        ingredients: [{ ingredientId: 'rice', displayName: 'Rice', amount: 400, unit: 'g' }],
      },
    });
    expect(res.status()).toBe(201);

    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Main Navigation' })
      .getByRole('button', { name: 'Event Planner' })
      .tap();

    await page.getByRole('checkbox', { name: `Select recipe ${recipeName}` }).tap();
    const course = page.getByLabel(`Course for ${recipeName}`);
    await expect(course).toBeInViewport();
    await course.selectOption('Main');
    const override = page.getByLabel(`Servings override for ${recipeName}`);
    await override.fill('12');
    await expect(override).toHaveValue('12');
    await expectNoHorizontalScroll(page);

    // The controls are full-width touch targets on a phone.
    const box = await course.boundingBox();
    expect(box!.height, 'course picker is at least 44px tall on a phone').toBeGreaterThanOrEqual(
      44
    );

    await page.getByRole('button', { name: /plan event/i }).tap();

    // Default party of 10 omnivores; the override cooks 12 for the one Main.
    await expect(page.getByText('Main: 12 servings for 10 guests')).toBeVisible();
    await expect(page.getByText('over by 2')).toBeVisible();
    await expect(page.getByRole('article', { name: recipeName })).toContainText('Your override');
    await expectNoHorizontalScroll(page);
  });
});
