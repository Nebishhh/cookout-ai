import { describe, expect, it } from 'vitest';
import { hasMinimalRecipeShape, stepsFromInstructions } from './recipeMapper.js';

describe('hasMinimalRecipeShape', () => {
  it('returns true for a well-shaped candidate', () => {
    expect(
      hasMinimalRecipeShape({
        name: 'Grandma Pancakes',
        baseServings: 4,
        ingredients: [{ ingredientId: 'flour', displayName: 'Flour', amount: 2, unit: 'cup' }],
      })
    ).toBe(true);
  });

  it('returns false when ingredients is missing entirely (issue #1)', () => {
    expect(
      hasMinimalRecipeShape({
        name: 'Grandma Pancakes: flour 2 cup, egg 2 egg, milk 300 ml',
      })
    ).toBe(false);
  });

  it('returns false when name is missing', () => {
    expect(
      hasMinimalRecipeShape({
        ingredients: [{ ingredientId: 'flour', displayName: 'Flour', amount: 2, unit: 'cup' }],
      })
    ).toBe(false);
  });

  it('returns false when name is blank/whitespace-only', () => {
    expect(
      hasMinimalRecipeShape({
        name: '   ',
        ingredients: [{ ingredientId: 'flour', displayName: 'Flour', amount: 2, unit: 'cup' }],
      })
    ).toBe(false);
  });

  it('returns false when ingredients is an empty array', () => {
    expect(hasMinimalRecipeShape({ name: 'Empty Recipe', ingredients: [] })).toBe(false);
  });

  it('returns false when ingredients is present but not an array', () => {
    expect(hasMinimalRecipeShape({ name: 'Weird Recipe', ingredients: 'flour, egg' })).toBe(false);
  });

  it('returns false for null, undefined, and non-object input', () => {
    expect(hasMinimalRecipeShape(null)).toBe(false);
    expect(hasMinimalRecipeShape(undefined)).toBe(false);
    expect(hasMinimalRecipeShape('a string')).toBe(false);
    expect(hasMinimalRecipeShape(42)).toBe(false);
  });
});

describe('stepsFromInstructions', () => {
  it('returns an empty array for non-array input', () => {
    expect(stepsFromInstructions(undefined)).toEqual([]);
    expect(stepsFromInstructions(null)).toEqual([]);
    expect(stepsFromInstructions('not an array')).toEqual([]);
  });

  it('accepts a bare string entry as a defensive fallback', () => {
    expect(stepsFromInstructions(['Mix the batter.'])).toEqual([
      { instruction: 'Mix the batter.' },
    ]);
  });

  it('extracts duration, temperature, and notes when fully present', () => {
    expect(
      stepsFromInstructions([
        {
          instruction: 'Bake until golden.',
          duration: { amount: 25, unit: 'minutes' },
          temperature: { amount: 350, unit: 'F' },
          notes: "Don't overmix.",
        },
      ])
    ).toEqual([
      {
        instruction: 'Bake until golden.',
        durationAmount: 25,
        durationUnit: 'minutes',
        temperatureAmount: 350,
        temperatureUnit: 'F',
        notes: "Don't overmix.",
      },
    ]);
  });

  it('skips a malformed entry with no string instruction', () => {
    expect(stepsFromInstructions([{ instruction: 42 }, { instruction: 'Whisk.' }])).toEqual([
      { instruction: 'Whisk.' },
    ]);
  });
});
