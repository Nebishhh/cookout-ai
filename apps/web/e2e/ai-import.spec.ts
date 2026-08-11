import { test, expect } from '@playwright/test';

// JPEG Magic Bytes header (0xFF 0xD8 0xFF 0xE0) to satisfy imageValidator.ts sniffing
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

test.describe('AI Import E2E Tests (Fixture Interception)', () => {
  test('Text Import: submits raw text, receives fixture, pre-fills form, creates recipe after explicit click (+1 DB check)', async ({
    page,
    request,
  }) => {
    const initialRes = await request.get('http://localhost:3011/api/recipes');
    const initialRecipes = await initialRes.json();
    const countBefore = initialRecipes.length;

    await page.goto('/');
    await page.getByRole('button', { name: /paste recipe text/i }).click();

    await page
      .getByLabel(/paste unformatted recipe text below/i)
      .fill('Granola recipe with oats and honey');
    await page.getByRole('button', { name: /import with ai/i }).click();

    // Wait for AI review notice banner first
    await expect(page.getByText(/imported via ai — please review all fields/i)).toBeVisible();
    await expect(page.getByLabel(/recipe name/i)).toHaveValue('Fixtured Granola Bowl');

    // Verify ZERO auto-persistence before explicit click (DB count unchanged)
    const midRes = await request.get('http://localhost:3011/api/recipes');
    const midRecipes = await midRes.json();
    expect(midRecipes.length).toBe(countBefore);

    // Click explicit "Create Recipe" button
    await page.getByRole('button', { name: /create recipe/i }).click();

    await expect(
      page.getByText('Recipe "Fixtured Granola Bowl" created successfully!')
    ).toBeVisible();

    const postRes = await request.get('http://localhost:3011/api/recipes');
    const postRecipes = await postRes.json();
    expect(postRecipes.length).toBe(countBefore + 1);
  });

  test('URL Import: submits webpage URL, receives fixture, pre-fills form, creates recipe after explicit click (+1 DB check)', async ({
    page,
    request,
  }) => {
    const initialRes = await request.get('http://localhost:3011/api/recipes');
    const initialRecipes = await initialRes.json();
    const countBefore = initialRecipes.length;

    await page.goto('/');
    await page.getByRole('button', { name: /paste recipe text/i }).click();
    await page.getByRole('button', { name: /url link/i }).click();

    await page
      .getByLabel(/enter recipe webpage url below/i)
      .fill('https://example.com/recipes/muffins');
    await page.getByRole('button', { name: /import from url/i }).click();

    // Wait for AI review notice banner first
    await expect(page.getByText(/imported via ai — please review all fields/i)).toBeVisible();
    await expect(page.getByLabel(/recipe name/i)).toHaveValue('Fixtured Blueberry Muffins');

    // Click explicit "Create Recipe" button
    await page.getByRole('button', { name: /create recipe/i }).click();

    await expect(
      page.getByText('Recipe "Fixtured Blueberry Muffins" created successfully!')
    ).toBeVisible();

    const postRes = await request.get('http://localhost:3011/api/recipes');
    const postRecipes = await postRes.json();
    expect(postRecipes.length).toBe(countBefore + 1);
  });

  test('Image Upload: uploads image file, receives fixture, pre-fills form, creates recipe after explicit click (+1 DB check)', async ({
    page,
    request,
  }) => {
    const initialRes = await request.get('http://localhost:3011/api/recipes');
    const initialRecipes = await initialRes.json();
    const countBefore = initialRecipes.length;

    await page.goto('/');
    await page.getByRole('button', { name: /paste recipe text/i }).click();
    await page.getByRole('button', { name: /upload image/i }).click();

    // Create buffer with valid JPEG magic bytes + string marker
    const validJpegBuffer = Buffer.concat([
      JPEG_HEADER,
      Buffer.from('RECIPE_CARD test image buffer content'),
    ]);

    await page.setInputFiles('#import-image-input', {
      name: 'recipe_card.jpg',
      mimeType: 'image/jpeg',
      buffer: validJpegBuffer,
    });

    await page.getByRole('button', { name: /import from image/i }).click();

    // Wait for AI review notice banner first
    await expect(page.getByText(/imported via ai — please review all fields/i)).toBeVisible();
    await expect(page.getByLabel(/recipe name/i)).toHaveValue('Fixtured Handwritten Apple Pie');

    // Click explicit "Create Recipe" button
    await page.getByRole('button', { name: /create recipe/i }).click();

    await expect(
      page.getByText('Recipe "Fixtured Handwritten Apple Pie" created successfully!')
    ).toBeVisible();

    const postRes = await request.get('http://localhost:3011/api/recipes');
    const postRecipes = await postRes.json();
    expect(postRecipes.length).toBe(countBefore + 1);
  });

  test('Camera Capture: uploads photo via #import-camera-input, receives fixture, pre-fills form, creates recipe after explicit click (+1 DB check)', async ({
    page,
    request,
  }) => {
    const initialRes = await request.get('http://localhost:3011/api/recipes');
    const initialRecipes = await initialRes.json();
    const countBefore = initialRecipes.length;

    await page.goto('/');
    await page.getByRole('button', { name: /paste recipe text/i }).click();
    await page.getByRole('button', { name: /take picture/i }).click();

    // Verify #import-camera-input has capture="environment"
    const cameraInput = page.locator('#import-camera-input');
    await expect(cameraInput).toHaveAttribute('capture', 'environment');

    const validCameraBuffer = Buffer.concat([
      JPEG_HEADER,
      Buffer.from('CAMERA_PHOTO test image buffer content'),
    ]);

    await page.setInputFiles('#import-camera-input', {
      name: 'camera_snapshot.jpg',
      mimeType: 'image/jpeg',
      buffer: validCameraBuffer,
    });

    await page.getByRole('button', { name: /import from picture/i }).click();

    // Wait for AI review notice banner first
    await expect(page.getByText(/imported via ai — please review all fields/i)).toBeVisible();
    await expect(page.getByLabel(/recipe name/i)).toHaveValue('Fixtured Camera Steak Salad');

    // Click explicit "Create Recipe" button
    await page.getByRole('button', { name: /create recipe/i }).click();

    await expect(
      page.getByText('Recipe "Fixtured Camera Steak Salad" created successfully!')
    ).toBeVisible();

    const postRes = await request.get('http://localhost:3011/api/recipes');
    const postRecipes = await postRes.json();
    expect(postRecipes.length).toBe(countBefore + 1);
  });

  test('Extraction Failure: non-recipe input returns 502 NoRecipeFound, showing error banner with zero auto-persisted recipe', async ({
    page,
    request,
  }) => {
    const initialRes = await request.get('http://localhost:3011/api/recipes');
    const initialRecipes = await initialRes.json();
    const countBefore = initialRecipes.length;

    await page.goto('/');
    await page.getByRole('button', { name: /paste recipe text/i }).click();

    // Submit text containing FAILURE_CASE_TEST trigger
    await page
      .getByLabel(/paste unformatted recipe text below/i)
      .fill('FAILURE_CASE_TEST general non-recipe article');
    await page.getByRole('button', { name: /import with ai/i }).click();

    // Assert 502 error banner renders in UI
    await expect(
      page.getByText(/the provided image or text does not contain explicit recipe ingredients/i)
    ).toBeVisible();

    // Assert DB count unchanged
    const postRes = await request.get('http://localhost:3011/api/recipes');
    const postRecipes = await postRes.json();
    expect(postRecipes.length).toBe(countBefore);
  });
});
