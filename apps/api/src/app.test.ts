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
      await prisma.$executeRawUnsafe('DELETE FROM IngredientLine');
      await prisma.$executeRawUnsafe('DELETE FROM Recipe');
    } catch {
      // Table creation handled by initial migration/db push
    }
  });

  beforeEach(async () => {
    // Clean database before each test
    await prisma.ingredientLine.deleteMany();
    await prisma.recipe.deleteMany();
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
});
