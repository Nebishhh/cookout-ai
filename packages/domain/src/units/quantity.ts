import { InvalidQuantityError, InvalidUnitError } from '../errors.js';
import {
  getUnitDefinition,
  isSupportedUnit,
  type SupportedUnit,
  type UnitCategory,
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
