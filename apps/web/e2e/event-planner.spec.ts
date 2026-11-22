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

    // Domain Math Assertions. No courses are picked, so every dish is its own course and is
    // cooked for everyone who can eat it: servings equal the eligible-guest count.
    const card = (name: string) => page.getByRole('article', { name });

    // Recipe 1 (BBQ Chicken, 0 tags, baseServings 4): 4 omnivores.
    await expect(card(recipe1Name)).toContainText('Cook 4 servings');
    await expect(card(recipe1Name)).toContainText('4 guests can eat it');

    // Recipe 2 (Vegetarian Pasta Bake, ['Vegetarian'], baseServings 4):
    // 4 omnivores + (4 vegetarians - 2 vegans) = 6 eligible guests.
    await expect(card(recipe2Name)).toContainText('Cook 6 servings');
    await expect(card(recipe2Name)).toContainText('6 guests can eat it');

    // Recipe 3 (Vegan Garden Salad, ['Vegan', 'Vegetarian'], baseServings 2): all 8 guests.
    await expect(card(recipe3Name)).toContainText('Cook 8 servings');
    await expect(card(recipe3Name)).toContainText('8 guests can eat it');

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

  test('explains an invalid guest group next to the field and blocks planning (e.g. vegans > vegetarians)', async ({
    page,
    request,
  }) => {
    // "Plan Event" stays disabled until a recipe is selected, so this test seeds its own recipe
    // rather than relying on one left behind by an earlier test.
    const recipeName = `Guest Group Validation Recipe ${Date.now()}`;
    const recipeRes = await request.post('http://localhost:3011/api/recipes', {
      data: {
        name: recipeName,
        baseServings: 4,
        dietaryTags: [],
        ingredients: [{ ingredientId: 'rice', displayName: 'Rice', amount: 500, unit: 'g' }],
      },
    });
    expect(recipeRes.status()).toBe(201);

    await page.goto('/');
    await page.locator('#nav-tab-event-planner').click();

    // click() auto-waits for the recipe list to load; the old `if (isVisible())` guard didn't
    // wait, so on a slow run it skipped the selection and the button never enabled.
    await page.getByRole('checkbox', { name: `Select recipe ${recipeName}` }).click();

    // Invalid guest group: Total=10, Vegetarians=2, Vegans=5 (violates veganCount <= vegetarianCount)
    await page.locator('#input-total-guests').fill('10');
    await page.locator('#input-vegetarian-count').fill('2');
    await page.locator('#input-vegan-count').fill('5');

    // The breakdown is checked in the browser: a plain message appears under the vegan field and
    // the plan button stays disabled, so the request never reaches the server.
    const veganInput = page.locator('#input-vegan-count');
    await expect(veganInput).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#input-vegan-count-error')).toHaveText(
      "Vegan guests count as vegetarian too, so there can't be more than the 2 vegetarian guests."
    );
    await expect(page.getByRole('button', { name: /plan event/i })).toBeDisabled();
    await expect(page.getByText(/veganCount|vegetarianCount/)).toHaveCount(0);
  });

  test('quick-fill AI fallback: a no-digits description is parsed via the fixture-intercepted Gemini call and fills the guest fields', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('#nav-tab-event-planner').click();

    await expect(page.locator('#input-guest-description')).toBeVisible();

    // Deliberately no digits at all, so parseGuestGroupText() returns null and the route falls
    // back to the fixture-intercepted Gemini call (USE_GEMINI_FIXTURES=true for this e2e run).
    const description = page.locator('#input-guest-description');
    const fillInButton = page.getByRole('button', { name: /fill in/i });
    await description.fill('a large family reunion, mostly meat eaters');
    // "Fill in" stays disabled until the description reaches React state; check both first so a
    // lost fill fails here with a clear message instead of as a click timeout.
    await expect(description).toHaveValue('a large family reunion, mostly meat eaters');
    await expect(fillInButton).toBeEnabled();
    await fillInButton.click();

    // GUEST_GROUP_FIXTURE: { totalGuests: 14, vegetarianCount: 5, veganCount: 2 }
    await expect(page.locator('#input-total-guests')).toHaveValue('14');
    await expect(page.locator('#input-vegetarian-count')).toHaveValue('5');
    await expect(page.locator('#input-vegan-count')).toHaveValue('2');

    await expect(page.getByText(/filled in from ai parsing/i)).toBeVisible();
  });

  test('splits servings across courses for the 12-guest example and warns about the gap', async ({
    page,
    request,
  }) => {
    const suffix = Date.now();
    const seed = async (
      name: string,
      baseServings: number,
      dietaryTags: string[],
      ingredient: { ingredientId: string; displayName: string; amount: number; unit: string }
    ) => {
      const res = await request.post('http://localhost:3011/api/recipes', {
        data: { name: `${name} ${suffix}`, baseServings, dietaryTags, ingredients: [ingredient] },
      });
      expect(res.status()).toBe(201);
      return (await res.json()).name as string;
    };
    const pork = await seed('Pulled Pork', 4, [], {
      ingredientId: 'pork',
      displayName: 'Pork Shoulder',
      amount: 1,
      unit: 'kg',
    });
    const tagine = await seed('Chickpea Tagine', 4, ['Vegan'], {
      ingredientId: 'chickpeas',
      displayName: 'Chickpeas',
      amount: 400,
      unit: 'g',
    });
    const potatoes = await seed('Scalloped Potatoes', 6, ['Vegetarian'], {
      ingredientId: 'potato',
      displayName: 'Potatoes',
      amount: 1200,
      unit: 'g',
    });
    const sorbet = await seed('Coconut Sorbet', 6, ['Vegan'], {
      ingredientId: 'coconut-milk',
      displayName: 'Coconut Milk',
      amount: 800,
      unit: 'ml',
    });

    await page.goto('/');
    await page.locator('#nav-tab-event-planner').click();

    // 12 guests: 3 vegetarian, of whom 1 is vegan.
    await page.locator('#input-total-guests').fill('12');
    await page.locator('#input-vegetarian-count').fill('3');
    await page.locator('#input-vegan-count').fill('1');

    const courses: Array<[string, string]> = [
      [pork, 'Main'],
      [tagine, 'Main'],
      [potatoes, 'Side'],
      [sorbet, 'Dessert'],
    ];
    for (const [name, course] of courses) {
      await page.getByRole('checkbox', { name: `Select recipe ${name}` }).check();
      await page.getByLabel(`Course for ${name}`).selectOption(course);
    }
    await expect(
      page.getByText('Put alternatives in the same course to split servings.')
    ).toBeVisible();

    await page.getByRole('button', { name: /plan event/i }).click();

    const card = (name: string) => page.getByRole('article', { name });
    await expect(card(pork)).toContainText('Cook 4 1/2 servings');
    await expect(card(tagine)).toContainText('Cook 7 1/2 servings');
    await expect(card(potatoes)).toContainText('Cook 11 servings');
    await expect(card(sorbet)).toContainText('Cook 12 servings');

    await expect(page.getByText('Main: 12 servings for 12 guests')).toBeVisible();
    await expect(page.getByText('Side: 11 servings for 12 guests')).toBeVisible();
    await expect(page.getByText('Dessert: 12 servings for 12 guests')).toBeVisible();
    await expect(page.getByText('1 vegan guest has no Side')).toBeVisible();

    // The shopping list follows the split: 1 kg pork for 4 servings, cooked for 4 1/2, is
    // 1.125 kg, bought as 1.2 kg (without courses it was 2.3 kg).
    await expect(page.getByText('1.2 kg').first()).toBeVisible();
  });
});
