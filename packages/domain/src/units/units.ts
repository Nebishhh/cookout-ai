import { InvalidUnitError } from '../errors.js';

export enum UnitCategory {
  Mass = 'Mass',
  Volume = 'Volume',
  Count = 'Count',
}

export const MASS_UNITS = ['g', 'kg', 'oz', 'lb'] as const;
export const VOLUME_UNITS = ['ml', 'l', 'tsp', 'tbsp', 'cup', 'fl oz'] as const;
export const COUNT_UNITS = ['count', 'clove', 'egg', 'onion'] as const;

export type MassUnit = (typeof MASS_UNITS)[number];
export type VolumeUnit = (typeof VOLUME_UNITS)[number];
export type CountUnit = (typeof COUNT_UNITS)[number];

export type SupportedUnit = MassUnit | VolumeUnit | CountUnit;

export interface UnitDefinition {
  readonly name: SupportedUnit;
  readonly category: UnitCategory;
}

/**
 * Note: The Count category currently groups genuinely different things together:
 * `count`, `clove`, `egg`, `onion` are not interchangeable the way `g` and `kg` are —
 * a clove and an onion are different ingredients, not different units of the same thing.
 * Count-category units may need to be modeled per-ingredient rather than as a shared
 * category in a future milestone.
 */
export const UNIT_REGISTRY: Record<SupportedUnit, UnitDefinition> = {
  // Mass
  g: { name: 'g', category: UnitCategory.Mass },
  kg: { name: 'kg', category: UnitCategory.Mass },
  oz: { name: 'oz', category: UnitCategory.Mass },
  lb: { name: 'lb', category: UnitCategory.Mass },

  // Volume
  ml: { name: 'ml', category: UnitCategory.Volume },
  l: { name: 'l', category: UnitCategory.Volume },
  tsp: { name: 'tsp', category: UnitCategory.Volume },
  tbsp: { name: 'tbsp', category: UnitCategory.Volume },
  cup: { name: 'cup', category: UnitCategory.Volume },
  'fl oz': { name: 'fl oz', category: UnitCategory.Volume },

  // Count
  count: { name: 'count', category: UnitCategory.Count },
  clove: { name: 'clove', category: UnitCategory.Count },
  egg: { name: 'egg', category: UnitCategory.Count },
  onion: { name: 'onion', category: UnitCategory.Count },
};

/**
 * Canonical base units per category:
 * - Mass: 'g' (grams)
 * - Volume: 'ml' (milliliters)
 *
 * Conversion factors are based on US Customary / Metric culinary standards (NIST Handbook 44):
 * - 1 kg = 1000 g
 * - 1 oz = 28.349523125 g (~28.3495 g)
 * - 1 lb = 453.59237 g (~453.592 g)
 * - 1 l = 1000 ml
 * - 1 tsp = 4.92892159375 ml (~4.92892 ml)
 * - 1 tbsp = 14.78676478125 ml (~14.7868 ml)
 * - 1 cup = 236.5882365 ml (~236.588 ml)
 * - 1 fl oz = 29.5735295625 ml (~29.5735 ml)
 */
export const BASE_UNITS: Record<UnitCategory.Mass | UnitCategory.Volume, SupportedUnit> = {
  [UnitCategory.Mass]: 'g',
  [UnitCategory.Volume]: 'ml',
};

export const CONVERSION_FACTORS_TO_BASE: Partial<Record<SupportedUnit, number>> = {
  // Mass (Base unit: g)
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,

  // Volume (Base unit: ml)
  ml: 1,
  l: 1000,
  tsp: 4.92892159375,
  tbsp: 14.78676478125,
  cup: 236.5882365,
  'fl oz': 29.5735295625,
};

export function isSupportedUnit(unit: string): unit is SupportedUnit {
  return Object.prototype.hasOwnProperty.call(UNIT_REGISTRY, unit);
}

export function getUnitDefinition(unit: string): UnitDefinition {
  if (!isSupportedUnit(unit)) {
    throw new InvalidUnitError(`Invalid or unsupported unit: "${unit}"`);
  }
  return UNIT_REGISTRY[unit];
}
