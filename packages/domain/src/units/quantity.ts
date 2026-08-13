import { InvalidQuantityError, InvalidUnitError, UnitMismatchError } from '../errors.js';
import {
  CONVERSION_FACTORS_TO_BASE,
  getUnitDefinition,
  isSupportedUnit,
  UnitCategory,
  type SupportedUnit,
} from './units.js';

export interface QuantityJSON {
  amount: number;
  unit: SupportedUnit;
  category: UnitCategory;
}

export class Quantity {
  readonly amount: number;
  readonly unit: SupportedUnit;
  readonly category: UnitCategory;

  constructor(amount: number, unit: string) {
    if (typeof amount !== 'number' || isNaN(amount) || !Number.isFinite(amount) || amount < 0) {
      throw new InvalidQuantityError(
        `Invalid quantity amount: ${amount}. Amount must be a non-negative finite number.`
      );
    }

    if (!isSupportedUnit(unit)) {
      throw new InvalidUnitError(`Invalid or unsupported unit: "${unit}".`);
    }

    const definition = getUnitDefinition(unit);

    this.amount = amount;
    this.unit = definition.name;
    this.category = definition.category;

    Object.freeze(this);
  }

  scale(factor: number): Quantity {
    if (typeof factor !== 'number' || isNaN(factor) || !Number.isFinite(factor) || factor < 0) {
      throw new InvalidQuantityError(
        `Invalid scaling factor: ${factor}. Factor must be a non-negative finite number.`
      );
    }

    return new Quantity(this.amount * factor, this.unit);
  }

  /**
   * Converts this Quantity to a target unit within the same UnitCategory (Mass or Volume only).
   *
   * Open Questions / Scope Notes:
   * - Floating point precision / rounding on repeated conversions (e.g. repeating decimals from cup/tsp conversions)
   *   is a known open issue, not addressed in this milestone.
   * - Ingredient-specific density (required for cross-category Volume <-> Mass conversions, e.g. cups of flour to grams)
   *   is explicitly out of scope and not supported.
   *
   * @param targetUnit The target unit to convert to.
   * @returns A new Quantity converted to the target unit.
   * @throws InvalidUnitError if targetUnit is not a supported unit.
   * @throws UnitMismatchError if converting across categories, or if any unit belongs to the Count category.
   */
  convertTo(targetUnit: string): Quantity {
    if (!isSupportedUnit(targetUnit)) {
      throw new InvalidUnitError(`Invalid or unsupported target unit: "${targetUnit}".`);
    }

    if (this.unit === targetUnit) {
      return this;
    }

    const targetDef = getUnitDefinition(targetUnit);

    if (
      this.category === UnitCategory.Count ||
      targetDef.category === UnitCategory.Count ||
      this.category !== targetDef.category
    ) {
      throw new UnitMismatchError(
        `Cannot convert between "${this.unit}" (${this.category}) and "${targetUnit}" (${targetDef.category}).`
      );
    }

    const sourceFactor = CONVERSION_FACTORS_TO_BASE[this.unit];
    const targetFactor = CONVERSION_FACTORS_TO_BASE[targetUnit as SupportedUnit];

    if (!sourceFactor || !targetFactor) {
      throw new UnitMismatchError(
        `Conversion factor missing for unit: "${this.unit}" or "${targetUnit}".`
      );
    }

    const amountInBase = this.amount * sourceFactor;
    const convertedAmount = amountInBase / targetFactor;

    return new Quantity(convertedAmount, targetUnit);
  }

  /**
   * Subtracts `other` from this Quantity, converting `other` into this Quantity's unit first
   * (reusing convertTo()'s category/Count guards — throws UnitMismatchError on incompatible
   * units, same as convertTo()).
   *
   * Clamps at zero rather than throwing InvalidQuantityError for a would-be-negative result:
   * "fully covered, nothing left to buy" is valid data, matching the "zero is valid, not an
   * error" precedent already established elsewhere in this domain (an empty ShoppingList is
   * valid, a recipe with zero eligible guests is valid). Whether a zeroed-out item should then
   * be omitted from a shopping list entirely is a decision for the caller (e.g. pantry-stock
   * subtraction), not this general-purpose arithmetic primitive.
   *
   * @param other The Quantity to subtract.
   * @returns A new Quantity in this Quantity's unit.
   * @throws UnitMismatchError if `other` is in an incompatible unit/category (same rules as convertTo()).
   */
  subtract(other: Quantity): Quantity {
    const converted = other.convertTo(this.unit);
    return new Quantity(Math.max(0, this.amount - converted.amount), this.unit);
  }

  equals(other: unknown): boolean {
    if (!(other instanceof Quantity)) {
      return false;
    }
    return this.amount === other.amount && this.unit === other.unit;
  }

  toJSON(): QuantityJSON {
    return {
      amount: this.amount,
      unit: this.unit,
      category: this.category,
    };
  }

  toString(): string {
    return `${this.amount} ${this.unit}`;
  }
}
