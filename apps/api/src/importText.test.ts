import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from './app.js';
import { prisma } from './prisma.js';
import * as geminiClientModule from './geminiClient.js';

// Mock geminiClient module so tests never make real network API calls
vi.mock('./geminiClient.js', () => ({
  parseRecipeTextWithGemini: vi.fn(),
  parseRecipeTextWithGeminiTimeout: vi.fn(),
}));

describe('POST /api/recipes/import-text', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;

  beforeEach(async () => {
    vi.resetAllMocks();
    process.env.GEMINI_API_KEY = 'test-mock-key';
    // Clean test database before each test
    await prisma.ingredientLine.deleteMany();
    await prisma.recipe.deleteMany();
  });

  afterAll(() => {
    process.env.GEMINI_API_KEY = originalApiKey;
  });

  it('returns 200 with correctly parsed draft for valid mocked Gemini response', async () => {
    const validRecipeJSON = JSON.stringify({
      name: 'Spaghetti Carbonara',
      baseServings: 4,
      dietaryTags: [],
      ingredients: [
        { ingredientId: 'spaghetti', displayName: 'Spaghetti', amount: 400, unit: 'g' },
        { ingredientId: 'egg', displayName: 'Egg', amount: 4, unit: 'egg' },
      ],
      instructions: [
        { instruction: 'Boil the spaghetti.' },
        {
          instruction: 'Toss with egg and cheese off the heat.',
          duration: { amount: 2, unit: 'minutes' },
        },
      ],
    });

    vi.mocked(geminiClientModule.parseRecipeTextWithGemini).mockResolvedValue(validRecipeJSON);

    const response = await request(app)
      .post('/api/recipes/import-text')
      .send({ text: 'Spaghetti Carbonara recipe text...' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      name: 'Spaghetti Carbonara',
      baseServings: 4,
      dietaryTags: [],
      ingredients: [
        { ingredientId: 'spaghetti', displayName: 'Spaghetti', amount: 400, unit: 'g' },
        { ingredientId: 'egg', displayName: 'Egg', amount: 4, unit: 'egg' },
      ],
      instructions: [
        { instruction: 'Boil the spaghetti.', duration: null, temperature: null, notes: null },
        {
          instruction: 'Toss with egg and cheese off the heat.',
          duration: { amount: 2, unit: 'minutes' },
          temperature: null,
          notes: null,
        },
      ],
    });

    expect(geminiClientModule.parseRecipeTextWithGemini).toHaveBeenCalledWith(
      'Spaghetti Carbonara recipe text...',
      false
    );
    expect(geminiClientModule.parseRecipeTextWithGemini).toHaveBeenCalledTimes(1);
  });

  it('accepts a legacy bare-string instructions array as a defensive fallback (no duration/temperature)', async () => {
    const validRecipeJSON = JSON.stringify({
      name: 'Simple Toast',
      baseServings: 1,
      dietaryTags: [],
      ingredients: [{ ingredientId: 'bread', displayName: 'Bread', amount: 2, unit: 'count' }],
      instructions: ['Toast the bread.'],
    });

    vi.mocked(geminiClientModule.parseRecipeTextWithGemini).mockResolvedValue(validRecipeJSON);

    const response = await request(app)
      .post('/api/recipes/import-text')
      .send({ text: 'Simple Toast recipe text...' });

    expect(response.status).toBe(200);
    expect(response.body.instructions).toEqual([
      { instruction: 'Toast the bread.', duration: null, temperature: null, notes: null },
    ]);
  });

  it('extracts an optional per-step notes string when present in the Gemini draft', async () => {
    const validRecipeJSON = JSON.stringify({
      name: 'Baked Chicken',
      baseServings: 4,
      dietaryTags: [],
      ingredients: [{ ingredientId: 'chicken', displayName: 'Chicken', amount: 500, unit: 'g' }],
      instructions: [
        {
          instruction: 'Bake until cooked through.',
          notes: 'Tent with foil if browning too quickly.',
        },
        { instruction: 'Let rest before serving.' },
      ],
    });

    vi.mocked(geminiClientModule.parseRecipeTextWithGemini).mockResolvedValue(validRecipeJSON);

    const response = await request(app)
      .post('/api/recipes/import-text')
      .send({ text: 'Baked Chicken recipe text...' });

    expect(response.status).toBe(200);
    expect(response.body.instructions).toEqual([
      {
        instruction: 'Bake until cooked through.',
        duration: null,
        temperature: null,
        notes: 'Tent with foil if browning too quickly.',
      },
      { instruction: 'Let rest before serving.', duration: null, temperature: null, notes: null },
    ]);
  });

  it('returns 400 when text is empty or missing', async () => {
    const responseEmpty = await request(app).post('/api/recipes/import-text').send({ text: '   ' });

    expect(responseEmpty.status).toBe(400);
    expect(responseEmpty.body.error).toBe('BadRequest');

    const responseMissing = await request(app).post('/api/recipes/import-text').send({});

    expect(responseMissing.status).toBe(400);
    expect(responseMissing.body.error).toBe('BadRequest');

    expect(geminiClientModule.parseRecipeTextWithGemini).not.toHaveBeenCalled();
  });

  it('returns 500 when GEMINI_API_KEY is not configured', async () => {
    delete process.env.GEMINI_API_KEY;

    const response = await request(app)
      .post('/api/recipes/import-text')
      .send({ text: 'Some recipe text' });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('ServerConfigurationError');
    expect(geminiClientModule.parseRecipeTextWithGemini).not.toHaveBeenCalled();
  });

  it('returns 502 when Gemini response returns malformed/non-JSON text', async () => {
    vi.mocked(geminiClientModule.parseRecipeTextWithGemini).mockResolvedValue(
      'Sorry, I cannot parse this text.'
    );

    const response = await request(app)
      .post('/api/recipes/import-text')
      .send({ text: 'Some bad text' });

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('BadGateway');
    expect(response.body.message).toContain('invalid JSON');
    // Invalid JSON is a different, pre-existing failure mode — not retried.
    expect(geminiClientModule.parseRecipeTextWithGemini).toHaveBeenCalledTimes(1);
  });

  it('does not retry when Gemini returns the NoRecipeFound shape', async () => {
    vi.mocked(geminiClientModule.parseRecipeTextWithGemini).mockResolvedValue(
      JSON.stringify({
        error: 'NoRecipeFound',
        message: 'The provided image or text does not contain explicit recipe ingredients.',
      })
    );

    const response = await request(app)
      .post('/api/recipes/import-text')
      .send({ text: 'This is just a grocery store review, not a recipe.' });

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('ExtractionError');
    // NoRecipeFound is already a correct, intentional response — retrying would waste a call.
    expect(geminiClientModule.parseRecipeTextWithGemini).toHaveBeenCalledTimes(1);
  });

  it('retries once and returns 200 when the first response has a malformed shape but the retry is valid (issue #1)', async () => {
    const malformedShapeJSON = JSON.stringify({
      name: 'Grandma Pancakes skin-free baseServings 4 dietaryTags Vegetarian ingredients: flour 2 cup, egg 2 egg, milk 300 ml.',
    });
    const validRecipeJSON = JSON.stringify({
      name: 'Grandma Pancakes',
      baseServings: 4,
      dietaryTags: ['Vegetarian'],
      ingredients: [
        { ingredientId: 'flour', displayName: 'Flour', amount: 2, unit: 'cup' },
        { ingredientId: 'egg', displayName: 'Egg', amount: 2, unit: 'egg' },
        { ingredientId: 'milk', displayName: 'Milk', amount: 300, unit: 'ml' },
      ],
      instructions: [],
    });

    vi.mocked(geminiClientModule.parseRecipeTextWithGemini)
      .mockResolvedValueOnce(malformedShapeJSON)
      .mockResolvedValueOnce(validRecipeJSON);

    const response = await request(app)
      .post('/api/recipes/import-text')
      .send({ text: 'Grandma Pancakes recipe text...' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Grandma Pancakes');
    expect(response.body.ingredients).toHaveLength(3);

    expect(geminiClientModule.parseRecipeTextWithGemini).toHaveBeenCalledTimes(2);
    expect(geminiClientModule.parseRecipeTextWithGemini).toHaveBeenNthCalledWith(
      1,
      'Grandma Pancakes recipe text...',
      false
    );
    expect(geminiClientModule.parseRecipeTextWithGemini).toHaveBeenNthCalledWith(
      2,
      'Grandma Pancakes recipe text...',
      true
    );
  });

  it('returns 502 ExtractionError when Gemini returns a malformed shape on both attempts (issue #1)', async () => {
    const malformedShapeJSON = JSON.stringify({
      name: 'Everything crammed into one string: 2 cups flour, 1 egg, bake 350F 20min',
    });

    vi.mocked(geminiClientModule.parseRecipeTextWithGemini).mockResolvedValue(malformedShapeJSON);

    const response = await request(app)
      .post('/api/recipes/import-text')
      .send({ text: 'Some recipe text that keeps confusing the model' });

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('ExtractionError');
    expect(response.body.message).toMatch(/incomplete recipe draft|retrying/i);
    expect(geminiClientModule.parseRecipeTextWithGemini).toHaveBeenCalledTimes(2);
  });

  it('returns 502 when Gemini API network call fails', async () => {
    vi.mocked(geminiClientModule.parseRecipeTextWithGemini).mockRejectedValue(
      new Error('Network timeout')
    );

    const response = await request(app)
      .post('/api/recipes/import-text')
      .send({ text: 'Recipe text' });

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('BadGateway');
    expect(response.body.message).toContain('Network timeout');
  });

  it('returns 422 with domain error when Gemini returns an invalid unit (e.g. "pinch")', async () => {
    const invalidUnitJSON = JSON.stringify({
      name: 'Salad with pinch of salt',
      baseServings: 2,
      dietaryTags: ['Vegetarian'],
      ingredients: [{ ingredientId: 'salt', displayName: 'Salt', amount: 1, unit: 'pinch' }],
    });

    vi.mocked(geminiClientModule.parseRecipeTextWithGemini).mockResolvedValue(invalidUnitJSON);

    const response = await request(app)
      .post('/api/recipes/import-text')
      .send({ text: 'Salad recipe...' });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('InvalidUnitError');
    expect(response.body.message).toContain('pinch');
    // A well-shaped candidate with a bad value is a domain error, not an extraction failure —
    // hasMinimalRecipeShape() passes on the first attempt, so no retry happens.
    expect(geminiClientModule.parseRecipeTextWithGemini).toHaveBeenCalledTimes(1);
  });

  it('returns 422 when Gemini returns invalid baseServings (e.g. 0)', async () => {
    const invalidServingsJSON = JSON.stringify({
      name: 'Zero Serving Feast',
      baseServings: 0,
      dietaryTags: [],
      ingredients: [{ ingredientId: 'rice', displayName: 'Rice', amount: 100, unit: 'g' }],
    });

    vi.mocked(geminiClientModule.parseRecipeTextWithGemini).mockResolvedValue(invalidServingsJSON);

    const response = await request(app)
      .post('/api/recipes/import-text')
      .send({ text: 'Zero servings recipe...' });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('InvalidRecipeError');
    expect(response.body.message).toMatch(/servings/i);
    expect(geminiClientModule.parseRecipeTextWithGemini).toHaveBeenCalledTimes(1);
  });

  it('CRITICAL: verifies NOTHING is persisted to the database before or after a successful import call', async () => {
    const initialCount = await prisma.recipe.count();
    expect(initialCount).toBe(0);

    const validRecipeJSON = JSON.stringify({
      name: 'Non-persisted Test Recipe',
      baseServings: 4,
      dietaryTags: ['Vegan'],
      ingredients: [{ ingredientId: 'tofu', displayName: 'Tofu', amount: 200, unit: 'g' }],
    });

    vi.mocked(geminiClientModule.parseRecipeTextWithGemini).mockResolvedValue(validRecipeJSON);

    const response = await request(app)
      .post('/api/recipes/import-text')
      .send({ text: 'Tofu recipe text' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Non-persisted Test Recipe');

    const postCallCount = await prisma.recipe.count();
    expect(postCallCount).toBe(0);
  });

  it('verifies real Gemini client is mocked and never performs a network request during tests', () => {
    expect(vi.isMockFunction(geminiClientModule.parseRecipeTextWithGemini)).toBe(true);
  });
});
