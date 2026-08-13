import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from './app.js';
import { prisma } from './prisma.js';

/**
 * Testing Architecture & Database Isolation Note:
 * - We use `supertest` with Vitest to perform HTTP integration tests against the Express app.
 * - A dedicated SQLite database file `prisma/test.db` is specified via process.env.DATABASE_URL in `vitest.config.ts` during test execution.
 * - Before tests run, we clear `test.db` tables before each test for complete test isolation without touching `dev.db`.
 */

describe('CookOut AI API Endpoints', () => {
  beforeAll(async () => {
    // Ensure test database has schema applied
    try {
      await prisma.$executeRawUnsafe('DELETE FROM ShoppingListItem');
      await prisma.$executeRawUnsafe('DELETE FROM ShoppingList');
      await prisma.$executeRawUnsafe('DELETE FROM IngredientLine');
      await prisma.$executeRawUnsafe('DELETE FROM RecipeStep');
      await prisma.$executeRawUnsafe('DELETE FROM Recipe');
      await prisma.$executeRawUnsafe('DELETE FROM Event');
      await prisma.$executeRawUnsafe('DELETE FROM IngredientCategoryOverride');
      await prisma.$executeRawUnsafe('DELETE FROM PantryItem');
    } catch {
      // Table creation handled by initial migration/db push
    }
  });

  beforeEach(async () => {
    // Clean database before each test
    await prisma.shoppingListItem.deleteMany();
    await prisma.shoppingList.deleteMany();
    await prisma.ingredientLine.deleteMany();
    await prisma.recipeStep.deleteMany();
    await prisma.recipe.deleteMany();
    await prisma.event.deleteMany();
    await prisma.ingredientCategoryOverride.deleteMany();
    await prisma.pantryItem.deleteMany();
  });

  describe('GET /api/health', () => {
    it('returns health status', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('app', 'CookOut AI Backend API');
      expect(response.body).toHaveProperty('domainPackage', '@cookout-ai/domain');
    });
  });

  describe('POST /api/recipes & GET /api/recipes', () => {
    it('creates a valid recipe (201) and retrieves it via GET /api/recipes/:id', async () => {
      const newRecipe = {
        name: 'Classic Pancakes',
        baseServings: 4,
        dietaryTags: ['Vegetarian'],
        ingredients: [
          { ingredientId: 'flour', displayName: 'All-Purpose Flour', amount: 2, unit: 'cup' },
          { ingredientId: 'milk', displayName: 'Whole Milk', amount: 200, unit: 'ml' },
        ],
      };

      const createRes = await request(app).post('/api/recipes').send(newRecipe);
      expect(createRes.status).toBe(201);
      expect(createRes.body).toHaveProperty('id');
      expect(createRes.body.name).toBe('Classic Pancakes');
      expect(createRes.body.baseServings).toBe(4);
      expect(createRes.body.dietaryTags).toEqual(['Vegetarian']);
      expect(createRes.body.ingredients).toHaveLength(2);

      const recipeId = createRes.body.id;

      // GET /api/recipes/:id
      const getRes = await request(app).get(`/api/recipes/${recipeId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.id).toBe(recipeId);
      expect(getRes.body.name).toBe('Classic Pancakes');
      expect(getRes.body.ingredients[0].ingredientId).toBe('flour');
    });

    it('creates a recipe without steps (defaults to empty array) and one with ordered steps', async () => {
      const noStepsRecipe = {
        name: 'Steps-less Recipe',
        baseServings: 2,
        ingredients: [{ ingredientId: 'milk', displayName: 'Milk', amount: 1, unit: 'cup' }],
      };
      const noStepsRes = await request(app).post('/api/recipes').send(noStepsRecipe);
      expect(noStepsRes.status).toBe(201);
      expect(noStepsRes.body.steps).toEqual([]);

      const withStepsRecipe = {
        name: 'Classic Pancakes',
        baseServings: 4,
        ingredients: [{ ingredientId: 'flour', displayName: 'Flour', amount: 2, unit: 'cup' }],
        steps: [{ instruction: 'Mix dry ingredients.' }, { instruction: 'Add wet ingredients.' }],
      };
      const createRes = await request(app).post('/api/recipes').send(withStepsRecipe);
      expect(createRes.status).toBe(201);
      expect(createRes.body.steps).toEqual([
        { instruction: 'Mix dry ingredients.', duration: null, temperature: null },
        { instruction: 'Add wet ingredients.', duration: null, temperature: null },
      ]);

      const getRes = await request(app).get(`/api/recipes/${createRes.body.id}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.steps).toEqual([
        { instruction: 'Mix dry ingredients.', duration: null, temperature: null },
        { instruction: 'Add wet ingredients.', duration: null, temperature: null },
      ]);
    });

    it('round-trips per-step duration/temperature through create, read, and update', async () => {
      const createRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Baked Chicken',
          baseServings: 4,
          ingredients: [
            { ingredientId: 'chicken', displayName: 'Chicken', amount: 500, unit: 'g' },
          ],
          steps: [
            {
              instruction: 'Preheat the oven.',
              temperatureAmount: 400,
              temperatureUnit: 'F',
            },
            {
              instruction: 'Bake until cooked through.',
              durationAmount: 25,
              durationUnit: 'minutes',
              temperatureAmount: 400,
              temperatureUnit: 'F',
            },
            { instruction: 'Let rest before serving.' },
          ],
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.steps).toEqual([
        {
          instruction: 'Preheat the oven.',
          duration: null,
          temperature: { amount: 400, unit: 'F' },
        },
        {
          instruction: 'Bake until cooked through.',
          duration: { amount: 25, unit: 'minutes' },
          temperature: { amount: 400, unit: 'F' },
        },
        { instruction: 'Let rest before serving.', duration: null, temperature: null },
      ]);

      const getRes = await request(app).get(`/api/recipes/${createRes.body.id}`);
      expect(getRes.body.steps).toEqual(createRes.body.steps);

      const putRes = await request(app)
        .put(`/api/recipes/${createRes.body.id}`)
        .send({
          name: 'Baked Chicken',
          baseServings: 4,
          ingredients: [
            { ingredientId: 'chicken', displayName: 'Chicken', amount: 500, unit: 'g' },
          ],
          steps: [
            { instruction: 'Chill in the fridge.', durationAmount: 2, durationUnit: 'hours' },
          ],
        });

      expect(putRes.status).toBe(200);
      expect(putRes.body.steps).toEqual([
        {
          instruction: 'Chill in the fridge.',
          duration: { amount: 2, unit: 'hours' },
          temperature: null,
        },
      ]);
    });

    it('rejects an invalid step duration unit (422-equivalent 400 domain error)', async () => {
      const res = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Bad Step',
          baseServings: 4,
          ingredients: [{ ingredientId: 'flour', displayName: 'Flour', amount: 2, unit: 'cup' }],
          steps: [{ instruction: 'Rest.', durationAmount: 10, durationUnit: 'seconds' }],
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'InvalidRecipeError');
    });

    it('rejects POST /api/recipes with invalid data (400) and persists nothing to database', async () => {
      // Invalid baseServings: 0
      const invalidRecipe = {
        name: 'Invalid Servings Recipe',
        baseServings: 0,
        ingredients: [{ ingredientId: 'flour', displayName: 'Flour', amount: 2, unit: 'cup' }],
      };

      const res0 = await request(app).post('/api/recipes').send(invalidRecipe);
      expect(res0.status).toBe(400);
      expect(res0.body).toHaveProperty('error', 'InvalidRecipeError');

      // Invalid unit
      const invalidUnitRecipe = {
        name: 'Invalid Unit Recipe',
        baseServings: 2,
        ingredients: [
          { ingredientId: 'flour', displayName: 'Flour', amount: 2, unit: 'unsupported_unit' },
        ],
      };

      const resUnit = await request(app).post('/api/recipes').send(invalidUnitRecipe);
      expect(resUnit.status).toBe(400);
      expect(resUnit.body).toHaveProperty('error', 'InvalidUnitError');

      // Verify no recipe was created in database
      const listRes = await request(app).get('/api/recipes');
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(0);
    });

    it('GET /api/recipes returns all created recipes', async () => {
      const r1 = {
        name: 'Recipe 1',
        baseServings: 2,
        ingredients: [{ ingredientId: 'egg', displayName: 'Eggs', amount: 2, unit: 'egg' }],
      };
      const r2 = {
        name: 'Recipe 2',
        baseServings: 4,
        ingredients: [{ ingredientId: 'milk', displayName: 'Milk', amount: 1, unit: 'cup' }],
      };

      await request(app).post('/api/recipes').send(r1);
      await request(app).post('/api/recipes').send(r2);

      const listRes = await request(app).get('/api/recipes');
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(2);
    });

    it('GET /api/recipes/:id with a nonexistent id returns 404', async () => {
      const res = await request(app).get('/api/recipes/non-existent-id-123');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'NotFound');
    });

    it('round-trips dietaryTags correctly through JSON serialization workaround', async () => {
      const recipeWithTags = {
        name: 'Vegan Salad',
        baseServings: 2,
        dietaryTags: ['Vegetarian', 'Vegan'],
        ingredients: [
          { ingredientId: 'lettuce', displayName: 'Romaine Lettuce', amount: 1, unit: 'count' },
        ],
      };

      const createRes = await request(app).post('/api/recipes').send(recipeWithTags);
      expect(createRes.status).toBe(201);
      const id = createRes.body.id;

      const getRes = await request(app).get(`/api/recipes/${id}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.dietaryTags).toEqual(['Vegetarian', 'Vegan']);
    });
  });

  describe('GET /api/recipes pagination', () => {
    async function createRecipe(name: string, dietaryTags: string[] = []) {
      const res = await request(app)
        .post('/api/recipes')
        .send({
          name,
          baseServings: 2,
          dietaryTags,
          ingredients: [{ ingredientId: 'egg', displayName: 'Eggs', amount: 2, unit: 'egg' }],
        });
      return res.body.id as string;
    }

    it('GET /api/recipes with no query params stays a bare, unbounded array (unchanged for ShoppingListBuilder/EventPlanner)', async () => {
      await createRecipe('Pancakes');
      await createRecipe('Waffles');

      const res = await request(app).get('/api/recipes');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
    });

    it('GET /api/recipes?limit=N returns an {items, nextCursor} envelope', async () => {
      await createRecipe('Pancakes');
      await createRecipe('Waffles');

      const res = await request(app).get('/api/recipes?limit=10');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('nextCursor', null);
      expect(res.body.items).toHaveLength(2);
    });

    it('cursor advances across pages with no duplicates or gaps', async () => {
      // createdAt has second-level-or-coarser resolution risk of ties in a fast test run —
      // the id tie-breaker is what this test is really proving out.
      await createRecipe('Recipe A');
      await createRecipe('Recipe B');
      await createRecipe('Recipe C');

      const page1 = await request(app).get('/api/recipes?limit=2');
      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.nextCursor).not.toBeNull();

      const page2 = await request(app).get(
        `/api/recipes?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`
      );
      expect(page2.body.items).toHaveLength(1);
      expect(page2.body.nextCursor).toBeNull();

      const page1Ids = page1.body.items.map((r: { id: string }) => r.id);
      const page2Ids = page2.body.items.map((r: { id: string }) => r.id);
      expect(new Set([...page1Ids, ...page2Ids]).size).toBe(3);
    });

    it('search filters by name across the whole catalog', async () => {
      await createRecipe('Chocolate Cake');
      await createRecipe('Vanilla Cake');
      await createRecipe('Beef Stew');

      const res = await request(app).get('/api/recipes?limit=10&search=cake');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items.map((r: { name: string }) => r.name).sort()).toEqual([
        'Chocolate Cake',
        'Vanilla Cake',
      ]);
    });

    it('tags filters by dietary tag', async () => {
      await createRecipe('Vegan Bowl', ['Vegan']);
      await createRecipe('Veggie Stir Fry', ['Vegetarian']);
      await createRecipe('Beef Stew', []);

      const res = await request(app).get('/api/recipes?limit=10&tags=Vegan');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].name).toBe('Vegan Bowl');
    });

    it('rejects an invalid limit', async () => {
      const res = await request(app).get('/api/recipes?limit=not-a-number');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'InvalidRecipeError');
    });

    it('rejects a malformed cursor', async () => {
      const res = await request(app).get('/api/recipes?limit=10&cursor=not-valid-base64json');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'InvalidRecipeError');
    });
  });

  describe('POST /api/shopping-list', () => {
    it('returns a scaled and consolidated shopping list for multiple real recipes', async () => {
      // Recipe 1: 4 servings, needs 2 cups milk (Volume)
      const r1Res = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Pancakes',
          baseServings: 4,
          ingredients: [
            { ingredientId: 'milk', displayName: 'Whole Milk', amount: 2, unit: 'cup' },
            { ingredientId: 'sugar', displayName: 'White Sugar', amount: 100, unit: 'g' },
          ],
        });

      // Recipe 2: 2 servings, needs 100 ml milk (Volume)
      const r2Res = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Sauce',
          baseServings: 2,
          ingredients: [
            { ingredientId: 'milk', displayName: 'Fresh Milk', amount: 100, unit: 'ml' },
            { ingredientId: 'sugar', displayName: 'Fine Sugar', amount: 50, unit: 'g' },
          ],
        });

      const r1Id = r1Res.body.id;
      const r2Id = r2Res.body.id;

      // Request shopping list: Recipe 1 for 4 servings (factor 1), Recipe 2 for 2 servings (factor 1)
      const shoppingReq = [
        { recipeId: r1Id, targetServings: 4 },
        { recipeId: r2Id, targetServings: 2 },
      ];

      const res = await request(app).post('/api/shopping-list').send(shoppingReq);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('shoppingList');
      expect(res.body).toHaveProperty('scaledRecipes');

      const milkItem = res.body.shoppingList.find(
        (i: { ingredientId: string }) => i.ingredientId === 'milk'
      );
      const sugarItem = res.body.shoppingList.find(
        (i: { ingredientId: string }) => i.ingredientId === 'sugar'
      );

      expect(milkItem).toBeDefined();
      expect(milkItem.displayName).toBe('Whole Milk'); // First seen wins
      expect(milkItem.quantity.unit).toBe('ml');
      // 2 cups = ~473.176 ml + 100 ml = ~573.176 ml
      expect(milkItem.quantity.amount).toBeCloseTo(573.176, 3);
      expect(milkItem.sourceRecipeIds).toEqual([r1Id, r2Id]);

      expect(sugarItem).toBeDefined();
      expect(sugarItem.quantity.amount).toBe(150); // 100g + 50g
      expect(sugarItem.quantity.unit).toBe('g');
    });

    it('returns 404 naming the missing recipeId when recipeId does not exist', async () => {
      const r1Res = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Pancakes',
          baseServings: 4,
          ingredients: [{ ingredientId: 'milk', displayName: 'Milk', amount: 1, unit: 'cup' }],
        });

      const missingId = 'non-existent-recipe-999';
      const shoppingReq = [
        { recipeId: r1Res.body.id, targetServings: 4 },
        { recipeId: missingId, targetServings: 2 },
      ];

      const res = await request(app).post('/api/shopping-list').send(shoppingReq);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'NotFound');
      expect(res.body.message).toContain(missingId);
    });

    it('returns 400 when targetServings is invalid (0 or negative)', async () => {
      const r1Res = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Pancakes',
          baseServings: 4,
          ingredients: [{ ingredientId: 'milk', displayName: 'Milk', amount: 1, unit: 'cup' }],
        });

      const res0 = await request(app)
        .post('/api/shopping-list')
        .send([{ recipeId: r1Res.body.id, targetServings: 0 }]);
      expect(res0.status).toBe(400);
      expect(res0.body).toHaveProperty('error', 'InvalidRecipeError');

      const resNeg = await request(app)
        .post('/api/shopping-list')
        .send([{ recipeId: r1Res.body.id, targetServings: -3 }]);
      expect(resNeg.status).toBe(400);
      expect(resNeg.body).toHaveProperty('error', 'InvalidRecipeError');
    });
  });

  describe('PUT /api/recipes/:id & DELETE /api/recipes/:id', () => {
    it('PUT /api/recipes/:id with valid data updates the recipe; GET afterward reflects new values & new ingredient list', async () => {
      const initialRecipe = {
        name: 'Old Pancakes',
        baseServings: 2,
        dietaryTags: ['Vegetarian'],
        ingredients: [{ ingredientId: 'flour', displayName: 'Flour', amount: 1, unit: 'cup' }],
      };

      const createRes = await request(app).post('/api/recipes').send(initialRecipe);
      expect(createRes.status).toBe(201);
      const recipeId = createRes.body.id;

      const updatedPayload = {
        name: 'New Fluffy Waffles',
        baseServings: 6,
        dietaryTags: ['Vegan'],
        ingredients: [
          { ingredientId: 'waffle-mix', displayName: 'Waffle Mix', amount: 500, unit: 'g' },
          { ingredientId: 'water', displayName: 'Water', amount: 300, unit: 'ml' },
          { ingredientId: 'oil', displayName: 'Vegetable Oil', amount: 2, unit: 'tbsp' },
        ],
      };

      const putRes = await request(app).put(`/api/recipes/${recipeId}`).send(updatedPayload);
      expect(putRes.status).toBe(200);
      expect(putRes.body.id).toBe(recipeId);
      expect(putRes.body.name).toBe('New Fluffy Waffles');
      expect(putRes.body.baseServings).toBe(6);
      expect(putRes.body.dietaryTags).toEqual(['Vegan']);
      expect(putRes.body.ingredients).toHaveLength(3);

      const getRes = await request(app).get(`/api/recipes/${recipeId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.name).toBe('New Fluffy Waffles');
      expect(getRes.body.ingredients[0].ingredientId).toBe('waffle-mix');
    });

    it('PUT /api/recipes/:id fully replaces the step list (old steps deleted, new steps persisted in order)', async () => {
      const initialRecipe = {
        name: 'Old Pancakes',
        baseServings: 2,
        ingredients: [{ ingredientId: 'flour', displayName: 'Flour', amount: 1, unit: 'cup' }],
        steps: [{ instruction: 'Old step one.' }, { instruction: 'Old step two.' }],
      };
      const createRes = await request(app).post('/api/recipes').send(initialRecipe);
      const recipeId = createRes.body.id;

      const updatedPayload = {
        name: 'New Fluffy Waffles',
        baseServings: 6,
        ingredients: [
          { ingredientId: 'waffle-mix', displayName: 'Waffle Mix', amount: 500, unit: 'g' },
        ],
        steps: [{ instruction: 'New step one.' }],
      };
      const putRes = await request(app).put(`/api/recipes/${recipeId}`).send(updatedPayload);
      expect(putRes.status).toBe(200);
      expect(putRes.body.steps).toEqual([
        { instruction: 'New step one.', duration: null, temperature: null },
      ]);

      const getRes = await request(app).get(`/api/recipes/${recipeId}`);
      expect(getRes.body.steps).toEqual([
        { instruction: 'New step one.', duration: null, temperature: null },
      ]);
    });

    it('PUT /api/recipes/:id with invalid data (baseServings: 0) returns 400 AND the original recipe is unchanged', async () => {
      const originalRecipe = {
        name: 'Original Safe Recipe',
        baseServings: 4,
        dietaryTags: ['Vegetarian'],
        ingredients: [{ ingredientId: 'milk', displayName: 'Milk', amount: 2, unit: 'cup' }],
      };

      const createRes = await request(app).post('/api/recipes').send(originalRecipe);
      expect(createRes.status).toBe(201);
      const recipeId = createRes.body.id;

      const invalidPayload = {
        name: 'Corrupted Attempt',
        baseServings: 0, // Invalid!
        ingredients: [{ ingredientId: 'milk', displayName: 'Milk', amount: 10, unit: 'cup' }],
      };

      const putRes = await request(app).put(`/api/recipes/${recipeId}`).send(invalidPayload);
      expect(putRes.status).toBe(400);
      expect(putRes.body).toHaveProperty('error', 'InvalidRecipeError');

      // Verify original recipe in DB is completely UNCHANGED
      const getRes = await request(app).get(`/api/recipes/${recipeId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.name).toBe('Original Safe Recipe');
      expect(getRes.body.baseServings).toBe(4);
      expect(getRes.body.ingredients).toHaveLength(1);
      expect(getRes.body.ingredients[0].amount).toBe(2);
    });

    it('PUT /api/recipes/:id for a nonexistent id returns 404', async () => {
      const res = await request(app)
        .put('/api/recipes/non-existent-id-404')
        .send({
          name: 'Ghosts',
          baseServings: 2,
          ingredients: [{ ingredientId: 'air', displayName: 'Air', amount: 1, unit: 'count' }],
        });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'NotFound');
    });

    it('DELETE /api/recipes/:id removes the recipe; subsequent GET returns 404', async () => {
      const recipe = {
        name: 'To Be Deleted',
        baseServings: 2,
        ingredients: [{ ingredientId: 'egg', displayName: 'Egg', amount: 1, unit: 'egg' }],
      };

      const createRes = await request(app).post('/api/recipes').send(recipe);
      const id = createRes.body.id;

      const deleteRes = await request(app).delete(`/api/recipes/${id}`);
      expect(deleteRes.status).toBe(204);

      const getRes = await request(app).get(`/api/recipes/${id}`);
      expect(getRes.status).toBe(404);
    });

    it('DELETE /api/recipes/:id also removes its IngredientLine rows directly in Prisma', async () => {
      const recipe = {
        name: 'Cascade Delete Test Recipe',
        baseServings: 4,
        ingredients: [
          { ingredientId: 'salt', displayName: 'Salt', amount: 1, unit: 'tsp' },
          { ingredientId: 'pepper', displayName: 'Pepper', amount: 1, unit: 'tsp' },
        ],
      };

      const createRes = await request(app).post('/api/recipes').send(recipe);
      const id = createRes.body.id;

      // Verify ingredient lines exist in Prisma DB before delete
      const linesBefore = await prisma.ingredientLine.findMany({ where: { recipeId: id } });
      expect(linesBefore).toHaveLength(2);

      await request(app).delete(`/api/recipes/${id}`);

      // Verify ingredient lines were cascade deleted in Prisma DB
      const linesAfter = await prisma.ingredientLine.findMany({ where: { recipeId: id } });
      expect(linesAfter).toHaveLength(0);
    });

    it('DELETE /api/recipes/:id for a nonexistent id returns 404', async () => {
      const res = await request(app).delete('/api/recipes/non-existent-id-404');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'NotFound');
    });
  });

  describe('POST /api/events/plan', () => {
    it('POST /api/events/plan with a valid guest group and a mix of real created recipes returns 200 with correct eligible servings for EACH recipe', async () => {
      // 1. Create 3 real recipes via POST /api/recipes
      const meatRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Beef Roast',
          baseServings: 6,
          ingredients: [{ ingredientId: 'beef', displayName: 'Beef', amount: 1, unit: 'kg' }],
        });

      const vegRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Mac and Cheese',
          baseServings: 4,
          dietaryTags: ['Vegetarian'],
          ingredients: [{ ingredientId: 'cheese', displayName: 'Cheddar', amount: 200, unit: 'g' }],
        });

      const veganRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Fruit Salad',
          baseServings: 6,
          dietaryTags: ['Vegan'],
          ingredients: [{ ingredientId: 'apple', displayName: 'Apple', amount: 3, unit: 'count' }],
        });

      const meatId = meatRes.body.id;
      const vegId = vegRes.body.id;
      const veganId = veganRes.body.id;

      // 2. Call POST /api/events/plan with 12 total, 3 veg, 1 vegan (9 omnivores, 2 veg-only, 1 vegan)
      const planReq = {
        recipeIds: [meatId, vegId, veganId],
        guestGroup: {
          totalGuests: 12,
          vegetarianCount: 3,
          veganCount: 1,
        },
      };

      const res = await request(app).post('/api/events/plan').send(planReq);

      expect(res.status).toBe(200);
      expect(res.body.guestGroup).toEqual({
        totalGuests: 12,
        vegetarianCount: 3,
        veganCount: 1,
        omnivoreCount: 9,
      });

      expect(res.body.includedRecipes).toHaveLength(3);
      expect(res.body.excludedRecipes).toHaveLength(0);

      const meatPlan = res.body.includedRecipes.find(
        (r: { recipeName: string }) => r.recipeName === 'Beef Roast'
      );
      const vegPlan = res.body.includedRecipes.find(
        (r: { recipeName: string }) => r.recipeName === 'Mac and Cheese'
      );
      const veganPlan = res.body.includedRecipes.find(
        (r: { recipeName: string }) => r.recipeName === 'Fruit Salad'
      );

      expect(meatPlan?.eligibleServings).toBe(9); // 9 omnivores
      expect(vegPlan?.eligibleServings).toBe(11); // 12 total - 1 vegan
      expect(veganPlan?.eligibleServings).toBe(12); // 12 total guests
    });

    it('POST /api/events/plan with an invalid guestGroup returns 400 with error name InvalidGuestGroupError', async () => {
      const meatRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Beef Roast',
          baseServings: 6,
          ingredients: [{ ingredientId: 'beef', displayName: 'Beef', amount: 1, unit: 'kg' }],
        });

      const invalidReq = {
        recipeIds: [meatRes.body.id],
        guestGroup: {
          totalGuests: 10,
          vegetarianCount: 2,
          veganCount: 5, // Invalid! veganCount > vegetarianCount
        },
      };

      const res = await request(app).post('/api/events/plan').send(invalidReq);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'InvalidGuestGroupError');
    });

    it('POST /api/events/plan with a nonexistent recipeId returns 404 naming the missing id', async () => {
      const realRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Beef Roast',
          baseServings: 6,
          ingredients: [{ ingredientId: 'beef', displayName: 'Beef', amount: 1, unit: 'kg' }],
        });

      const missingId = 'non-existent-recipe-id-999';
      const planReq = {
        recipeIds: [realRes.body.id, missingId],
        guestGroup: {
          totalGuests: 10,
          vegetarianCount: 2,
          veganCount: 1,
        },
      };

      const res = await request(app).post('/api/events/plan').send(planReq);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'NotFound');
      expect(res.body.message).toContain(missingId);
    });

    it('POST /api/events/plan with an empty recipeIds array returns 400', async () => {
      const emptyReq = {
        recipeIds: [],
        guestGroup: {
          totalGuests: 10,
          vegetarianCount: 2,
          veganCount: 1,
        },
      };

      const res = await request(app).post('/api/events/plan').send(emptyReq);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'InvalidRecipeError');
    });

    it('POST /api/events/plan correctly excludes a recipe with 0 eligible guests and includes the reason in the response', async () => {
      const meatRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Steak Dinner',
          baseServings: 2,
          ingredients: [{ ingredientId: 'beef', displayName: 'Steak', amount: 2, unit: 'lb' }],
        });

      const allVegReq = {
        recipeIds: [meatRes.body.id],
        guestGroup: {
          totalGuests: 10,
          vegetarianCount: 10, // 100% vegetarian guests
          veganCount: 2,
        },
      };

      const res = await request(app).post('/api/events/plan').send(allVegReq);

      expect(res.status).toBe(200);
      expect(res.body.includedRecipes).toHaveLength(0);
      expect(res.body.excludedRecipes).toHaveLength(1);
      expect(res.body.excludedRecipes[0].recipeName).toBe('Steak Dinner');
      expect(res.body.excludedRecipes[0].reason).toContain('No eligible guests');
      expect(res.body.shoppingList).toHaveLength(0);
    });

    it('POST /api/events/plan shoppingList correctly consolidates ingredients across multiple included recipes', async () => {
      // Group: 10 guests (2 vegetarians, 0 vegans) => 8 omnivores, 2 vegetarians
      // Recipe 1: Meat dish (8 eligible, base 4 => scale 2.0). Needs 500g potatoes
      const r1Res = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Shepherd Pie',
          baseServings: 4,
          ingredients: [
            { ingredientId: 'potato', displayName: 'Russet Potato', amount: 500, unit: 'g' },
          ],
        });

      // Recipe 2: Vegan dish (10 eligible, base 5 => scale 2.0). Needs 1 kg potatoes
      const r2Res = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Mashed Potatoes',
          baseServings: 5,
          dietaryTags: ['Vegan'],
          ingredients: [
            { ingredientId: 'potato', displayName: 'Yukon Potato', amount: 1, unit: 'kg' },
          ],
        });

      const r1Id = r1Res.body.id;
      const r2Id = r2Res.body.id;

      const planReq = {
        recipeIds: [r1Id, r2Id],
        guestGroup: {
          totalGuests: 10,
          vegetarianCount: 2,
          veganCount: 0,
        },
      };

      const res = await request(app).post('/api/events/plan').send(planReq);

      expect(res.status).toBe(200);
      expect(res.body.includedRecipes).toHaveLength(2);
      expect(res.body.shoppingList).toHaveLength(1);

      const potatoItem = res.body.shoppingList[0];
      expect(potatoItem.ingredientId).toBe('potato');
      // 500g * 2.0 = 1000g + (1kg * 2.0 = 2000g) = 3000g
      expect(potatoItem.quantity.amount).toBe(3000);
      expect(potatoItem.quantity.unit).toBe('g');
      expect(potatoItem.sourceRecipeIds).toEqual([r1Id, r2Id]);
    });
  });

  describe('Event CRUD', () => {
    const validGuestGroup = { totalGuests: 10, vegetarianCount: 2, veganCount: 0 };

    it('POST /api/events creates a persisted event and returns the recomputed plan immediately', async () => {
      const recipeRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Beef Roast',
          baseServings: 4,
          ingredients: [{ ingredientId: 'beef', displayName: 'Beef', amount: 1, unit: 'kg' }],
        });

      const res = await request(app)
        .post('/api/events')
        .send({
          name: 'Thanksgiving 2026',
          guestGroup: validGuestGroup,
          recipeIds: [recipeRes.body.id],
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Thanksgiving 2026');
      expect(res.body.guestGroup).toEqual({
        totalGuests: 10,
        vegetarianCount: 2,
        veganCount: 0,
        omnivoreCount: 8,
      });
      expect(res.body.recipeIds).toEqual([recipeRes.body.id]);
      expect(res.body.shoppingListId).toBeNull();
      expect(res.body.droppedRecipeIds).toEqual([]);
      expect(res.body.includedRecipes).toHaveLength(1);
      expect(res.body.includedRecipes[0].eligibleServings).toBe(8);
    });

    it('POST /api/events allows zero recipeIds (menu filled in later)', async () => {
      const res = await request(app)
        .post('/api/events')
        .send({ name: 'Someday BBQ', guestGroup: validGuestGroup, recipeIds: [] });

      expect(res.status).toBe(201);
      expect(res.body.recipeIds).toEqual([]);
      expect(res.body.includedRecipes).toHaveLength(0);
      expect(res.body.excludedRecipes).toHaveLength(0);
    });

    it('POST /api/events with an invalid guestGroup returns 400', async () => {
      const res = await request(app)
        .post('/api/events')
        .send({
          name: 'Bad Event',
          guestGroup: { totalGuests: 10, vegetarianCount: 2, veganCount: 5 },
          recipeIds: [],
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'InvalidGuestGroupError');
    });

    it('POST /api/events with an empty name returns 400', async () => {
      const res = await request(app)
        .post('/api/events')
        .send({ name: '', guestGroup: validGuestGroup, recipeIds: [] });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'InvalidEventError');
    });

    it('GET /api/events returns summary shape only (no recomputed plan fields)', async () => {
      await request(app)
        .post('/api/events')
        .send({ name: 'Event A', guestGroup: validGuestGroup, recipeIds: [] });
      await request(app)
        .post('/api/events')
        .send({ name: 'Event B', guestGroup: validGuestGroup, recipeIds: [] });

      const res = await request(app).get('/api/events');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).not.toHaveProperty('includedRecipes');
      expect(res.body[0]).not.toHaveProperty('shoppingList');
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('name');
      expect(res.body[0]).toHaveProperty('guestGroup');
      expect(res.body[0]).toHaveProperty('recipeIds');
    });

    it('GET /api/events/:id recomputes the plan live from current recipe data', async () => {
      const recipeRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Mac and Cheese',
          baseServings: 4,
          ingredients: [{ ingredientId: 'cheese', displayName: 'Cheddar', amount: 200, unit: 'g' }],
        });

      const createRes = await request(app)
        .post('/api/events')
        .send({
          name: 'Potluck',
          guestGroup: validGuestGroup,
          recipeIds: [recipeRes.body.id],
        });

      // Edit the underlying recipe's base servings — the event's live-recomputed plan
      // should reflect this change without the event itself being touched.
      await request(app)
        .put(`/api/recipes/${recipeRes.body.id}`)
        .send({
          name: 'Mac and Cheese',
          baseServings: 2,
          ingredients: [{ ingredientId: 'cheese', displayName: 'Cheddar', amount: 200, unit: 'g' }],
        });

      const getRes = await request(app).get(`/api/events/${createRes.body.id}`);

      expect(getRes.status).toBe(200);
      // eligibleServings unchanged (still 8 omnivores), but scaled ingredient amount
      // should differ since baseServings changed 4 -> 2 (scale factor 8/4=2 -> 8/2=4).
      expect(getRes.body.includedRecipes[0].scaledIngredients[0].quantity.amount).toBe(800);
    });

    it('GET /api/events/:id drops stale recipe references and reports them in droppedRecipeIds', async () => {
      const recipeRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Temp Recipe',
          baseServings: 4,
          ingredients: [{ ingredientId: 'egg', displayName: 'Egg', amount: 2, unit: 'egg' }],
        });

      const createRes = await request(app)
        .post('/api/events')
        .send({
          name: 'Fragile Plan',
          guestGroup: validGuestGroup,
          recipeIds: [recipeRes.body.id],
        });

      await request(app).delete(`/api/recipes/${recipeRes.body.id}`);

      const getRes = await request(app).get(`/api/events/${createRes.body.id}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.droppedRecipeIds).toEqual([recipeRes.body.id]);
      expect(getRes.body.includedRecipes).toHaveLength(0);
      expect(getRes.body.excludedRecipes).toHaveLength(0);
    });

    it('GET /api/events/:id with a nonexistent id returns 404', async () => {
      const res = await request(app).get('/api/events/non-existent-event-id');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'NotFound');
    });

    it('PUT /api/events/:id updates name/guestGroup/recipeIds and GET afterward reflects new values', async () => {
      const recipeRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Salad',
          baseServings: 4,
          ingredients: [
            { ingredientId: 'lettuce', displayName: 'Lettuce', amount: 1, unit: 'count' },
          ],
        });

      const createRes = await request(app)
        .post('/api/events')
        .send({ name: 'Old Name', guestGroup: validGuestGroup, recipeIds: [] });

      const putRes = await request(app)
        .put(`/api/events/${createRes.body.id}`)
        .send({
          name: 'New Name',
          guestGroup: { totalGuests: 20, vegetarianCount: 4, veganCount: 2 },
          recipeIds: [recipeRes.body.id],
        });

      expect(putRes.status).toBe(200);
      expect(putRes.body.name).toBe('New Name');
      expect(putRes.body.guestGroup.totalGuests).toBe(20);
      expect(putRes.body.recipeIds).toEqual([recipeRes.body.id]);

      const getRes = await request(app).get(`/api/events/${createRes.body.id}`);
      expect(getRes.body.name).toBe('New Name');
    });

    it('PUT /api/events/:id for a nonexistent id returns 404', async () => {
      const res = await request(app)
        .put('/api/events/non-existent-event-id')
        .send({ name: 'X', guestGroup: validGuestGroup, recipeIds: [] });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'NotFound');
    });

    it('DELETE /api/events/:id removes the event; subsequent GET returns 404', async () => {
      const createRes = await request(app)
        .post('/api/events')
        .send({ name: 'To Delete', guestGroup: validGuestGroup, recipeIds: [] });

      const deleteRes = await request(app).delete(`/api/events/${createRes.body.id}`);
      expect(deleteRes.status).toBe(204);

      const getRes = await request(app).get(`/api/events/${createRes.body.id}`);
      expect(getRes.status).toBe(404);
    });

    it('DELETE /api/events/:id for a nonexistent id returns 404', async () => {
      const res = await request(app).delete('/api/events/non-existent-event-id');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'NotFound');
    });
  });

  describe('ShoppingList CRUD', () => {
    it('POST /api/shopping-lists creates a standalone persisted list (eventId null) with checked defaulting to false', async () => {
      const recipeRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Pancakes',
          baseServings: 4,
          ingredients: [{ ingredientId: 'flour', displayName: 'Flour', amount: 100, unit: 'g' }],
        });

      const res = await request(app)
        .post('/api/shopping-lists')
        .send({
          name: 'Weekly Groceries',
          sourceItems: [{ recipeId: recipeRes.body.id, targetServings: 8 }],
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Weekly Groceries');
      expect(res.body.eventId).toBeNull();
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toHaveProperty('id');
      expect(res.body.items[0].checked).toBe(false);
      expect(res.body.items[0].quantity.amount).toBe(200); // 100g * (8/4 scale)
    });

    it('POST /api/shopping-lists rejects an empty name', async () => {
      const res = await request(app)
        .post('/api/shopping-lists')
        .send({ name: '', sourceItems: [] });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'InvalidShoppingListError');
    });

    it('POST /api/shopping-lists with a nonexistent recipeId returns 404', async () => {
      const res = await request(app)
        .post('/api/shopping-lists')
        .send({ name: 'List', sourceItems: [{ recipeId: 'missing-id', targetServings: 2 }] });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'NotFound');
    });

    it('GET /api/shopping-lists returns all lists with items included', async () => {
      await request(app).post('/api/shopping-lists').send({ name: 'List A', sourceItems: [] });
      await request(app).post('/api/shopping-lists').send({ name: 'List B', sourceItems: [] });

      const res = await request(app).get('/api/shopping-lists');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty('items');
    });

    it('GET /api/shopping-lists/:id with a nonexistent id returns 404', async () => {
      const res = await request(app).get('/api/shopping-lists/non-existent-list-id');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'NotFound');
    });

    it('DELETE /api/shopping-lists/:id removes the list; subsequent GET returns 404', async () => {
      const createRes = await request(app)
        .post('/api/shopping-lists')
        .send({ name: 'To Delete', sourceItems: [] });

      const deleteRes = await request(app).delete(`/api/shopping-lists/${createRes.body.id}`);
      expect(deleteRes.status).toBe(204);

      const getRes = await request(app).get(`/api/shopping-lists/${createRes.body.id}`);
      expect(getRes.status).toBe(404);
    });

    it('PATCH /api/shopping-lists/:listId/items/:itemId toggles checked without resending the whole list', async () => {
      const recipeRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Eggs',
          baseServings: 2,
          ingredients: [{ ingredientId: 'egg', displayName: 'Egg', amount: 2, unit: 'egg' }],
        });

      const listRes = await request(app)
        .post('/api/shopping-lists')
        .send({
          name: 'Breakfast List',
          sourceItems: [{ recipeId: recipeRes.body.id, targetServings: 2 }],
        });

      const itemId = listRes.body.items[0].id;

      const patchRes = await request(app)
        .patch(`/api/shopping-lists/${listRes.body.id}/items/${itemId}`)
        .send({ checked: true });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body).toEqual({ id: itemId, checked: true });

      const getRes = await request(app).get(`/api/shopping-lists/${listRes.body.id}`);
      expect(getRes.body.items[0].checked).toBe(true);
    });

    it('PATCH /api/shopping-lists/:listId/items/:itemId returns 404 for a mismatched list/item pair', async () => {
      const recipeRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Eggs',
          baseServings: 2,
          ingredients: [{ ingredientId: 'egg', displayName: 'Egg', amount: 2, unit: 'egg' }],
        });

      const listA = await request(app)
        .post('/api/shopping-lists')
        .send({
          name: 'List A',
          sourceItems: [{ recipeId: recipeRes.body.id, targetServings: 2 }],
        });
      const listB = await request(app)
        .post('/api/shopping-lists')
        .send({ name: 'List B', sourceItems: [] });

      const itemFromListA = listA.body.items[0].id;

      const res = await request(app)
        .patch(`/api/shopping-lists/${listB.body.id}/items/${itemFromListA}`)
        .send({ checked: true });

      expect(res.status).toBe(404);
    });
  });

  describe('Ingredient Category Overrides', () => {
    it('PUT /api/ingredient-categories/:ingredientId rejects an unknown category', async () => {
      const res = await request(app)
        .put('/api/ingredient-categories/flour')
        .send({ category: 'Not A Real Category' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'InvalidShoppingListError');
    });

    it('a saved override corrects category everywhere: preview, saved list, and event plan', async () => {
      const recipeRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Bread',
          baseServings: 4,
          ingredients: [{ ingredientId: 'flour', displayName: 'Flour', amount: 500, unit: 'g' }],
        });
      const recipeId = recipeRes.body.id;

      // Default heuristic: "flour" falls under Pantry Staples.
      const beforePreview = await request(app)
        .post('/api/shopping-list')
        .send([{ recipeId, targetServings: 4 }]);
      expect(beforePreview.body.shoppingList[0].category).toBe('Pantry Staples');

      const putRes = await request(app)
        .put('/api/ingredient-categories/flour')
        .send({ category: 'Bakery' });
      expect(putRes.status).toBe(200);
      expect(putRes.body).toEqual({ ingredientId: 'flour', category: 'Bakery' });

      // Ephemeral shopping-list preview picks up the override.
      const afterPreview = await request(app)
        .post('/api/shopping-list')
        .send([{ recipeId, targetServings: 4 }]);
      expect(afterPreview.body.shoppingList[0].category).toBe('Bakery');

      // Ephemeral event-plan preview picks up the override too.
      const eventPlanRes = await request(app)
        .post('/api/events/plan')
        .send({
          recipeIds: [recipeId],
          guestGroup: { totalGuests: 4, vegetarianCount: 0, veganCount: 0 },
        });
      expect(eventPlanRes.body.shoppingList[0].category).toBe('Bakery');

      // A shopping list saved AFTER the override reflects it immediately, and is flagged
      // as overridden so the client knows to offer a "reset to default" control.
      const listRes = await request(app)
        .post('/api/shopping-lists')
        .send({ name: 'Bread List', sourceItems: [{ recipeId, targetServings: 4 }] });
      expect(listRes.body.items[0].category).toBe('Bakery');
      expect(listRes.body.items[0].categoryIsOverridden).toBe(true);

      // Clearing the override reverts every read path to the heuristic, including that
      // already-saved list — category is always resolved fresh, never persisted onto the row.
      const deleteRes = await request(app).delete('/api/ingredient-categories/flour');
      expect(deleteRes.status).toBe(204);

      const listAfterClear = await request(app).get(`/api/shopping-lists/${listRes.body.id}`);
      expect(listAfterClear.body.items[0].category).toBe('Pantry Staples');
      expect(listAfterClear.body.items[0].categoryIsOverridden).toBe(false);
    });

    it('DELETE /api/ingredient-categories/:ingredientId is idempotent for an ingredient with no override', async () => {
      const res = await request(app).delete('/api/ingredient-categories/never-overridden');
      expect(res.status).toBe(204);
    });
  });

  describe('Pantry Inventory Subtraction', () => {
    it('PUT /api/pantry/:ingredientId sets on-hand stock; GET /api/pantry lists it', async () => {
      const putRes = await request(app)
        .put('/api/pantry/flour')
        .send({ displayName: 'Flour', amount: 200, unit: 'g' });

      expect(putRes.status).toBe(200);
      expect(putRes.body).toEqual({
        ingredientId: 'flour',
        displayName: 'Flour',
        quantity: { amount: 200, unit: 'g', category: 'Mass' },
      });

      const listRes = await request(app).get('/api/pantry');
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0].ingredientId).toBe('flour');
    });

    it('PUT /api/pantry/:ingredientId rejects an invalid unit', async () => {
      const res = await request(app)
        .put('/api/pantry/flour')
        .send({ displayName: 'Flour', amount: 200, unit: 'not-a-unit' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'InvalidUnitError');
    });

    it('DELETE /api/pantry/:ingredientId is idempotent for an ingredient with no stock', async () => {
      const res = await request(app).delete('/api/pantry/never-stocked');
      expect(res.status).toBe(204);
    });

    it('reduces a shopping-list preview item partially covered by pantry stock', async () => {
      const recipeRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Bread',
          baseServings: 4,
          ingredients: [{ ingredientId: 'flour', displayName: 'Flour', amount: 500, unit: 'g' }],
        });

      await request(app)
        .put('/api/pantry/flour')
        .send({ displayName: 'Flour', amount: 200, unit: 'g' });

      const previewRes = await request(app)
        .post('/api/shopping-list')
        .send([{ recipeId: recipeRes.body.id, targetServings: 4 }]);

      expect(previewRes.body.shoppingList).toHaveLength(1);
      expect(previewRes.body.shoppingList[0].quantity.amount).toBe(300);
    });

    it('omits an item entirely from a saved shopping list when pantry stock fully covers it', async () => {
      const recipeRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Bread',
          baseServings: 4,
          ingredients: [
            { ingredientId: 'flour', displayName: 'Flour', amount: 200, unit: 'g' },
            { ingredientId: 'salt', displayName: 'Salt', amount: 5, unit: 'g' },
          ],
        });

      await request(app)
        .put('/api/pantry/flour')
        .send({ displayName: 'Flour', amount: 500, unit: 'g' });

      const listRes = await request(app)
        .post('/api/shopping-lists')
        .send({
          name: 'Bread List',
          sourceItems: [{ recipeId: recipeRes.body.id, targetServings: 4 }],
        });

      expect(listRes.status).toBe(201);
      expect(listRes.body.items).toHaveLength(1);
      expect(listRes.body.items[0].ingredientId).toBe('salt');
    });

    it("reduces an event plan's embedded shopping list too (POST /api/events/plan)", async () => {
      const recipeRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Bread',
          baseServings: 4,
          ingredients: [{ ingredientId: 'flour', displayName: 'Flour', amount: 500, unit: 'g' }],
        });

      await request(app)
        .put('/api/pantry/flour')
        .send({ displayName: 'Flour', amount: 500, unit: 'g' });

      const planRes = await request(app)
        .post('/api/events/plan')
        .send({
          recipeIds: [recipeRes.body.id],
          guestGroup: { totalGuests: 4, vegetarianCount: 0, veganCount: 0 },
        });

      expect(planRes.body.shoppingList).toHaveLength(0);
    });

    it('leaves an item untouched when pantry stock is recorded in an incompatible unit/category', async () => {
      const recipeRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Bread',
          baseServings: 4,
          ingredients: [{ ingredientId: 'butter', displayName: 'Butter', amount: 200, unit: 'g' }],
        });

      await request(app)
        .put('/api/pantry/butter')
        .send({ displayName: 'Butter', amount: 1, unit: 'cup' });

      const previewRes = await request(app)
        .post('/api/shopping-list')
        .send([{ recipeId: recipeRes.body.id, targetServings: 4 }]);

      expect(previewRes.body.shoppingList).toHaveLength(1);
      expect(previewRes.body.shoppingList[0].quantity.amount).toBe(200);
    });
  });

  describe('Event-linked ShoppingList', () => {
    const validGuestGroup = { totalGuests: 8, vegetarianCount: 0, veganCount: 0 };

    it('PUT /api/events/:eventId/shopping-list creates a linked list on first call, and regenerating discards prior checked state', async () => {
      const recipeRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Chili',
          baseServings: 4,
          ingredients: [{ ingredientId: 'beans', displayName: 'Beans', amount: 400, unit: 'g' }],
        });

      const eventRes = await request(app)
        .post('/api/events')
        .send({
          name: 'Chili Night',
          guestGroup: validGuestGroup,
          recipeIds: [recipeRes.body.id],
        });

      const firstSave = await request(app).put(`/api/events/${eventRes.body.id}/shopping-list`);
      expect(firstSave.status).toBe(200);
      expect(firstSave.body.eventId).toBe(eventRes.body.id);
      expect(firstSave.body.name).toBe('Chili Night'); // defaults to event name
      expect(firstSave.body.items).toHaveLength(1);

      // Standalone GET confirms it's a first-class, independently fetchable ShoppingList
      const standaloneGet = await request(app).get(`/api/shopping-lists/${firstSave.body.id}`);
      expect(standaloneGet.status).toBe(200);
      expect(standaloneGet.body.eventId).toBe(eventRes.body.id);

      // Check an item, then regenerate — checked state should reset
      const itemId = firstSave.body.items[0].id;
      await request(app)
        .patch(`/api/shopping-lists/${firstSave.body.id}/items/${itemId}`)
        .send({ checked: true });

      const regenerated = await request(app).put(`/api/events/${eventRes.body.id}/shopping-list`);
      expect(regenerated.status).toBe(200);
      expect(regenerated.body.items[0].checked).toBe(false);
      // The list itself was deleted and recreated, so it has a fresh id
      expect(regenerated.body.id).not.toBe(firstSave.body.id);

      // The event now reports the fresh shoppingListId
      const eventGet = await request(app).get(`/api/events/${eventRes.body.id}`);
      expect(eventGet.body.shoppingListId).toBe(regenerated.body.id);
    });

    it('PUT /api/events/:eventId/shopping-list accepts an explicit name override', async () => {
      const eventRes = await request(app)
        .post('/api/events')
        .send({ name: 'Default Name Event', guestGroup: validGuestGroup, recipeIds: [] });

      const res = await request(app)
        .put(`/api/events/${eventRes.body.id}/shopping-list`)
        .send({ name: 'Custom List Name' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Custom List Name');
    });

    it('PUT /api/events/:eventId/shopping-list for a nonexistent event returns 404', async () => {
      const res = await request(app).put('/api/events/non-existent-event-id/shopping-list');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'NotFound');
    });

    it('DELETE /api/events/:id cascades its linked ShoppingList', async () => {
      const eventRes = await request(app)
        .post('/api/events')
        .send({ name: 'Cascade Test', guestGroup: validGuestGroup, recipeIds: [] });

      const listRes = await request(app).put(`/api/events/${eventRes.body.id}/shopping-list`);

      await request(app).delete(`/api/events/${eventRes.body.id}`);

      const getListRes = await request(app).get(`/api/shopping-lists/${listRes.body.id}`);
      expect(getListRes.status).toBe(404);
    });
  });
});
