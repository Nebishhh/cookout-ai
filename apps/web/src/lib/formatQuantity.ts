/**
 * Display-only utility to round quantity amounts to at most 2 decimal places.
 * Purely a rendering concern for kitchen legibility.
 * Example: formatQuantityAmount(6447.029444625) -> "6447.03"
 */
export function formatQuantityAmount(amount: number): string {
  if (!Number.isFinite(amount)) return '0';
  if (Number.isInteger(amount)) return amount.toString();
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  return rounded.toString();
}
