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
    it('formats Mass and Volume decimal quantities without fraction conversion in both modes', () => {
      expect(formatQuantityAmount(2.25, 'g', 'Mass', 'display')).toBe('2.25');
      expect(formatQuantityAmount(2.25, 'g', 'Mass', 'consolidated')).toBe('2.25');
      expect(formatQuantityAmount(0.5, 'cup', 'Volume', 'display')).toBe('0.5');
      expect(formatQuantityAmount(0.5, 'cup', 'Volume', 'consolidated')).toBe('0.5');
    });

    it('formats whole number Mass and Volume quantities cleanly', () => {
      expect(formatQuantityAmount(5.0, 'g', 'Mass')).toBe('5');
      expect(formatQuantityAmount(2.0, 'cup', 'Volume')).toBe('2');
    });
  });
});
