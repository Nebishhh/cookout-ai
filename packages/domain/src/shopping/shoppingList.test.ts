import { describe, expect, it } from 'vitest';
import { InvalidShoppingListError, Quantity, ShoppingList, ShoppingListLine } from '../index.js';

describe('ShoppingList Construction & Validation', () => {
  const validLine = () =>
    new ShoppingListLine('line-1', 'cheese', 'Cheddar', new Quantity(200, 'g'), ['r1']);

  it('creates a valid standalone ShoppingList (eventId null)', () => {
    const list = new ShoppingList({
      id: 'list-1',
      name: 'Weekly Groceries',
      eventId: null,
      items: [validLine()],
    });

    expect(list.id).toBe('list-1');
    expect(list.name).toBe('Weekly Groceries');
    expect(list.eventId).toBeNull();
    expect(list.items).toHaveLength(1);
  });

  it('creates a valid event-linked ShoppingList (eventId set)', () => {
    const list = new ShoppingList({
      id: 'list-1',
      name: 'Thanksgiving List',
      eventId: 'event-1',
      items: [],
    });

    expect(list.eventId).toBe('event-1');
  });

  it('creates a valid ShoppingList with zero items', () => {
    const list = new ShoppingList({ id: 'list-1', name: 'Empty', eventId: null, items: [] });
    expect(list.items).toEqual([]);
  });

  it('rejects empty or whitespace-only id', () => {
    expect(() => new ShoppingList({ id: '', name: 'Groceries', eventId: null, items: [] })).toThrow(
      InvalidShoppingListError
    );
  });

  it('rejects empty or whitespace-only name', () => {
    expect(() => new ShoppingList({ id: 'list-1', name: '', eventId: null, items: [] })).toThrow(
      InvalidShoppingListError
    );
  });

  it('rejects eventId that is undefined (must be a string or exactly null)', () => {
    expect(
      () =>
        new ShoppingList({
          id: 'list-1',
          name: 'Groceries',
          // @ts-expect-error testing invalid input type
          eventId: undefined,
          items: [],
        })
    ).toThrow(InvalidShoppingListError);
  });

  it('rejects an empty-string eventId', () => {
    expect(
      () => new ShoppingList({ id: 'list-1', name: 'Groceries', eventId: '', items: [] })
    ).toThrow(InvalidShoppingListError);
  });

  it('rejects a non-array items value', () => {
    expect(
      () =>
        new ShoppingList({
          id: 'list-1',
          name: 'Groceries',
          eventId: null,
          // @ts-expect-error testing invalid input type
          items: 'not-an-array',
        })
    ).toThrow(InvalidShoppingListError);
  });

  it('rejects an items array containing non-ShoppingListLine elements', () => {
    expect(
      () =>
        new ShoppingList({
          id: 'list-1',
          name: 'Groceries',
          eventId: null,
          // @ts-expect-error testing invalid element type
          items: ['not-a-line'],
        })
    ).toThrow(InvalidShoppingListError);
  });

  it('is frozen and rejects mutation of items', () => {
    const list = new ShoppingList({
      id: 'list-1',
      name: 'Groceries',
      eventId: null,
      items: [validLine()],
    });

    expect(Object.isFrozen(list)).toBe(true);
    expect(Object.isFrozen(list.items)).toBe(true);
    expect(() => {
      // @ts-expect-error mutating readonly array for test
      list.items.push(validLine());
    }).toThrow();
  });

  it('does not mutate the input items array', () => {
    const items = [validLine()];
    const list = new ShoppingList({ id: 'list-1', name: 'Groceries', eventId: null, items });

    items.push(validLine());
    expect(list.items).toHaveLength(1);
  });
});
