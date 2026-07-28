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
    });

    expect(geminiClientModule.parseRecipeTextWithGemini).toHaveBeenCalledWith(
      'Spaghetti Carbonara recipe text...'
    );
    expect(geminiClientModule.parseRecipeTextWithGemini).toHaveBeenCalledTimes(1);
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
