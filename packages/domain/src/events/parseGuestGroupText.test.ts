import { describe, expect, it } from 'vitest';
import { parseGuestGroupText } from './parseGuestGroupText.js';

describe('parseGuestGroupText', () => {
  it('parses "dinner for 12, 3 vegetarian, 1 vegan"', () => {
    expect(parseGuestGroupText('dinner for 12, 3 vegetarian, 1 vegan')).toEqual({
      totalGuests: 12,
      vegetarianCount: 3,
      veganCount: 1,
    });
  });

  it('infers vegetarianCount from veganCount when "vegetarian" is never stated', () => {
    expect(parseGuestGroupText('hosting 8 people, 2 vegans')).toEqual({
      totalGuests: 8,
      vegetarianCount: 2,
      veganCount: 2,
    });
  });

  it('parses "20 guests total" with no dietary counts', () => {
    expect(parseGuestGroupText('20 guests total')).toEqual({
      totalGuests: 20,
      vegetarianCount: 0,
      veganCount: 0,
    });
  });

  it('parses "party of 15"', () => {
    expect(parseGuestGroupText('party of 15')).toEqual({
      totalGuests: 15,
      vegetarianCount: 0,
      veganCount: 0,
    });
  });

  it('parses a description with no dietary words at all', () => {
    expect(parseGuestGroupText('brunch for 6')).toEqual({
      totalGuests: 6,
      vegetarianCount: 0,
      veganCount: 0,
    });
  });

  it('does not false-match a digit inside "none vegan"', () => {
    expect(parseGuestGroupText("we're having 10 attendees, 4 vegetarians, none vegan")).toEqual({
      totalGuests: 10,
      vegetarianCount: 4,
      veganCount: 0,
    });
  });

  it('does not treat an ordinal ("3rd") as a vegetarian count', () => {
    expect(parseGuestGroupText('the 3rd vegetarian option was popular, 20 guests total')).toEqual({
      totalGuests: 20,
      vegetarianCount: 0,
      veganCount: 0,
    });
  });

  it('is case-insensitive', () => {
    expect(parseGuestGroupText('DINNER FOR 12, 3 VEGETARIAN, 1 VEGAN')).toEqual({
      totalGuests: 12,
      vegetarianCount: 3,
      veganCount: 1,
    });
  });

  it('returns raw extracted values unchanged even when internally inconsistent', () => {
    // Deliberate: this parser only extracts, it never corrects or validates — enforcing
    // veganCount <= vegetarianCount <= totalGuests is GuestGroup's job, not this function's.
    // If this test ever needs to change, that boundary decision needs to change first.
    expect(parseGuestGroupText('party for 5, 8 vegetarian, 9 vegan')).toEqual({
      totalGuests: 5,
      vegetarianCount: 8,
      veganCount: 9,
    });
  });

  it('returns null for word-numbers, which are out of scope for this regex', () => {
    expect(parseGuestGroupText('a dozen people are coming, most eat meat')).toBeNull();
    expect(parseGuestGroupText('twelve guests for dinner')).toBeNull();
  });

  it('returns null when there are no digits at all', () => {
    expect(parseGuestGroupText('big family gathering, need to feed everyone')).toBeNull();
  });

  it('returns null when dietary counts are present but no total-guest signal is found', () => {
    expect(parseGuestGroupText('3 vegans coming')).toBeNull();
  });

  it('returns null for an empty or whitespace-only string', () => {
    expect(parseGuestGroupText('')).toBeNull();
    expect(parseGuestGroupText('   ')).toBeNull();
  });
});
