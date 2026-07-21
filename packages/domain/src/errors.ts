/**
 * Base class for all domain-specific errors in CookOut AI.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a quantity amount or scaling factor is invalid (negative, NaN, or infinite).
 */
export class InvalidQuantityError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Thrown when a measurement unit is not recognized in the unit registry.
 */
export class InvalidUnitError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Thrown when attempting an operation on quantities with incompatible units or categories.
 */
export class UnitMismatchError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}
