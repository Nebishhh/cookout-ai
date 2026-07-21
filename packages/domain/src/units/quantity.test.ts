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
