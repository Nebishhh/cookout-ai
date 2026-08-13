import {
  Event,
  GuestGroup,
  InvalidEventError,
  InvalidGuestGroupError,
  subtractPantryStock,
} from '@cookout-ai/domain';
import type { EventPlan, GroceryCategory, Quantity } from '@cookout-ai/domain';
import type { Event as PrismaEvent } from '@prisma/client';
import { resolveCategory } from './categoryOverrides.js';

export interface CreateGuestGroupInput {
  totalGuests: number;
  vegetarianCount?: number;
  veganCount?: number;
}

export interface CreateEventInput {
  name: string;
  guestGroup: CreateGuestGroupInput;
  recipeIds: string[];
}

/**
 * Validates request body by constructing a domain Event object first.
 * Reuses domain validation from @cookout-ai/domain (GuestGroup, Event).
 *
 * @throws DomainError (InvalidGuestGroupError, InvalidEventError) if invalid.
 */
export function validateAndCreateDomainEvent(input: CreateEventInput, overrideId?: string): Event {
  if (!input || typeof input !== 'object') {
    throw new InvalidEventError('Invalid request body.');
  }

  if (!input.guestGroup || typeof input.guestGroup !== 'object') {
    throw new InvalidGuestGroupError('Request body must include a guestGroup object.');
  }

  const eventId = overrideId || crypto.randomUUID();
  const guestGroup = new GuestGroup(input.guestGroup);

  return new Event({
    id: eventId,
    name: input.name,
    guestGroup,
    recipeIds: input.recipeIds,
  });
}

/**
 * Reconstructs a domain Event object from a Prisma database record.
 * Re-enforces domain invariants uniformly regardless of data source.
 */
export function toDomainEvent(prismaEvent: PrismaEvent): Event {
  let recipeIds: string[] = [];
  try {
    const parsed = JSON.parse(prismaEvent.recipeIdsJson);
    if (Array.isArray(parsed)) {
      recipeIds = parsed.filter((id): id is string => typeof id === 'string');
    }
  } catch {
    recipeIds = [];
  }

  const guestGroup = new GuestGroup({
    totalGuests: prismaEvent.totalGuests,
    vegetarianCount: prismaEvent.vegetarianCount,
    veganCount: prismaEvent.veganCount,
  });

  return new Event({
    id: prismaEvent.id,
    name: prismaEvent.name,
    guestGroup,
    recipeIds,
  });
}

/**
 * Formats a domain Event object for JSON API responses (summary shape — no recomputed plan).
 * shoppingListId defaults to null until persisted ShoppingList support links one.
 */
export function toEventSummaryJSON(domainEvent: Event, shoppingListId: string | null = null) {
  return {
    id: domainEvent.id,
    name: domainEvent.name,
    guestGroup: {
      totalGuests: domainEvent.guestGroup.totalGuests,
      vegetarianCount: domainEvent.guestGroup.vegetarianCount,
      veganCount: domainEvent.guestGroup.veganCount,
      omnivoreCount: domainEvent.guestGroup.omnivoreCount,
    },
    recipeIds: domainEvent.recipeIds,
    shoppingListId,
  };
}

/**
 * Formats a computed EventPlan (from planEventShoppingList) for JSON API responses.
 * Shared by the ephemeral preview route (POST /api/events/plan) and every persisted
 * Event route that recomputes the plan live on read.
 * `categoryOverrides` (ingredientId -> manually-corrected GroceryCategory) is applied on top
 * of each shopping-list item's heuristic-derived category — see categoryOverrides.ts.
 * `pantryStock` (ingredientId -> on-hand Quantity) reduces/omits shopping-list items the same
 * way it does for every other shopping-list-producing route — see pantryStore.ts.
 */
export function serializeEventPlan(
  eventPlan: EventPlan,
  categoryOverrides: ReadonlyMap<string, GroceryCategory> = new Map(),
  pantryStock: ReadonlyMap<string, Quantity> = new Map()
) {
  const shoppingList = subtractPantryStock(eventPlan.shoppingList, pantryStock);

  return {
    guestGroup: {
      totalGuests: eventPlan.guestGroup.totalGuests,
      vegetarianCount: eventPlan.guestGroup.vegetarianCount,
      veganCount: eventPlan.guestGroup.veganCount,
      omnivoreCount: eventPlan.guestGroup.omnivoreCount,
    },
    includedRecipes: eventPlan.includedRecipes.map((item) => ({
      recipeId: item.scaledRecipe.sourceRecipeId,
      recipeName: item.scaledRecipe.sourceRecipeName,
      eligibleServings: item.eligibleServings,
      scaledIngredients: item.scaledRecipe.ingredients.map((ing) => ({
        ingredientId: ing.ingredientId,
        displayName: ing.displayName,
        quantity: ing.quantity.toJSON(),
      })),
    })),
    excludedRecipes: eventPlan.excludedRecipes.map((item) => ({
      recipeId: item.recipe.id,
      recipeName: item.recipe.name,
      reason: item.reason,
    })),
    shoppingList: shoppingList.map((item) => ({
      ingredientId: item.ingredientId,
      displayName: item.displayName,
      quantity: item.quantity.toJSON(),
      sourceRecipeIds: item.sourceRecipeIds,
      category: resolveCategory(item.ingredientId, item.category, categoryOverrides),
    })),
  };
}
