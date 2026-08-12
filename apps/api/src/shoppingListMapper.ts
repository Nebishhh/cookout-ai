import {
  Quantity,
  ShoppingList,
  ShoppingListLine,
  type ShoppingListItem as DomainShoppingListItem,
} from '@cookout-ai/domain';
import type {
  ShoppingList as PrismaShoppingList,
  ShoppingListItem as PrismaShoppingListItem,
} from '@prisma/client';

export type PrismaShoppingListWithItems = PrismaShoppingList & {
  items: PrismaShoppingListItem[];
};

/**
 * Wraps each computed ShoppingListItem (the pure, identity-free output of
 * consolidateShoppingList()) with a fresh id and checked: false, producing the persisted,
 * checkable ShoppingListLine shape. This is the one place a "save" route turns a live
 * computation into something with its own identity and mutable state over time.
 */
export function buildShoppingListLinesFromConsolidated(
  items: readonly DomainShoppingListItem[]
): ShoppingListLine[] {
  return items.map(
    (item) =>
      new ShoppingListLine(
        crypto.randomUUID(),
        item.ingredientId,
        item.displayName,
        item.quantity,
        [...item.sourceRecipeIds],
        false
      )
  );
}

/**
 * Reconstructs a domain ShoppingList object from a Prisma database record.
 * Re-enforces domain invariants uniformly regardless of data source.
 */
export function toDomainShoppingList(prismaList: PrismaShoppingListWithItems): ShoppingList {
  const sortedItems = [...prismaList.items].sort((a, b) => a.position - b.position);

  const domainItems = sortedItems.map((item) => {
    let sourceRecipeIds: string[] = [];
    try {
      const parsed = JSON.parse(item.sourceRecipeIdsJson);
      if (Array.isArray(parsed)) {
        sourceRecipeIds = parsed.filter((id): id is string => typeof id === 'string');
      }
    } catch {
      sourceRecipeIds = [];
    }

    const quantity = new Quantity(item.amount, item.unit);
    return new ShoppingListLine(
      item.id,
      item.ingredientId,
      item.displayName,
      quantity,
      sourceRecipeIds,
      item.checked
    );
  });

  return new ShoppingList({
    id: prismaList.id,
    name: prismaList.name,
    eventId: prismaList.eventId,
    items: domainItems,
  });
}

/**
 * Formats a domain ShoppingList object for JSON API responses.
 */
export function toShoppingListJSON(domainList: ShoppingList) {
  return {
    id: domainList.id,
    name: domainList.name,
    eventId: domainList.eventId,
    items: domainList.items.map((line) => ({
      id: line.id,
      ingredientId: line.ingredientId,
      displayName: line.displayName,
      quantity: line.quantity.toJSON(),
      sourceRecipeIds: line.sourceRecipeIds,
      checked: line.checked,
    })),
  };
}
