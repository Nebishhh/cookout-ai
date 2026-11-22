import { PRACTICAL_FRACTION_UNITS } from '@cookout-ai/domain';

export const KNOWN_COUNT_UNITS = ['count', 'clove', 'egg', 'onion'];

export type FormatQuantityMode = 'display' | 'consolidated';

const FRACTION_UNITS: ReadonlySet<string> = new Set(PRACTICAL_FRACTION_UNITS);

/**
 * Display-only utility to format quantity amounts for UI rendering.
 * Purely a presentation concern.
 *
 * - Mass / Volume (display mode, recipe amounts as written): at most 2 decimal places.
 * - Mass / Volume (consolidated mode, the shopping list): kitchen fractions for the units the
 *   domain rounds to fractions (2.333 cup -> "2 1/3"), plain numbers for g and ml.
 * - Count (display mode): formatted as fractions/mixed numbers (e.g. 0.25 -> "1/4", 2.25 -> "2 1/4") if matching clean fractions.
 * - Count (consolidated mode): rounded UP (Math.ceil) to whole numbers for purchasing.
 */
export function formatQuantityAmount(
  amount: number,
  unit?: string,
  category?: string,
  mode: FormatQuantityMode = 'display'
): string {
  if (!Number.isFinite(amount)) return '0';
  if (amount < 0) return '0';

  const isCountCategory =
    category === 'Count' ||
    (!category && unit && KNOWN_COUNT_UNITS.includes(unit.toLowerCase().trim()));

  if (!isCountCategory) {
    if (mode === 'consolidated' && unit && FRACTION_UNITS.has(unit)) {
      return formatMixedNumber(amount);
    }
    return formatDecimal(amount);
  }

  // Count Category in 'consolidated' purchase mode (round UP to whole number)
  if (mode === 'consolidated') {
    const ceilVal = Math.ceil(amount);
    return ceilVal.toString();
  }

  // Count Category in 'display' recipe/breakdown mode (fractions / mixed numbers)
  return formatMixedNumber(amount);
}

/** "2 1/3", "1/4" or "3" when the amount sits on a common fraction; two decimals otherwise. */
function formatMixedNumber(amount: number): string {
  if (Number.isInteger(amount)) {
    return amount.toString();
  }

  const integerPart = Math.floor(amount);
  const fractionStr = getCommonFraction(amount - integerPart);

  if (fractionStr) {
    return integerPart === 0 ? fractionStr : `${integerPart} ${fractionStr}`;
  }

  // Non-clean decimal fallback: default to 1-2 decimal rounding
  return formatDecimal(amount);
}

/** At most two decimal places, with no trailing zeros. */
function formatDecimal(amount: number): string {
  if (Number.isInteger(amount)) return amount.toString();
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  return rounded.toString();
}

/**
 * Converts a fractional remainder (0 < decimal < 1) to a common fraction string (1/4, 1/3, 1/2, 2/3, 3/4).
 * Returns null if decimal doesn't cleanly match within tolerance (0.02).
 */
function getCommonFraction(decimal: number): string | null {
  const tolerance = 0.02;

  const fractions: { target: number; str: string }[] = [
    { target: 0.25, str: '1/4' },
    { target: 0.33333333, str: '1/3' },
    { target: 0.5, str: '1/2' },
    { target: 0.66666667, str: '2/3' },
    { target: 0.75, str: '3/4' },
  ];

  for (const f of fractions) {
    if (Math.abs(decimal - f.target) <= tolerance) {
      return f.str;
    }
  }

  return null;
}
