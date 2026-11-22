import {
  Event,
  GuestGroup,
  InvalidEventError,
  InvalidGuestGroupError,
  MAX_RECIPES_PER_EVENT,
  isCourse,
  normalizeEventDishes,
  subtractPantryStock,
  applyPracticalRounding,
  computeCookSchedule,
} from '@cookout-ai/domain';
import type {
  CookSchedule,
  EventDish,
  EventPlan,
  GroceryCategory,
  PlanDish,
  Quantity,
  Recipe,
} from '@cookout-ai/domain';
import type { Event as PrismaEvent, EventDish as PrismaEventDish } from '@prisma/client';
import { resolveCategory } from './categoryOverrides.js';

export interface CreateGuestGroupInput {
  totalGuests: number;
  vegetarianCount?: number;
  veganCount?: number;
}

export interface CreateEventDishInput {
  recipeId: string;
  /** One of Main, Side, Dessert, Drink, Other; null or omitted for its own standalone course. */
  course?: string | null;
  /** Positive whole number replacing the computed servings; null or omitted for none. */
  servingsOverride?: number | null;
}

export interface CreateEventInput {
  name: string;
  guestGroup: CreateGuestGroupInput;
  /** Each dish with its course and servings override. Used whenever it is present. */
  dishes?: CreateEventDishInput[];
  /** The older shape: recipe ids only, each its own course. Used only when `dishes` is absent. */
  recipeIds?: string[];
  /** Wall-clock minutes from midnight (0..1439), or null/omitted for "no cook schedule". */
  serveTimeMinutes?: number | null;
}

/** An Event row with its dishes loaded, ready for toDomainEvent(). */
export type PrismaEventWithDishes = PrismaEvent & { dishes: PrismaEventDish[] };

/** The `include` every event read needs so toDomainEvent() gets its dishes in order. */
export const EVENT_DISHES_INCLUDE = { dishes: { orderBy: { position: 'asc' } } } as const;

/**
 * The dishes a request asks for: `dishes` when present, otherwise the older `recipeIds` shape as
 * dishes with no course or override, so clients written before courses keep working unchanged.
 *
 * @throws InvalidEventError for a malformed list or an invalid dish (unknown course, bad override).
 */
export function dishesFromRequest(input: { dishes?: unknown; recipeIds?: unknown }): EventDish[] {
  if (input.dishes !== undefined) {
    return normalizeEventDishes(input.dishes);
  }
  if (!Array.isArray(input.recipeIds)) {
    throw new InvalidEventError('recipeIds must be an array.');
  }
  return normalizeEventDishes(input.recipeIds.map((recipeId: unknown) => ({ recipeId })));
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

  const event = new Event({
    id: eventId,
    name: input.name,
    guestGroup,
    dishes: dishesFromRequest(input),
    serveTimeMinutes: input.serveTimeMinutes,
  });

  // Counted after Event has deduplicated the IDs, so repeats of one recipe don't count twice.
  if (event.recipeIds.length > MAX_RECIPES_PER_EVENT) {
    throw new InvalidEventError(
      `An event can include at most ${MAX_RECIPES_PER_EVENT} recipes (got ${event.recipeIds.length}).`
    );
  }

  return event;
}

/**
 * The same event keeping only the dishes whose recipe the caller owns, in the same order and with
 * their course and override intact. Any other id (another user's recipe, or one that doesn't
 * exist) is never stored; the routes report it in droppedRecipeIds instead.
 */
export function withOwnedDishesOnly(event: Event, ownedRecipeIds: readonly string[]): Event {
  const owned = new Set(ownedRecipeIds);
  return new Event({
    id: event.id,
    name: event.name,
    guestGroup: event.guestGroup,
    dishes: event.dishes.filter((dish) => owned.has(dish.recipeId)),
    serveTimeMinutes: event.serveTimeMinutes,
  });
}

/** An event's dishes as EventDish rows to create, numbered in order. */
export function toDishCreateRows(event: Event) {
  return event.dishes.map((dish, position) => ({
    recipeId: dish.recipeId,
    course: dish.course,
    servingsOverride: dish.servingsOverride,
    position,
  }));
}

/**
 * Reconstructs a domain Event object from a Prisma database record and its dishes.
 * Re-enforces domain invariants uniformly regardless of data source.
 *
 * Tolerant of bad stored values, like dietary tags in recipeMapper: a course the domain doesn't
 * know, or an override that isn't a positive whole number, reads as "none" rather than failing
 * the whole event. The API never writes either; this only guards against hand-edited rows.
 */
export function toDomainEvent(prismaEvent: PrismaEventWithDishes): Event {
  const guestGroup = new GuestGroup({
    totalGuests: prismaEvent.totalGuests,
    vegetarianCount: prismaEvent.vegetarianCount,
    veganCount: prismaEvent.veganCount,
  });

  const dishes = [...prismaEvent.dishes]
    .sort((a, b) => a.position - b.position)
    .map((row) => ({
      recipeId: row.recipeId,
      course: isCourse(row.course) ? row.course : null,
      servingsOverride:
        row.servingsOverride !== null &&
        Number.isInteger(row.servingsOverride) &&
        row.servingsOverride > 0
          ? row.servingsOverride
          : null,
    }));

  return new Event({
    id: prismaEvent.id,
    name: prismaEvent.name,
    guestGroup,
    dishes,
    serveTimeMinutes: prismaEvent.serveTimeMinutes,
  });
}

