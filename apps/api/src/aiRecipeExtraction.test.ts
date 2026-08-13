import { describe, expect, it, vi } from 'vitest';
import { extractRecipeCandidate } from './aiRecipeExtraction.js';

const VALID_RECIPE_JSON = JSON.stringify({
  name: 'Grandma Pancakes',
  baseServings: 4,
  dietaryTags: ['Vegetarian'],
  ingredients: [{ ingredientId: 'flour', displayName: 'Flour', amount: 2, unit: 'cup' }],
  instructions: [],
});

const MALFORMED_SHAPE_JSON = JSON.stringify({
  name: 'Grandma Pancakes: flour 2 cup, egg 2 egg, milk 300 ml',
});

describe('extractRecipeCandidate', () => {
  it('returns ok on the first attempt when the candidate is already well-shaped, without retrying', async () => {
    const callGemini = vi.fn().mockResolvedValue(VALID_RECIPE_JSON);

    const result = await extractRecipeCandidate(callGemini);

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.candidate.name).toBe('Grandma Pancakes');
    }
    expect(callGemini).toHaveBeenCalledTimes(1);
    expect(callGemini).toHaveBeenCalledWith(false);
  });

  it('retries once with reinforceShape=true and returns ok when the retry is well-shaped', async () => {
    const callGemini = vi
      .fn()
      .mockResolvedValueOnce(MALFORMED_SHAPE_JSON)
      .mockResolvedValueOnce(VALID_RECIPE_JSON);

    const result = await extractRecipeCandidate(callGemini);

    expect(result.status).toBe('ok');
    expect(callGemini).toHaveBeenCalledTimes(2);
    expect(callGemini).toHaveBeenNthCalledWith(1, false);
    expect(callGemini).toHaveBeenNthCalledWith(2, true);
  });

  it('returns malformed-shape after both the initial attempt and the retry fail the shape check', async () => {
    const callGemini = vi.fn().mockResolvedValue(MALFORMED_SHAPE_JSON);

    const result = await extractRecipeCandidate(callGemini);

    expect(result.status).toBe('malformed-shape');
    expect(callGemini).toHaveBeenCalledTimes(2);
  });

  it('returns no-recipe-found without retrying', async () => {
    const callGemini = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ error: 'NoRecipeFound', message: 'Not a recipe.' }));

    const result = await extractRecipeCandidate(callGemini);

    expect(result.status).toBe('no-recipe-found');
    if (result.status === 'no-recipe-found') {
      expect(result.message).toBe('Not a recipe.');
    }
    expect(callGemini).toHaveBeenCalledTimes(1);
  });

  it('returns invalid-json without retrying when the response is not parseable JSON', async () => {
    const callGemini = vi.fn().mockResolvedValue('Sorry, I cannot parse this.');

    const result = await extractRecipeCandidate(callGemini);

    expect(result.status).toBe('invalid-json');
    expect(callGemini).toHaveBeenCalledTimes(1);
  });

  it('strips markdown code fences before parsing', async () => {
    const callGemini = vi.fn().mockResolvedValue('```json\n' + VALID_RECIPE_JSON + '\n```');

    const result = await extractRecipeCandidate(callGemini);

    expect(result.status).toBe('ok');
  });

  it('propagates a rejected callGemini promise (network/timeout failure) to the caller', async () => {
    const callGemini = vi.fn().mockRejectedValue(new Error('Gemini API request timed out.'));

    await expect(extractRecipeCandidate(callGemini)).rejects.toThrow(
      'Gemini API request timed out.'
    );
  });
});
