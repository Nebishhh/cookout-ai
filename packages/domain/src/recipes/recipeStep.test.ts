import { describe, expect, it } from 'vitest';
import { InvalidRecipeError, RecipeStep, StepDuration, StepTemperature } from '../index.js';

describe('RecipeStep Construction & Validation', () => {
  it('creates a valid RecipeStep', () => {
    const step = new RecipeStep('Preheat the oven to 375°F.');
    expect(step.instruction).toBe('Preheat the oven to 375°F.');
    expect(step.duration).toBeNull();
    expect(step.temperature).toBeNull();
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

  it('accepts optional duration and temperature', () => {
    const duration = new StepDuration(25, 'minutes');
    const temperature = new StepTemperature(350, 'F');
    const step = new RecipeStep('Bake until golden.', duration, temperature);
    expect(step.duration).toBe(duration);
    expect(step.temperature).toBe(temperature);
  });

  it('accepts duration without temperature, and vice versa', () => {
    const withDurationOnly = new RecipeStep('Simmer.', new StepDuration(10, 'minutes'));
    expect(withDurationOnly.duration).not.toBeNull();
    expect(withDurationOnly.temperature).toBeNull();

    const withTemperatureOnly = new RecipeStep('Chill.', undefined, new StepTemperature(4, 'C'));
    expect(withTemperatureOnly.duration).toBeNull();
    expect(withTemperatureOnly.temperature).not.toBeNull();
  });

  it('rejects a duration that is not a StepDuration instance', () => {
    // Structurally identical to StepDuration (no private members), so this only fails at
    // runtime via the constructor's instanceof check, not at compile time.
    expect(() => new RecipeStep('Bake.', { amount: 25, unit: 'minutes' })).toThrow(
      InvalidRecipeError
    );
  });

  it('rejects a temperature that is not a StepTemperature instance', () => {
    expect(() => new RecipeStep('Bake.', undefined, { amount: 350, unit: 'F' })).toThrow(
      InvalidRecipeError
    );
  });
});

describe('StepDuration Construction & Validation', () => {
  it('creates a valid StepDuration', () => {
    const d = new StepDuration(25, 'minutes');
    expect(d.amount).toBe(25);
    expect(d.unit).toBe('minutes');
  });

  it('accepts hours as a unit', () => {
    expect(new StepDuration(1.5, 'hours').unit).toBe('hours');
  });

  it('rejects a negative amount', () => {
    expect(() => new StepDuration(-5, 'minutes')).toThrow(InvalidRecipeError);
  });

  it('rejects a non-finite amount', () => {
    expect(() => new StepDuration(NaN, 'minutes')).toThrow(InvalidRecipeError);
  });

  it('rejects an unsupported unit', () => {
    expect(() => new StepDuration(5, 'seconds')).toThrow(InvalidRecipeError);
  });

  it('is immutable (frozen)', () => {
    expect(Object.isFrozen(new StepDuration(5, 'minutes'))).toBe(true);
  });
});

describe('StepTemperature Construction & Validation', () => {
  it('creates a valid StepTemperature', () => {
    const t = new StepTemperature(350, 'F');
    expect(t.amount).toBe(350);
    expect(t.unit).toBe('F');
  });

  it('accepts Celsius as a unit', () => {
    expect(new StepTemperature(175, 'C').unit).toBe('C');
  });

  it('allows negative amounts (e.g. freezer temperatures)', () => {
    expect(new StepTemperature(-18, 'C').amount).toBe(-18);
  });

  it('rejects a non-finite amount', () => {
    expect(() => new StepTemperature(NaN, 'F')).toThrow(InvalidRecipeError);
  });

  it('rejects an unsupported unit', () => {
    expect(() => new StepTemperature(100, 'K')).toThrow(InvalidRecipeError);
  });

  it('is immutable (frozen)', () => {
    expect(Object.isFrozen(new StepTemperature(100, 'C'))).toBe(true);
  });
});
