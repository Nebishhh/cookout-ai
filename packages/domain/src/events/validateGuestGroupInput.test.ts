import { describe, expect, it } from 'vitest';
import { GuestGroup, validateGuestGroupInput } from './guestGroup.js';

describe('validateGuestGroupInput()', () => {
  it('returns no errors for a valid breakdown', () => {
    expect(validateGuestGroupInput({ totalGuests: 12, vegetarianCount: 3, veganCount: 1 })).toEqual(
      []
    );
    expect(validateGuestGroupInput({ totalGuests: 4 })).toEqual([]);
  });

  it('puts "more vegetarians than guests" on the vegetarian field, in plain words', () => {
    expect(validateGuestGroupInput({ totalGuests: 4, vegetarianCount: 6, veganCount: 0 })).toEqual([
      {
        field: 'vegetarianCount',
        message: "Vegetarian guests can't be more than the 4 total guests.",
      },
    ]);
  });

  it('puts "more vegans than vegetarians" on the vegan field', () => {
    expect(validateGuestGroupInput({ totalGuests: 10, vegetarianCount: 2, veganCount: 3 })).toEqual(
      [
        {
          field: 'veganCount',
          message:
            "Vegan guests count as vegetarian too, so there can't be more than the 2 vegetarian guests.",
        },
      ]
    );
  });

  it('reports both cross-field problems at once', () => {
    const fields = validateGuestGroupInput({
      totalGuests: 2,
      vegetarianCount: 5,
      veganCount: 6,
    }).map((e) => e.field);
    expect(fields).toEqual(['vegetarianCount', 'veganCount']);
  });

  it('rejects non-positive or fractional counts per field', () => {
    expect(validateGuestGroupInput({ totalGuests: 0 })).toEqual([
      { field: 'totalGuests', message: 'Enter at least 1 guest, as a whole number.' },
    ]);
    expect(
      validateGuestGroupInput({ totalGuests: 5, vegetarianCount: -1, veganCount: 1.5 }).map(
        (e) => e.field
      )
    ).toEqual(['vegetarianCount', 'veganCount']);
  });

  it('never names an internal field in a message', () => {
    const messages = validateGuestGroupInput({
      totalGuests: 2,
      vegetarianCount: 5,
      veganCount: 6,
    }).map((e) => e.message);
    for (const message of messages) {
      expect(message).not.toMatch(/totalGuests|vegetarianCount|veganCount/);
    }
  });

  it('agrees with the GuestGroup constructor on every input in a grid', () => {
    const values = [-1, 0, 1, 2, 3, 2.5];
    for (const totalGuests of values) {
      for (const vegetarianCount of values) {
        for (const veganCount of values) {
          const input = { totalGuests, vegetarianCount, veganCount };
          let constructorThrows = false;
          try {
            new GuestGroup(input);
          } catch {
            constructorThrows = true;
          }
          expect(validateGuestGroupInput(input).length > 0, JSON.stringify(input)).toBe(
            constructorThrows
          );
        }
      }
    }
  });
});