/**
 * An event's dishes as the planner takes them: each dish paired with its resolved Recipe, keeping
 * its course and override. A dish whose recipe didn't resolve (deleted, or not the caller's) is
 * left out here; the routes report it in droppedRecipeIds.
 */
export function toPlanDishes(dishes: readonly EventDish[], recipes: readonly Recipe[]): PlanDish[] {
  const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const planDishes: PlanDish[] = [];
  for (const dish of dishes) {
    const recipe = recipesById.get(dish.recipeId);
    if (recipe) {
      planDishes.push({ recipe, course: dish.course, servingsOverride: dish.servingsOverride });
    }
  }
  return planDishes;
}

/**
 * Formats a domain Event object for JSON API responses (summary shape — no recomputed plan).
 * shoppingListId defaults to null until persisted ShoppingList support links one.
 * `recipeIds` is kept alongside `dishes` (same order) for clients written before courses.
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
    dishes: domainEvent.dishes.map((dish) => ({
      recipeId: dish.recipeId,
      course: dish.course,
      servingsOverride: dish.servingsOverride,
    })),
    recipeIds: domainEvent.recipeIds,
    serveTimeMinutes: domainEvent.serveTimeMinutes,
    shoppingListId,
  };
}

/**
 * Builds the backward cook schedule for an event plan, or null when the event has no serve time.
 *
 * Scheduled against **only the included recipes** — an excluded dish (nobody eligible to eat it)
 * isn't being cooked, so giving it a start time would be noise. Takes the full domain Recipes
 * separately from the plan because EventPlan's includedRecipes are ScaledRecipes, which carry no
 * steps; the plan is used purely to decide *which* recipes are in scope.
 */
export function buildCookSchedule(
  eventPlan: EventPlan,
  recipes: readonly Recipe[],
  serveTimeMinutes: number | null | undefined
): CookSchedule | null {
  if (serveTimeMinutes == null) {
    return null;
  }
  const includedIds = new Set(eventPlan.includedRecipes.map((r) => r.scaledRecipe.sourceRecipeId));
  return computeCookSchedule({
    recipes: recipes.filter((recipe) => includedIds.has(recipe.id)),
    serveTimeMinutes,
  });
}

/**
 * Formats a computed EventPlan (from planEventShoppingList) for JSON API responses.
 * Shared by the ephemeral preview route (POST /api/events/plan) and every persisted
 * Event route that recomputes the plan live on read.
 * `categoryOverrides` (ingredientId -> manually-corrected GroceryCategory) is applied on top
 * of each shopping-list item's heuristic-derived category — see categoryOverrides.ts.
 * `pantryStock` (ingredientId -> on-hand Quantity) reduces/omits shopping-list items the same
 * way it does for every other shopping-list-producing route — see pantryStore.ts.
 * `applyPracticalRounding()` (see practicalRounding.ts in the domain package) then rounds any
 * fractional Count-category item (e.g. 2.25 eggs) up to a buyable whole amount, same as every
 * other shopping-list-producing route.
 *
 * `schedule` is passed in **already computed** rather than derived here, because this function
 * only receives an EventPlan — whose includedRecipes are ScaledRecipes, and ScaledRecipe drops
 * `steps` entirely. The full Recipe list (the only thing carrying step durations) exists up in
 * the route, so computing there and passing down avoids widening ScaledRecipe/EventPlan and
 * rippling through planEventShoppingList() and every one of its consumers. null means the
 * event has no serve time set, so no schedule was requested.
 */
export function serializeEventPlan(
  eventPlan: EventPlan,
  categoryOverrides: ReadonlyMap<string, GroceryCategory> = new Map(),
  pantryStock: ReadonlyMap<string, Quantity> = new Map(),
  schedule: CookSchedule | null = null
) {
  const afterPantry = subtractPantryStock(eventPlan.shoppingList, pantryStock);
  const shoppingList = applyPracticalRounding(afterPantry);

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
      servings: item.servings,
      course: item.course,
      servingsWereOverridden: item.servingsWereOverridden,
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
      categoryIsOverridden: categoryOverrides.has(item.ingredientId),
      mathematicalQuantity: item.mathematicalQuantity.toJSON(),
      wasRoundedForPurchase: item.wasRoundedForPurchase,
    })),
    warnings: eventPlan.warnings.map((warning) => ({
      course: warning.course,
      cohort: warning.cohort,
      guestCount: warning.guestCount,
      message: warning.message,
    })),
    courseSummaries: eventPlan.courseSummaries.map((summary) => ({
      course: summary.course,
      servings: summary.servings,
      guestCount: summary.guestCount,
      coveredGuestCount: summary.coveredGuestCount,
    })),
    schedule: schedule
      ? {
          serveTimeMinutes: schedule.serveTimeMinutes,
          earliestStartMinutes: schedule.earliestStartMinutes,
          recipes: schedule.recipes.map((r) => ({
            recipeId: r.recipeId,
            recipeName: r.recipeName,
            totalMinutes: r.totalMinutes,
            startTimeMinutes: r.startTimeMinutes,
            hasUnstatedDurations: r.hasUnstatedDurations,
            steps: r.steps.map((s) => ({
              stepIndex: s.stepIndex,
              instruction: s.instruction,
              durationMinutes: s.durationMinutes,
              startTimeMinutes: s.startTimeMinutes,
            })),
          })),
        }
      : null,
  };
}
