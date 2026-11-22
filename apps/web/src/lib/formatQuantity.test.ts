import { describe, it, expect } from 'vitest';
import { formatQuantityAmount } from './formatQuantity';

describe('formatQuantityAmount Utility Tests', () => {
  describe('Count Category - Display Mode (Fractions & Mixed Numbers)', () => {
    it('formats 0.25 count as "1/4"', () => {
      expect(formatQuantityAmount(0.25, 'egg', 'Count')).toBe('1/4');
    });

    it('formats 0.5 count as "1/2"', () => {
      expect(formatQuantityAmount(0.5, 'clove', 'Count')).toBe('1/2');
    });

    it('formats 0.75 count as "3/4"', () => {
      expect(formatQuantityAmount(0.75, 'onion', 'Count')).toBe('3/4');
    });

    it('formats 1.0 whole count as "1"', () => {
      expect(formatQuantityAmount(1.0, 'egg', 'Count')).toBe('1');
    });

    it('formats 2.25 mixed number count as "2 1/4"', () => {
      expect(formatQuantityAmount(2.25, 'egg', 'Count')).toBe('2 1/4');
    });

    it('formats 3.0 whole count as "3"', () => {
      expect(formatQuantityAmount(3.0, 'count', 'Count')).toBe('3');
    });

    it('infers Count category from known count unit when category parameter is omitted', () => {
      expect(formatQuantityAmount(0.5, 'egg')).toBe('1/2');
      expect(formatQuantityAmount(2.25, 'onion')).toBe('2 1/4');
    });

    it('falls back to 1-2 decimal rounding for non-clean decimals (e.g., 1.18)', () => {
      expect(formatQuantityAmount(1.18, 'egg', 'Count')).toBe('1.18');
      expect(formatQuantityAmount(0.123, 'clove', 'Count')).toBe('0.12');
    });
  });

  describe('Count Category - Consolidated Mode (Math.ceil Purchase Rounding)', () => {
    it('rounds UP fractional count quantities to nearest whole number in consolidated mode', () => {
      expect(formatQuantityAmount(2.25, 'egg', 'Count', 'consolidated')).toBe('3');
      expect(formatQuantityAmount(0.25, 'onion', 'Count', 'consolidated')).toBe('1');
      expect(formatQuantityAmount(4.1, 'clove', 'Count', 'consolidated')).toBe('5');
    });

    it('keeps whole numbers unchanged in consolidated mode', () => {
      expect(formatQuantityAmount(3.0, 'egg', 'Count', 'consolidated')).toBe('3');
      expect(formatQuantityAmount(1.0, 'onion', 'Count', 'consolidated')).toBe('1');
    });
  });

  describe('Non-Count Categories (Mass, Volume)', () => {
    it('formats Mass and Volume as decimals in display mode (recipe amounts as written)', () => {
      expect(formatQuantityAmount(2.25, 'g', 'Mass', 'display')).toBe('2.25');
      expect(formatQuantityAmount(0.5, 'cup', 'Volume', 'display')).toBe('0.5');
    });

    it('shows kitchen fractions for shopping-list amounts in US kitchen units', () => {
      expect(formatQuantityAmount(0.5, 'cup', 'Volume', 'consolidated')).toBe('1/2');
      expect(formatQuantityAmount(7 / 3, 'cup', 'Volume', 'consolidated')).toBe('2 1/3');
      expect(formatQuantityAmount(0.25, 'tsp', 'Volume', 'consolidated')).toBe('1/4');
      expect(formatQuantityAmount(1.5, 'lb', 'Mass', 'consolidated')).toBe('1 1/2');
    });

    it('shows kilograms and litres as decimals, never as fractions', () => {
      expect(formatQuantityAmount(1.5, 'kg', 'Mass', 'consolidated')).toBe('1.5');
      expect(formatQuantityAmount(1.2, 'kg', 'Mass', 'consolidated')).toBe('1.2');
      expect(formatQuantityAmount(1.7, 'l', 'Volume', 'consolidated')).toBe('1.7');
    });

    it('keeps grams and millilitres as plain numbers in the shopping list', () => {
      expect(formatQuantityAmount(159, 'ml', 'Volume', 'consolidated')).toBe('159');
      expect(formatQuantityAmount(2.25, 'g', 'Mass', 'consolidated')).toBe('2.25');
    });

    it('falls back to two decimals for an amount that is not on a kitchen fraction', () => {
      expect(formatQuantityAmount(2.4226752837730374, 'cup', 'Volume', 'consolidated')).toBe(
        '2.42'
      );
    });

    it('formats whole number Mass and Volume quantities cleanly', () => {
      expect(formatQuantityAmount(5.0, 'g', 'Mass')).toBe('5');
      expect(formatQuantityAmount(2.0, 'cup', 'Volume')).toBe('2');
    });
  });
});
