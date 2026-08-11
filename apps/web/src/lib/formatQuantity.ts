export const KNOWN_COUNT_UNITS = ['count', 'clove', 'egg', 'onion'];

export type FormatQuantityMode = 'display' | 'consolidated';

/**
 * Display-only utility to format quantity amounts for UI rendering.
 * Purely a presentation concern.
 *
 * - Mass / Volume: rounded to at most 2 decimal places.
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
    if (Number.isInteger(amount)) return amount.toString();
    const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
    return rounded.toString();
  }

  // Count Category in 'consolidated' purchase mode (round UP to whole number)
  if (mode === 'consolidated') {
    const ceilVal = Math.ceil(amount);
    return ceilVal.toString();
  }

  // Count Category in 'display' recipe/breakdown mode (fractions / mixed numbers)
  if (Number.isInteger(amount)) {
    return amount.toString();
  }

  const integerPart = Math.floor(amount);
  const decimalPart = amount - integerPart;

  const fractionStr = getCommonFraction(decimalPart);

  if (fractionStr) {
    if (integerPart === 0) {
      return fractionStr;
    }
    return `${integerPart} ${fractionStr}`;
  }

  // Non-clean decimal fallback: default to 1-2 decimal rounding
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
