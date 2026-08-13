/**
 * Display-only formatters for a recipe step's optional duration/temperature. Purely a
 * presentation concern, mirroring formatQuantity.ts's role for ingredient amounts — but
 * simpler, since neither value is ever summed/scaled across a recipe, so no fraction
 * formatting is needed.
 */

export function formatDuration(amount: number, unit: string): string {
  const label = unit === 'hours' ? (amount === 1 ? 'hr' : 'hrs') : 'min';
  const rounded = Number.isInteger(amount)
    ? amount
    : Math.round((amount + Number.EPSILON) * 100) / 100;
  return `${rounded} ${label}`;
}

export function formatTemperature(amount: number, unit: string): string {
  const rounded = Number.isInteger(amount)
    ? amount
    : Math.round((amount + Number.EPSILON) * 100) / 100;
  return `${rounded}°${unit}`;
}
