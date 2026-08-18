/**
 * Display-only formatters for a recipe step's optional duration/temperature, plus the
 * wall-clock formatting the cook schedule needs. Purely a presentation concern, mirroring
 * formatQuantity.ts's role for ingredient amounts — but simpler, since neither value is ever
 * scaled by serving count, so no fraction formatting is needed.
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

/**
 * Renders wall-clock minutes-from-midnight as a 12-hour time.
 *
 * A negative value means the previous day — a 20-hour brisket served at 6pm genuinely starts
 * the day before, and computeCookSchedule() deliberately returns a negative rather than
 * clamping at zero (which would silently claim an unmeetable schedule is fine). Values are
 * wrapped back into a real time of day and suffixed so the host isn't left reading "-2:00".
 */
export function formatClockTime(minutesFromMidnight: number): string {
  const MINUTES_PER_DAY = 24 * 60;
  const rounded = Math.round(minutesFromMidnight);

  // Floor-mod so -120 becomes 22:00, and track how many days back that wrapped.
  const wrapped = ((rounded % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const daysEarlier = Math.ceil((0 - rounded) / MINUTES_PER_DAY);

  const hours24 = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const base = `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`;

  if (rounded >= 0) {
    return base;
  }
  return daysEarlier === 1 ? `${base} (prev. day)` : `${base} (${daysEarlier} days earlier)`;
}

/** Renders a total number of minutes as a compact "2 hr 15 min" style duration. */
export function formatTotalMinutes(totalMinutes: number): string {
  const rounded = Math.round(totalMinutes);
  if (rounded <= 0) {
    return '0 min';
  }
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (hours === 0) {
    return `${minutes} min`;
  }
  if (minutes === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${minutes} min`;
}
