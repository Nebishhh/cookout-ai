import { UnitMismatchError } from '../errors.js';
import { Quantity } from './quantity.js';
import {
  BASE_UNITS,
  CONVERSION_FACTORS_TO_BASE,
  UnitCategory,
  type SupportedUnit,
} from './units.js';

/**
 * Open Question / Scope Notes:
 * - Kitchen units are a presentation-and-purchase concern layered over Quantity, which stays
 *   exact. Nothing here changes how conversion itself works.
 * - When a shopping-list line merges metric and US amounts, it answers in whichever system
 *   contributes the larger share of the total (largestShareSystem), compared in base units. That
 *   is a per-line decision, not a user-level preference.
 * - `fl oz` is a US unit but isn't on the US ladder: a merged US volume answers in tsp, tbsp or
 *   cup, which is how recipes and measuring cups are labelled.
 */

export type UnitSystem = 'metric' | 'us';

const UNIT_SYSTEMS: Readonly<Partial<Record<SupportedUnit, UnitSystem>>> = {
  g: 'metric',
  kg: 'metric',
  ml: 'metric',
  l: 'metric',
  oz: 'us',
  lb: 'us',
  tsp: 'us',
  tbsp: 'us',
  cup: 'us',
  'fl oz': 'us',
};

/** Metric or US for Mass and Volume units; null for Count units, which have no system. */
export function unitSystemOf(unit: SupportedUnit): UnitSystem | null {
  return UNIT_SYSTEMS[unit] ?? null;
}

type ConvertibleCategory = UnitCategory.Mass | UnitCategory.Volume;

/**
 * The system contributing the larger share of a set of same-category amounts, compared in base
 * units: 2 tbsp (29.6 ml, US) + 500 ml (metric) is metric, whichever line comes first. An exact
 * tie goes to the first line's system, so the answer is always deterministic.
 *
 * @throws UnitMismatchError for an empty list, a Count quantity, or mixed categories.
 */
export function largestShareSystem(quantities: readonly Quantity[]): UnitSystem {
  if (quantities.length === 0) {
    throw new UnitMismatchError('largestShareSystem() needs at least one quantity.');
  }

  const category = quantities[0].category;
  if (category === UnitCategory.Count) {
    throw new UnitMismatchError(
      `largestShareSystem() handles Mass and Volume only, not "${quantities[0].unit}".`
    );
  }

  const baseUnit = BASE_UNITS[category];
  const shares: Record<UnitSystem, number> = { metric: 0, us: 0 };
  for (const quantity of quantities) {
    if (quantity.category !== category) {
      throw new UnitMismatchError(
        `largestShareSystem() needs one category; got ${category} and ${quantity.category}.`
      );
    }
    shares[unitSystemOf(quantity.unit)!] += quantity.convertTo(baseUnit).amount;
  }

  if (shares.metric === shares.us) return unitSystemOf(quantities[0].unit)!;
  return shares.metric > shares.us ? 'metric' : 'us';
}

/** Each system's kitchen units for a category, smallest first. */
const LADDERS: Readonly<
  Record<ConvertibleCategory, Readonly<Record<UnitSystem, readonly SupportedUnit[]>>>
> = {
  [UnitCategory.Mass]: { metric: ['g', 'kg'], us: ['oz', 'lb'] },
  [UnitCategory.Volume]: { metric: ['ml', 'l'], us: ['tsp', 'tbsp', 'cup'] },
};

/**
 * Chooses the unit a merged amount should be shown and bought in: the largest unit of the given
 * system that keeps the amount at 1 or more (573 ml is 2.42 cup in the US system, 573 ml in the
 * metric one, never 0.57 l), falling back to the system's smallest unit for tiny amounts.
 *
 * @param amountInBase The amount in the category's base unit (g for Mass, ml for Volume).
 */
export function pickKitchenUnit(
  amountInBase: number,
  category: ConvertibleCategory,
  system: UnitSystem
): SupportedUnit {
  const ladder = LADDERS[category][system];
  for (let i = ladder.length - 1; i > 0; i--) {
    const unit = ladder[i];
    if (amountInBase / CONVERSION_FACTORS_TO_BASE[unit]! >= 1) return unit;
  }
  return ladder[0];
}

/**
 * US kitchen units, bought in kitchen fractions (¼, ⅓, ½, ⅔, ¾). Exported so the web formatter
 * shows exactly these as fractions.
 */
export const PRACTICAL_FRACTION_UNITS: readonly SupportedUnit[] = Object.freeze([
  'tsp',
  'tbsp',
  'cup',
  'fl oz',
  'oz',
  'lb',
]);

/** Kilograms and litres, bought in tenths (1.1 kg, 1.7 l) and shown as decimals. */
export const TENTH_ROUNDED_UNITS: readonly SupportedUnit[] = Object.freeze(['kg', 'l']);

/** Steps a fractional part rounds up to, ascending, ending at the next whole unit. */
const PRACTICAL_STEPS = [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1] as const;

/** Relative tolerance for floating-point crumbs: 3.0000000000000004 is 3, not "just over 3". */
const CRUMB = 1e-9;

/** Rounds up to a whole number, ignoring a floating-point crumb above it. */
function ceilIgnoringCrumb(value: number): number {
  return Math.ceil(value - CRUMB * Math.max(1, value));
}

/**
 * Rounds a Mass or Volume quantity UP to an amount you can actually measure or buy, in the same
 * unit:
 * - US kitchen units (PRACTICAL_FRACTION_UNITS): the next kitchen fraction. 2.3 cup → 2 1/3 cup.
 * - kg and l (TENTH_ROUNDED_UNITS): the next tenth. 1.13 kg → 1.2 kg; 1.1 kg stays 1.1 kg.
 * - g and ml: the next whole number. 158.01 g → 159 g.
 *
 * Never rounds down, so a shopping list never under-buys — except to drop a floating-point crumb,
 * so an amount a hair above a step stays on that step instead of jumping to the next one.
 *
 * @throws UnitMismatchError for a Count quantity (those round to whole items elsewhere).
 */
export function roundUpToPracticalAmount(quantity: Quantity): Quantity {
  if (quantity.category === UnitCategory.Count) {
    throw new UnitMismatchError(
      `roundUpToPracticalAmount() handles Mass and Volume only, not "${quantity.unit}".`
    );
  }

  const { amount, unit } = quantity;

  if (TENTH_ROUNDED_UNITS.includes(unit)) {
    return new Quantity(ceilIgnoringCrumb(amount * 10) / 10, unit);
  }

  if (!PRACTICAL_FRACTION_UNITS.includes(unit)) {
    return new Quantity(ceilIgnoringCrumb(amount), unit);
  }

  const crumb = CRUMB * Math.max(1, amount);
  const whole = Math.floor(amount);
  const fraction = amount - whole;
  const step = PRACTICAL_STEPS.find((s) => fraction <= s + crumb) ?? 1;
  return new Quantity(whole + step, unit);
}

/** True when rounding moved an amount by more than a floating-point crumb. */
export function differsByMoreThanCrumb(a: number, b: number): boolean {
  return Math.abs(a - b) > CRUMB * Math.max(1, Math.abs(a), Math.abs(b));
}
