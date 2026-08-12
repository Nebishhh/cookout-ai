import { describe, expect, it } from 'vitest';
import { InvalidRecipeError, RecipeStep } from '../index.js';

describe('RecipeStep Construction & Validation', () => {
  it('creates a valid RecipeStep', () => {
    const step = new RecipeStep('Preheat the oven to 375°F.');
    expect(step.instruction).toBe('Preheat the oven to 375°F.');
  });

  it('rejects empty or whitespace-only instruction', () => {
    expect(() => new RecipeStep('')).toThrow(InvalidRecipeError);
    expect(() => new RecipeStep('   ')).toThrow(InvalidRecipeError);
  });

  it('rejects non-string instruction', () => {
    // @ts-expect-error testing invalid input type
    expect(() => new RecipeStep(42)).toThrow(InvalidRecipeError);
  });

  it('is immutable (frozen)', () => {
    const step = new RecipeStep('Whisk the eggs.');
    expect(Object.isFrozen(step)).toBe(true);
  });
});
