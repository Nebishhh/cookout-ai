import { describe, expect, it } from 'vitest';
import { Event, GuestGroup, InvalidEventError } from '../index.js';

describe('Event Construction & Validation', () => {
  const validGuestGroup = () => new GuestGroup({ totalGuests: 10, vegetarianCount: 2 });

  it('creates a valid Event with recipeIds', () => {
    const event = new Event({
      id: 'event-1',
      name: 'Thanksgiving 2026',
      guestGroup: validGuestGroup(),
      recipeIds: ['r1', 'r2'],
    });

    expect(event.id).toBe('event-1');
    expect(event.name).toBe('Thanksgiving 2026');
    expect(event.guestGroup.totalGuests).toBe(10);
    expect(event.recipeIds).toEqual(['r1', 'r2']);
  });

  it('creates a valid Event with zero recipeIds (menu filled in later)', () => {
    const event = new Event({
      id: 'event-1',
      name: 'Someday BBQ',
      guestGroup: validGuestGroup(),
      recipeIds: [],
    });

    expect(event.recipeIds).toEqual([]);
  });

  it('rejects empty or whitespace-only id', () => {
    expect(
      () => new Event({ id: '', name: 'Party', guestGroup: validGuestGroup(), recipeIds: [] })
    ).toThrow(InvalidEventError);
    expect(
      () => new Event({ id: '   ', name: 'Party', guestGroup: validGuestGroup(), recipeIds: [] })
    ).toThrow(InvalidEventError);
  });

  it('rejects empty or whitespace-only name', () => {
    expect(
      () => new Event({ id: 'event-1', name: '', guestGroup: validGuestGroup(), recipeIds: [] })
    ).toThrow(InvalidEventError);
  });

  it('rejects a guestGroup that is not a GuestGroup instance', () => {
    expect(
      () =>
        new Event({
          id: 'event-1',
          name: 'Party',
          // @ts-expect-error testing invalid input type
          guestGroup: { totalGuests: 10 },
          recipeIds: [],
        })
    ).toThrow(InvalidEventError);
  });

  it('rejects a non-array recipeIds', () => {
    expect(
      () =>
        new Event({
          id: 'event-1',
          name: 'Party',
          guestGroup: validGuestGroup(),
          // @ts-expect-error testing invalid input type
          recipeIds: 'not-an-array',
        })
    ).toThrow(InvalidEventError);
  });

  it('rejects recipeIds containing an empty string', () => {
    expect(
      () =>
        new Event({
          id: 'event-1',
          name: 'Party',
          guestGroup: validGuestGroup(),
          recipeIds: ['r1', ''],
        })
    ).toThrow(InvalidEventError);
  });

  it('is frozen and rejects mutation of recipeIds', () => {
    const event = new Event({
      id: 'event-1',
      name: 'Party',
      guestGroup: validGuestGroup(),
      recipeIds: ['r1'],
    });

    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.recipeIds)).toBe(true);
    expect(() => {
      // @ts-expect-error mutating readonly array for test
      event.recipeIds.push('r2');
    }).toThrow();
  });

  it('does not mutate the input recipeIds array', () => {
    const recipeIds = ['r1', 'r2'];
    const event = new Event({
      id: 'event-1',
      name: 'Party',
      guestGroup: validGuestGroup(),
      recipeIds,
    });

    recipeIds.push('r3');
    expect(event.recipeIds).toEqual(['r1', 'r2']);
  });
});
