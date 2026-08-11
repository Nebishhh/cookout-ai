import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from './app.js';
import { prisma } from './prisma.js';
import * as geminiClient from './geminiClient.js';

// Valid 1x1 image buffers with correct magic bytes
// JPEG header: FF D8 FF E0 00 10 4A 46 49 46 00 01
const VALID_JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9,
]);

// PNG header: 89 50 4E 47 0D 0A 1A 0A
const VALID_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

// WebP header: RIFF .... WEBP
const VALID_WEBP_BUFFER = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
  0x0d, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00, 0x00, 0x07, 0x88, 0x85, 0x85, 0x88,
]);

const MOCK_VALID_GEMINI_RECIPE_JSON = JSON.stringify({
  name: "Grandma's Blueberry Muffins",
  baseServings: 12,
  dietaryTags: ['Vegetarian'],
  ingredients: [
    { ingredientId: 'flour', displayName: 'All-Purpose Flour', amount: 2, unit: 'cup' },
    { ingredientId: 'blueberries', displayName: 'Fresh Blueberries', amount: 1, unit: 'cup' },
    { ingredientId: 'egg', displayName: 'Large Egg', amount: 2, unit: 'egg' },
  ],
});

describe('POST /api/recipes/import-image & Image Extractor Tests', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;

  beforeEach(async () => {
    process.env.GEMINI_API_KEY = 'test-fake-gemini-api-key';
    await prisma.ingredientLine.deleteMany();
    await prisma.recipe.deleteMany();
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalApiKey;
    vi.restoreAllMocks();
  });

  it('1. returns 200 OK with parsed recipe draft for valid JPEG image upload', async () => {
    vi.spyOn(geminiClient, 'parseRecipeImageWithGeminiTimeout').mockResolvedValue(
      MOCK_VALID_GEMINI_RECIPE_JSON
    );

    const res = await request(app)
      .post('/api/recipes/import-image')
      .attach('file', VALID_JPEG_BUFFER, {
        filename: 'recipe_card.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      name: "Grandma's Blueberry Muffins",
      baseServings: 12,
      dietaryTags: ['Vegetarian'],
      ingredients: [
        { ingredientId: 'flour', displayName: 'All-Purpose Flour', amount: 2, unit: 'cup' },
        { ingredientId: 'blueberries', displayName: 'Fresh Blueberries', amount: 1, unit: 'cup' },
        { ingredientId: 'egg', displayName: 'Large Egg', amount: 2, unit: 'egg' },
      ],
    });
  });

  it('2. returns 200 OK with parsed recipe draft for valid PNG image upload', async () => {
    vi.spyOn(geminiClient, 'parseRecipeImageWithGeminiTimeout').mockResolvedValue(
      MOCK_VALID_GEMINI_RECIPE_JSON
    );

    const res = await request(app)
      .post('/api/recipes/import-image')
      .attach('file', VALID_PNG_BUFFER, { filename: 'recipe_page.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Grandma's Blueberry Muffins");
    expect(res.body.ingredients).toHaveLength(3);
  });

  it('3. returns 200 OK with parsed recipe draft for valid WebP image upload', async () => {
    vi.spyOn(geminiClient, 'parseRecipeImageWithGeminiTimeout').mockResolvedValue(
      MOCK_VALID_GEMINI_RECIPE_JSON
    );

    const res = await request(app)
      .post('/api/recipes/import-image')
      .attach('file', VALID_WEBP_BUFFER, { filename: 'recipe.webp', contentType: 'image/webp' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Grandma's Blueberry Muffins");
  });

  it('4. returns 400 BadRequest when request is not multipart/form-data', async () => {
    const res = await request(app)
      .post('/api/recipes/import-image')
      .send({ text: 'not a multipart stream' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'BadRequest',
      message: 'Content-Type must be multipart/form-data.',
    });
  });

  it('5. returns 400 BadRequest when no image file field is present in multipart payload', async () => {
    const res = await request(app)
      .post('/api/recipes/import-image')
      .field('someField', 'someValue');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BadRequest');
    expect(res.body.message).toMatch(/no image file provided/i);
  });

  it('6. returns 400 InvalidFileError when uploaded file is zero bytes (empty file)', async () => {
    const emptyBuffer = Buffer.alloc(0);

    const res = await request(app)
      .post('/api/recipes/import-image')
      .attach('file', emptyBuffer, { filename: 'empty.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'InvalidFileError',
      message: 'Uploaded file is empty (0 bytes).',
    });
  });

  it('7. returns 400 InvalidFileError when file extension is .jpg/.png but byte signature is disallowed (e.g. text/pdf content)', async () => {
    const fakeTextBuffer = Buffer.from('Plain text file masquerading as an image card.');

    const res = await request(app)
      .post('/api/recipes/import-image')
      .attach('file', fakeTextBuffer, { filename: 'fake_recipe.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('InvalidFileError');
    expect(res.body.message).toMatch(/disallowed/i);
  });

  it('8. returns 400 FileTooLargeError when uploaded file exceeds 8MB size limit', async () => {
    // 8MB + 1KB buffer
    const oversizedBuffer = Buffer.alloc(8 * 1024 * 1024 + 1024);
    // Write valid JPEG header at beginning
    oversizedBuffer[0] = 0xff;
    oversizedBuffer[1] = 0xd8;
    oversizedBuffer[2] = 0xff;

    const res = await request(app)
      .post('/api/recipes/import-image')
      .attach('file', oversizedBuffer, { filename: 'giant_image.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'FileTooLargeError',
      message: 'Uploaded file exceeds 8MB size limit.',
    });
  });

  it('9. returns 500 InternalServerError when GEMINI_API_KEY is not configured', async () => {
    delete process.env.GEMINI_API_KEY;

    vi.spyOn(geminiClient, 'parseRecipeImageWithGeminiTimeout').mockRejectedValue(
      new Error('GEMINI_API_KEY is not configured on the server.')
    );

    const res = await request(app)
      .post('/api/recipes/import-image')
      .attach('file', VALID_JPEG_BUFFER, { filename: 'recipe.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: 'InternalServerError',
      message: 'GEMINI_API_KEY is not configured on the server.',
    });
  });

  it('10. returns 502 BadGateway when Gemini API call fails or times out past 30 seconds', async () => {
    vi.spyOn(geminiClient, 'parseRecipeImageWithGeminiTimeout').mockRejectedValue(
      new Error('Gemini API request timed out after 30 seconds.')
    );

    const res = await request(app)
      .post('/api/recipes/import-image')
      .attach('file', VALID_PNG_BUFFER, { filename: 'recipe.png', contentType: 'image/png' });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: 'BadGateway',
      message: 'Gemini API request timed out after 30 seconds.',
    });
  });

  it('11. returns 502 ExtractionError when Gemini response returns malformed non-JSON text', async () => {
    vi.spyOn(geminiClient, 'parseRecipeImageWithGeminiTimeout').mockResolvedValue(
      'Sorry, I could not parse this photo into JSON format.'
    );

    const res = await request(app)
      .post('/api/recipes/import-image')
      .attach('file', VALID_JPEG_BUFFER, { filename: 'recipe.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: 'ExtractionError',
      message: 'Gemini returned malformed or non-JSON response text.',
    });
  });

  it('12. returns 502 ExtractionError when Gemini returns NoRecipeFound error response (non-recipe / blurry image)', async () => {
    vi.spyOn(geminiClient, 'parseRecipeImageWithGeminiTimeout').mockResolvedValue(
      JSON.stringify({
        error: 'NoRecipeFound',
        message: 'The provided image does not contain explicit recipe ingredients or quantities.',
      })
    );

    const res = await request(app)
      .post('/api/recipes/import-image')
      .attach('file', VALID_JPEG_BUFFER, { filename: 'blur.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: 'ExtractionError',
      message: 'The provided image does not contain explicit recipe ingredients or quantities.',
    });
  });

  it('13. returns 422 with domain error when Gemini returns invalid unit (e.g. "pinch")', async () => {
    vi.spyOn(geminiClient, 'parseRecipeImageWithGeminiTimeout').mockResolvedValue(
      JSON.stringify({
        name: 'Salted Butter',
        baseServings: 2,
        dietaryTags: [],
        ingredients: [{ ingredientId: 'salt', displayName: 'Salt', amount: 1, unit: 'pinch' }],
      })
    );

    const res = await request(app)
      .post('/api/recipes/import-image')
      .attach('file', VALID_PNG_BUFFER, { filename: 'recipe.png', contentType: 'image/png' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('InvalidUnitError');
    expect(res.body.message).toMatch(/invalid or unsupported unit: "pinch"/i);
  });

  it('14. returns 422 with domain error when Gemini returns invalid baseServings (e.g. 0)', async () => {
    vi.spyOn(geminiClient, 'parseRecipeImageWithGeminiTimeout').mockResolvedValue(
      JSON.stringify({
        name: 'Invalid Servings Pie',
        baseServings: 0,
        dietaryTags: [],
        ingredients: [{ ingredientId: 'flour', displayName: 'Flour', amount: 1, unit: 'cup' }],
      })
    );

    const res = await request(app)
      .post('/api/recipes/import-image')
      .attach('file', VALID_JPEG_BUFFER, { filename: 'recipe.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('InvalidRecipeError');
    expect(res.body.message).toMatch(/positive integer/i);
  });

  it('15. CRITICAL: verifies NOTHING is persisted to the database before or after a successful import-image call', async () => {
    vi.spyOn(geminiClient, 'parseRecipeImageWithGeminiTimeout').mockResolvedValue(
      MOCK_VALID_GEMINI_RECIPE_JSON
    );
    const createSpy = vi.spyOn(prisma.recipe, 'create');

    const res = await request(app)
      .post('/api/recipes/import-image')
      .attach('file', VALID_JPEG_BUFFER, { filename: 'recipe.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(createSpy).not.toHaveBeenCalled();
  });
});
