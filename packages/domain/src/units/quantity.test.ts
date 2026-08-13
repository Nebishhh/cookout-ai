import { describe, expect, it } from 'vitest';
import {
  Quantity,
  UnitCategory,
  UNIT_REGISTRY,
  isSupportedUnit,
  getUnitDefinition,
  DomainError,
  InvalidQuantityError,
  InvalidUnitError,
  UnitMismatchError,
} from '../index.js';

describe('Quantity Value Object', () => {
  describe('Valid Construction', () => {
    it('creates a Quantity with positive amount and valid Mass unit', () => {
      const q = new Quantity(500, 'g');
      expect(q.amount).toBe(500);
      expect(q.unit).toBe('g');
      expect(q.category).toBe(UnitCategory.Mass);
    });

    it('creates a Quantity with zero amount', () => {
      const q = new Quantity(0, 'ml');
      expect(q.amount).toBe(0);
      expect(q.unit).toBe('ml');
      expect(q.category).toBe(UnitCategory.Volume);
    });

    it('infers correct UnitCategory for Mass, Volume, and Count units', () => {
      expect(new Quantity(1, 'kg').category).toBe(UnitCategory.Mass);
      expect(new Quantity(2, 'tbsp').category).toBe(UnitCategory.Volume);
      expect(new Quantity(3, 'egg').category).toBe(UnitCategory.Count);
    });

    it('is immutable (frozen)', () => {
      const q = new Quantity(10, 'oz');
      expect(Object.isFrozen(q)).toBe(true);
      expect(() => {
        // @ts-expect-error mutating readonly property for test
        q.amount = 20;
      }).toThrow();
    });
  });

  describe('Invalid Quantities', () => {
    it('rejects negative amounts', () => {
      expect(() => new Quantity(-5, 'g')).toThrow(InvalidQuantityError);
      expect(() => new Quantity(-0.001, 'tsp')).toThrow(InvalidQuantityError);
    });

    it('rejects NaN amounts', () => {
      expect(() => new Quantity(NaN, 'cup')).toThrow(InvalidQuantityError);
    });

    it('rejects Infinity and -Infinity amounts', () => {
      expect(() => new Quantity(Infinity, 'lb')).toThrow(InvalidQuantityError);
      expect(() => new Quantity(-Infinity, 'lb')).toThrow(InvalidQuantityError);
    });
  });

  describe('Invalid Units', () => {
    it('rejects unrecognized or invalid unit strings', () => {
      expect(() => new Quantity(10, 'furlongs')).toThrow(InvalidUnitError);
      expect(() => new Quantity(5, 'grams')).toThrow(InvalidUnitError);
      expect(() => new Quantity(1, '')).toThrow(InvalidUnitError);
    });
  });

  describe('Scaling', () => {
    it('scales amounts correctly with positive factor', () => {
      const q = new Quantity(2, 'cup');
      const scaled = q.scale(2.5);
      expect(scaled.amount).toBe(5);
      expect(scaled.unit).toBe('cup');
      expect(scaled.category).toBe(UnitCategory.Volume);
    });

    it('scaling by 0 returns a Quantity with 0 amount', () => {
      const q = new Quantity(10, 'g');
      const scaled = q.scale(0);
      expect(scaled.amount).toBe(0);
      expect(scaled.unit).toBe('g');
    });

    it('does NOT round fractional results for Count-category units', () => {
      const q = new Quantity(3, 'egg');
      const scaled = q.scale(1.5);
      expect(scaled.amount).toBe(4.5);
      expect(scaled.unit).toBe('egg');
      expect(scaled.category).toBe(UnitCategory.Count);
    });

    it('rejects negative scaling factors', () => {
      const q = new Quantity(100, 'ml');
      expect(() => q.scale(-1)).toThrow(InvalidQuantityError);
    });

    it('rejects NaN scaling factors', () => {
      const q = new Quantity(100, 'ml');
      expect(() => q.scale(NaN)).toThrow(InvalidQuantityError);
    });

    it('rejects Infinity scaling factors', () => {
      const q = new Quantity(100, 'ml');
      expect(() => q.scale(Infinity)).toThrow(InvalidQuantityError);
    });
  });

  describe('Unit Conversion (convertTo)', () => {
    it('performs identity conversion when targetUnit is the same as current unit', () => {
      const q = new Quantity(500, 'g');
      const converted = q.convertTo('g');
      expect(converted.amount).toBe(500);
      expect(converted.unit).toBe('g');
      expect(converted.category).toBe(UnitCategory.Mass);
    });

    it('converts same-category Mass units in both directions', () => {
      // g -> kg
      const qG = new Quantity(1000, 'g');
      const qKg = qG.convertTo('kg');
      expect(qKg.amount).toBe(1);
      expect(qKg.unit).toBe('kg');

      // kg -> g
      const qKg2 = new Quantity(2.5, 'kg');
      const qG2 = qKg2.convertTo('g');
      expect(qG2.amount).toBe(2500);
      expect(qG2.unit).toBe('g');

      // oz -> lb & lb -> oz
      const qOz = new Quantity(16, 'oz');
      const qLb = qOz.convertTo('lb');
      expect(qLb.amount).toBeCloseTo(1, 4);

      const qLb2 = new Quantity(2, 'lb');
      const qOz2 = qLb2.convertTo('oz');
      expect(qOz2.amount).toBeCloseTo(32, 4);
    });

    it('converts same-category Volume units in both directions', () => {
      // ml -> l
      const qMl = new Quantity(1000, 'ml');
      const qL = qMl.convertTo('l');
      expect(qL.amount).toBe(1);
      expect(qL.unit).toBe('l');

      // l -> ml
      const qL2 = new Quantity(1.5, 'l');
      const qMl2 = qL2.convertTo('ml');
      expect(qMl2.amount).toBe(1500);
      expect(qMl2.unit).toBe('ml');

      // cup -> ml & ml -> cup
      const qCup = new Quantity(1, 'cup');
      const qMl3 = qCup.convertTo('ml');
      expect(qMl3.amount).toBeCloseTo(236.588, 3);

      // tsp -> tbsp & tbsp -> tsp
      const qTsp = new Quantity(3, 'tsp');
      const qTbsp = qTsp.convertTo('tbsp');
      expect(qTbsp.amount).toBeCloseTo(1, 4);
    });

    it('maintains round-trip conversion accuracy within floating point tolerance', () => {
      const initial = new Quantity(3, 'cup');
      const converted = initial.convertTo('tbsp');
      const roundTrip = converted.convertTo('cup');
      expect(roundTrip.amount).toBeCloseTo(initial.amount, 5);
      expect(roundTrip.unit).toBe('cup');
    });

    it('throws UnitMismatchError for cross-category conversions (Mass -> Volume, Volume -> Mass)', () => {
      const qG = new Quantity(1000, 'g');
      expect(() => qG.convertTo('ml')).toThrow(UnitMismatchError);

      const qCup = new Quantity(1, 'cup');
      expect(() => qCup.convertTo('oz')).toThrow(UnitMismatchError);
    });

    it('throws UnitMismatchError for Count-category conversions (Count -> Count, Count -> non-Count, non-Count -> Count)', () => {
      const qEgg = new Quantity(3, 'egg');
      // Count -> Count
      expect(() => qEgg.convertTo('clove')).toThrow(UnitMismatchError);
      expect(() => qEgg.convertTo('onion')).toThrow(UnitMismatchError);
      expect(() => qEgg.convertTo('count')).toThrow(UnitMismatchError);

      // Count -> non-Count
      expect(() => qEgg.convertTo('g')).toThrow(UnitMismatchError);
      expect(() => qEgg.convertTo('ml')).toThrow(UnitMismatchError);

      // non-Count -> Count
      const qG = new Quantity(100, 'g');
      expect(() => qG.convertTo('egg')).toThrow(UnitMismatchError);
    });

    it('throws InvalidUnitError when targetUnit is invalid or unsupported', () => {
      const q = new Quantity(100, 'g');
      expect(() => q.convertTo('gallons')).toThrow(InvalidUnitError);
      expect(() => q.convertTo('')).toThrow(InvalidUnitError);
    });
  });

  describe('Subtraction (subtract)', () => {
    it('subtracts same-unit quantities', () => {
      const needed = new Quantity(500, 'g');
      const onHand = new Quantity(200, 'g');
      const result = needed.subtract(onHand);
      expect(result.amount).toBe(300);
      expect(result.unit).toBe('g');
    });

    it('converts the subtrahend into the minuend unit before subtracting (cross-unit, same category)', () => {
      const needed = new Quantity(2, 'l');
      const onHand = new Quantity(500, 'ml');
      const result = needed.subtract(onHand);
      expect(result.amount).toBe(1.5);
      expect(result.unit).toBe('l');
    });

    it('subtracts exact-matching Count units', () => {
      const needed = new Quantity(5, 'egg');
      const onHand = new Quantity(3, 'egg');
      const result = needed.subtract(onHand);
      expect(result.amount).toBe(2);
      expect(result.unit).toBe('egg');
    });

    it('clamps at zero rather than throwing when the subtrahend exceeds the minuend', () => {
      const needed = new Quantity(200, 'g');
      const onHand = new Quantity(500, 'g');
      const result = needed.subtract(onHand);
      expect(result.amount).toBe(0);
      expect(result.unit).toBe('g');
    });

    it('throws UnitMismatchError for cross-category subtraction (Mass - Volume)', () => {
      const needed = new Quantity(500, 'g');
      const onHand = new Quantity(1, 'cup');
      expect(() => needed.subtract(onHand)).toThrow(UnitMismatchError);
    });

    it('throws UnitMismatchError when either side is Count with a differing unit', () => {
      const needed = new Quantity(5, 'egg');
      const onHand = new Quantity(2, 'count');
      expect(() => needed.subtract(onHand)).toThrow(UnitMismatchError);
    });
  });

  describe('Equality', () => {
    it('returns true when amount and unit match exactly', () => {
      const q1 = new Quantity(250, 'ml');
      const q2 = new Quantity(250, 'ml');
      expect(q1.equals(q2)).toBe(true);
    });

    it('returns false when amounts differ', () => {
      const q1 = new Quantity(250, 'ml');
      const q2 = new Quantity(500, 'ml');
      expect(q1.equals(q2)).toBe(false);
    });

    it('returns false for same-category different-unit quantities (no unit conversion)', () => {
      const q1 = new Quantity(1000, 'g');
      const q2 = new Quantity(1, 'kg');
      expect(q1.equals(q2)).toBe(false);
    });

    it('returns false for different-category quantities', () => {
      const q1 = new Quantity(1, 'count');
      const q2 = new Quantity(1, 'g');
      expect(q1.equals(q2)).toBe(false);
    });

    it('returns false when comparing against non-Quantity values', () => {
      const q = new Quantity(5, 'tbsp');
      expect(q.equals(null)).toBe(false);
      expect(q.equals(undefined)).toBe(false);
      expect(q.equals({ amount: 5, unit: 'tbsp' })).toBe(false);
      expect(q.equals('5 tbsp')).toBe(false);
    });
  });

  describe('Serialization', () => {
    it('serializes to JSON format correctly', () => {
      const q = new Quantity(2.5, 'cup');
      const json = q.toJSON();
      expect(json).toEqual({
        amount: 2.5,
        unit: 'cup',
        category: UnitCategory.Volume,
      });
    });

    it('formats as string correctly', () => {
      const q = new Quantity(4, 'clove');
      expect(q.toString()).toBe('4 clove');
    });
  });

  describe('Unit Registry & Helper Functions', () => {
    it('contains all required Mass units', () => {
      expect(UNIT_REGISTRY['g'].category).toBe(UnitCategory.Mass);
      expect(UNIT_REGISTRY['kg'].category).toBe(UnitCategory.Mass);
      expect(UNIT_REGISTRY['oz'].category).toBe(UnitCategory.Mass);
      expect(UNIT_REGISTRY['lb'].category).toBe(UnitCategory.Mass);
    });

    it('contains all required Volume units', () => {
      expect(UNIT_REGISTRY['ml'].category).toBe(UnitCategory.Volume);
      expect(UNIT_REGISTRY['l'].category).toBe(UnitCategory.Volume);
      expect(UNIT_REGISTRY['tsp'].category).toBe(UnitCategory.Volume);
      expect(UNIT_REGISTRY['tbsp'].category).toBe(UnitCategory.Volume);
      expect(UNIT_REGISTRY['cup'].category).toBe(UnitCategory.Volume);
      expect(UNIT_REGISTRY['fl oz'].category).toBe(UnitCategory.Volume);
    });

    it('contains all required Count units', () => {
      expect(UNIT_REGISTRY['count'].category).toBe(UnitCategory.Count);
      expect(UNIT_REGISTRY['clove'].category).toBe(UnitCategory.Count);
      expect(UNIT_REGISTRY['egg'].category).toBe(UnitCategory.Count);
      expect(UNIT_REGISTRY['onion'].category).toBe(UnitCategory.Count);
    });

    it('correctly identifies supported units with isSupportedUnit', () => {
      expect(isSupportedUnit('g')).toBe(true);
      expect(isSupportedUnit('cup')).toBe(true);
      expect(isSupportedUnit('egg')).toBe(true);
      expect(isSupportedUnit('bushel')).toBe(false);
    });

    it('throws InvalidUnitError in getUnitDefinition for unsupported units', () => {
      expect(() => getUnitDefinition('unknown')).toThrow(InvalidUnitError);
    });
  });

  describe('Typed Errors', () => {
    it('inherits from DomainError', () => {
      const errQuantity = new InvalidQuantityError('Invalid amount');
      const errUnit = new InvalidUnitError('Invalid unit');
      const errMismatch = new UnitMismatchError('Unit mismatch');

      expect(errQuantity).toBeInstanceOf(DomainError);
      expect(errQuantity).toBeInstanceOf(Error);
      expect(errQuantity.name).toBe('InvalidQuantityError');

      expect(errUnit).toBeInstanceOf(DomainError);
      expect(errUnit).toBeInstanceOf(Error);
      expect(errUnit.name).toBe('InvalidUnitError');

      expect(errMismatch).toBeInstanceOf(DomainError);
      expect(errMismatch).toBeInstanceOf(Error);
      expect(errMismatch.name).toBe('UnitMismatchError');
    });
  });
});
