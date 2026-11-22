import { describe, expect, it } from 'vitest';
import { UnitMismatchError } from '../errors.js';
import {
  largestShareSystem,
  pickKitchenUnit,
  PRACTICAL_FRACTION_UNITS,
  TENTH_ROUNDED_UNITS,
  unitSystemOf,
} from './kitchenUnit.js';
import { Quantity } from './quantity.js';
import { UnitCategory } from './units.js';

describe('unitSystemOf()', () => {
  it('puts g, kg, ml and l in the metric system', () => {
    for (const unit of ['g', 'kg', 'ml', 'l'] as const) expect(unitSystemOf(unit)).toBe('metric');
  });

  it('puts oz, lb, tsp, tbsp, cup and fl oz in the US system', () => {
    for (const unit of ['oz', 'lb', 'tsp', 'tbsp', 'cup', 'fl oz'] as const) {
      expect(unitSystemOf(unit)).toBe('us');
    }
  });

  it('gives Count units no system', () => {
    for (const unit of ['count', 'clove', 'egg', 'onion'] as const) {
      expect(unitSystemOf(unit)).toBeNull();
    }
  });
});

describe('largestShareSystem()', () => {
  it('picks the system contributing more of the total, compared in base units', () => {
    // 2 tbsp is 29.6 ml (US); 500 ml is metric. Metric wins although the US line comes first.
    expect(largestShareSystem([new Quantity(2, 'tbsp'), new Quantity(500, 'ml')])).toBe('metric');
    // 2 cups is 473 ml (US) against 100 ml metric.
    expect(largestShareSystem([new Quantity(100, 'ml'), new Quantity(2, 'cup')])).toBe('us');
  });

  it('sums every line of a system before comparing', () => {
    // Three 100 ml lines (300 ml metric) outweigh one cup (237 ml US), though each is smaller.
    const lines = [
      new Quantity(1, 'cup'),
      new Quantity(100, 'ml'),
      new Quantity(100, 'ml'),
      new Quantity(100, 'ml'),
    ];
    expect(largestShareSystem(lines)).toBe('metric');
  });

  it('compares masses the same way', () => {
    expect(largestShareSystem([new Quantity(1, 'oz'), new Quantity(500, 'g')])).toBe('metric');
    expect(largestShareSystem([new Quantity(100, 'g'), new Quantity(1, 'lb')])).toBe('us');
  });

  it('breaks an exact tie in favour of the first line', () => {
    expect(largestShareSystem([new Quantity(1, 'cup'), new Quantity(236.5882365, 'ml')])).toBe(
      'us'
    );
    expect(largestShareSystem([new Quantity(236.5882365, 'ml'), new Quantity(1, 'cup')])).toBe(
      'metric'
    );
  });

  it('rejects Count quantities, mixed categories and an empty list', () => {
    expect(() => largestShareSystem([new Quantity(2, 'egg')])).toThrow(UnitMismatchError);
    expect(() => largestShareSystem([new Quantity(1, 'cup'), new Quantity(5, 'g')])).toThrow(
      UnitMismatchError
    );
    expect(() => largestShareSystem([])).toThrow(UnitMismatchError);
  });
});

describe('pickKitchenUnit()', () => {
  it('picks the largest unit of the system that keeps the amount at 1 or more', () => {
    expect(pickKitchenUnit(573.176, UnitCategory.Volume, 'us')).toBe('cup'); // 2.42 cup
    expect(pickKitchenUnit(20, UnitCategory.Volume, 'us')).toBe('tbsp'); // 1.35 tbsp, 0.08 cup
    expect(pickKitchenUnit(1500, UnitCategory.Volume, 'metric')).toBe('l');
    expect(pickKitchenUnit(1100, UnitCategory.Mass, 'metric')).toBe('kg');
    expect(pickKitchenUnit(680.39, UnitCategory.Mass, 'us')).toBe('lb'); // 1.5 lb
  });

  it('answers in the system it is given', () => {
    // 573 ml is 2.42 cups or 0.57 l.
    expect(pickKitchenUnit(573.176, UnitCategory.Volume, 'us')).toBe('cup');
    expect(pickKitchenUnit(573.176, UnitCategory.Volume, 'metric')).toBe('ml');
  });

  it('falls back to the smallest unit when even that is under 1', () => {
    expect(pickKitchenUnit(10, UnitCategory.Volume, 'metric')).toBe('ml');
    expect(pickKitchenUnit(3, UnitCategory.Volume, 'us')).toBe('tsp'); // 0.61 tsp
    expect(pickKitchenUnit(100, UnitCategory.Mass, 'us')).toBe('oz');
    expect(pickKitchenUnit(999, UnitCategory.Mass, 'metric')).toBe('g');
  });

  it('never answers a US volume in fl oz: tsp, tbsp or cup only', () => {
    expect(pickKitchenUnit(500, UnitCategory.Volume, 'us')).toBe('cup');
  });
});

describe('rounding unit lists', () => {
  it('rounds US kitchen units to fractions', () => {
    expect([...PRACTICAL_FRACTION_UNITS].sort()).toEqual(
      ['cup', 'fl oz', 'lb', 'oz', 'tbsp', 'tsp'].sort()
    );
  });

  it('rounds kilograms and litres to tenths', () => {
    expect([...TENTH_ROUNDED_UNITS].sort()).toEqual(['kg', 'l']);
  });

  it('leaves only g and ml for whole numbers', () => {
    const listed = new Set([...PRACTICAL_FRACTION_UNITS, ...TENTH_ROUNDED_UNITS]);
    const massAndVolume = ['g', 'kg', 'oz', 'lb', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'fl oz'];
    expect(massAndVolume.filter((u) => !listed.has(u as never))).toEqual(['g', 'ml']);
  });
});
