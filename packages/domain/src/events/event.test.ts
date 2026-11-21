import { describe, expect, it } from 'vitest';
import {
  Course,
  Event,
  GuestGroup,
  InvalidEventError,
  MAX_RECIPES_PER_EVENT,
  type EventDishInput,
} from '../index.js';

describe('Event Construction & Validation', () => {
  const validGuestGroup = () => new GuestGroup({ totalGuests: 10, vegetarianCount: 2 });
  const dishesFor = (...recipeIds: string[]): EventDishInput[] =>
    recipeIds.map((recipeId) => ({ recipeId }));

  it('creates a valid Event with dishes, deriving recipeIds from them', () => {
    const event = new Event({
      id: 'event-1',
      name: 'Thanksgiving 2026',
      guestGroup: validGuestGroup(),
      dishes: [{ recipeId: 'r1' }, { recipeId: 'r2', course: Course.Main, servingsOverride: 6 }],
    });

    expect(event.id).toBe('event-1');
    expect(event.name).toBe('Thanksgiving 2026');
    expect(event.guestGroup.totalGuests).toBe(10);
    expect(event.recipeIds).toEqual(['r1', 'r2']);
    expect(event.dishes).toEqual([
      { recipeId: 'r1', course: null, servingsOverride: null },
      { recipeId: 'r2', course: Course.Main, servingsOverride: 6 },
    ]);
  });

  it('creates a valid Event with no dishes (menu filled in later)', () => {
    const event = new Event({
      id: 'event-1',
      name: 'Someday BBQ',
      guestGroup: validGuestGroup(),
      dishes: [],
    });

    expect(event.dishes).toEqual([]);
    expect(event.recipeIds).toEqual([]);
  });

  it('rejects empty or whitespace-only id', () => {
    expect(
      () => new Event({ id: '', name: 'Party', guestGroup: validGuestGroup(), dishes: [] })
    ).toThrow(InvalidEventError);
    expect(
      () => new Event({ id: '   ', name: 'Party', guestGroup: validGuestGroup(), dishes: [] })
    ).toThrow(InvalidEventError);
  });

  it('rejects empty or whitespace-only name', () => {
    expect(
      () => new Event({ id: 'event-1', name: '', guestGroup: validGuestGroup(), dishes: [] })
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
          dishes: [],
        })
    ).toThrow(InvalidEventError);
  });

  it('rejects a non-array dishes', () => {
    expect(
      () =>
        new Event({
          id: 'event-1',
          name: 'Party',
          guestGroup: validGuestGroup(),
          // @ts-expect-error testing invalid input type
          dishes: 'not-an-array',
        })
    ).toThrow(InvalidEventError);
  });

  it('rejects a dish whose recipeId is empty', () => {
    expect(
      () =>
        new Event({
          id: 'event-1',
          name: 'Party',
          guestGroup: validGuestGroup(),
          dishes: dishesFor('r1', ''),
        })
    ).toThrow(InvalidEventError);
  });

  it('rejects a dish with an unknown course', () => {
    expect(
      () =>
        new Event({
          id: 'event-1',
          name: 'Party',
          guestGroup: validGuestGroup(),
          // @ts-expect-error testing invalid input type
          dishes: [{ recipeId: 'r1', course: 'Starter' }],
        })
    ).toThrow(InvalidEventError);
  });

  it.each([0, -1, 2.5, NaN, Infinity])('rejects a servings override of %s', (bad) => {
    expect(
      () =>
        new Event({
          id: 'event-1',
          name: 'Party',
          guestGroup: validGuestGroup(),
          dishes: [{ recipeId: 'r1', servingsOverride: bad }],
        })
    ).toThrow(InvalidEventError);
  });

  it('is frozen, along with its dishes and derived recipeIds', () => {
    const event = new Event({
      id: 'event-1',
      name: 'Party',
      guestGroup: validGuestGroup(),
      dishes: dishesFor('r1'),
    });

    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.dishes)).toBe(true);
    expect(Object.isFrozen(event.dishes[0])).toBe(true);
    expect(Object.isFrozen(event.recipeIds)).toBe(true);
    expect(() => {
      // @ts-expect-error mutating readonly array for test
      event.recipeIds.push('r2');
    }).toThrow();
  });

  it('does not mutate or keep a reference to the input dishes', () => {
    const dishes = dishesFor('r1', 'r2');
    const event = new Event({
      id: 'event-1',
      name: 'Party',
      guestGroup: validGuestGroup(),
      dishes,
    });

    dishes.push({ recipeId: 'r3' });
    dishes[0].course = Course.Side;
    expect(event.recipeIds).toEqual(['r1', 'r2']);
    expect(event.dishes[0].course).toBeNull();
  });

  it('collapses duplicate recipes, keeping first-seen order and the first dish settings', () => {
    const event = new Event({
      id: 'event-1',
      name: 'Party',
      guestGroup: validGuestGroup(),
      dishes: [
        { recipeId: 'r2', course: Course.Main },
        { recipeId: 'r1' },
        { recipeId: 'r2', course: Course.Side, servingsOverride: 9 },
        { recipeId: 'r3' },
        { recipeId: 'r1', course: Course.Dessert },
      ],
    });

    expect(event.recipeIds).toEqual(['r2', 'r1', 'r3']);
    expect(event.dishes[0]).toEqual({
      recipeId: 'r2',
      course: Course.Main,
      servingsOverride: null,
    });
    expect(event.dishes[1].course).toBeNull();
  });

  it('does not cap dishes itself, so events stored before MAX_RECIPES_PER_EVENT still load', () => {
    const dishes = dishesFor(
      ...Array.from({ length: MAX_RECIPES_PER_EVENT + 1 }, (_, i) => `r${i}`)
    );
    const event = new Event({
      id: 'event-1',
      name: 'Party',
      guestGroup: validGuestGroup(),
      dishes,
    });

    expect(event.recipeIds).toHaveLength(MAX_RECIPES_PER_EVENT + 1);
  });

  describe('serveTimeMinutes', () => {
    const buildWith = (serveTimeMinutes?: number | null) =>
      new Event({
        id: 'event-1',
        name: 'Cookout',
        guestGroup: validGuestGroup(),
        dishes: dishesFor('r1'),
        serveTimeMinutes,
      });

    it('defaults to null when omitted (no cook schedule requested)', () => {
      expect(buildWith().serveTimeMinutes).toBeNull();
    });

    it('accepts an explicit null', () => {
      expect(buildWith(null).serveTimeMinutes).toBeNull();
    });

    it('accepts a wall-clock minute offset', () => {
      expect(buildWith(18 * 60).serveTimeMinutes).toBe(1080); // 6pm
    });

    it('accepts the boundaries (midnight and 23:59)', () => {
      expect(buildWith(0).serveTimeMinutes).toBe(0);
      expect(buildWith(1439).serveTimeMinutes).toBe(1439);
    });

    it.each([-1, 1440, 12.5, NaN])('rejects out-of-range or non-integer value: %s', (bad) => {
      expect(() => buildWith(bad)).toThrow(InvalidEventError);
    });
  });
});
