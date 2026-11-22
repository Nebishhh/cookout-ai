import { InvalidEventError } from '../errors.js';
import { GuestGroup } from './guestGroup.js';
import { MINUTES_PER_DAY } from './cookSchedule.js';
import { COURSE_ORDER, isCourse, type Course } from './course.js';
import { normalizeServingsOverride } from './servingsOverride.js';

/**
 * Most distinct recipes one event may reference. The planner picks recipes with one checkbox
 * per recipe the host owns, and real menus are well under this; the cap exists to bound the
 * work a single create/update request can ask for. Enforced where events are created or
 * updated, not in the Event constructor, so events stored before the cap still load.
 */
export const MAX_RECIPES_PER_EVENT = 50;

/** A dish as supplied to the Event constructor; course and override may be omitted. */
export interface EventDishInput {
  recipeId: string;
  course?: Course | null;
  servingsOverride?: number | null;
}

/**
 * A dish's place in an event: which recipe, which course (null = its own standalone course), and
 * an optional servings override. Stores references only — the Recipe itself is resolved at read
 * time, so an id that no longer resolves is tolerated rather than enforced here.
 */
export interface EventDish {
  readonly recipeId: string;
  readonly course: Course | null;
  readonly servingsOverride: number | null;
}

export interface EventInput {
  id: string;
  name: string;
  guestGroup: GuestGroup;
  dishes: EventDishInput[];
  serveTimeMinutes?: number | null;
}

/**
 * Validates and normalizes an event's dishes: every dish needs a non-empty recipeId, a course
 * from Course or null, and a servings override that is a positive whole number or null. An event
 * references each recipe at most once, so a repeated recipe collapses into its first occurrence,
 * keeping that one's course and override. Returns frozen dishes in first-seen order.
 *
 * Used by the Event constructor, and on its own wherever dishes arrive without a whole event
 * around them (a plan preview), so both reject exactly the same input.
 *
 * @throws InvalidEventError for a non-array or any invalid dish.
 */
export function normalizeEventDishes(input: unknown): EventDish[] {
  if (!Array.isArray(input)) {
    throw new InvalidEventError('dishes must be an array.');
  }

  const dishes: EventDish[] = [];
  const seen = new Set<string>();
  for (const dish of input as Array<Partial<EventDishInput> | null | undefined>) {
    const recipeId = dish && typeof dish === 'object' ? dish.recipeId : undefined;
    if (typeof recipeId !== 'string' || recipeId.trim().length === 0) {
      throw new InvalidEventError(
        `Invalid recipeId in dishes: "${String(recipeId)}". Every dish needs a non-empty recipeId.`
      );
    }

    const course = dish!.course ?? null;
    if (course !== null && !isCourse(course)) {
      throw new InvalidEventError(
        `Invalid course for recipe "${recipeId}": "${String(course)}". Must be one of ${COURSE_ORDER.join(', ')}, or null.`
      );
    }
    const servingsOverride = normalizeServingsOverride(
      dish!.servingsOverride,
      `recipe "${recipeId}"`
    );

    if (seen.has(recipeId)) continue;
    seen.add(recipeId);
    dishes.push(Object.freeze({ recipeId, course, servingsOverride }));
  }
  return dishes;
}

/**
 * Open Question / Scope Notes:
 * - "Recompute live": Event stores only its inputs (name, guestGroup, dishes,
 *   serveTimeMinutes). The plan (included/excluded recipes, servings, shopping list, cook
 *   schedule) is never stored here — it's recomputed fresh from current recipe data every
 *   time the event is read, via planEventShoppingList() and computeCookSchedule(). Editing a
 *   recipe later is reflected retroactively in every event that references it, and a recipeId
 *   that no longer resolves to a Recipe is tolerated (dropped at the persistence boundary, not
 *   a domain-layer concern).
 * - `recipeIds` is derived from `dishes` (same order) for callers that only need the references.
 * - `serveTimeMinutes` is **wall-clock minutes from midnight (0..1439), deliberately not a
 *   Date/DateTime**. "Serve at 6pm" is a wall-clock intent, not an instant on a timeline —
 *   storing an instant would drag timezone conversion into every read for no benefit, since
 *   all cook-schedule arithmetic is relative to the serve time anyway. null means the host
 *   hasn't asked for a schedule.
 * - No eventDate/notes field yet — the options-object constructor leaves room to add one
 *   later without a signature break, matching GuestGroup's precedent.
 */
export class Event {
  readonly id: string;
  readonly name: string;
  readonly guestGroup: GuestGroup;
  readonly dishes: readonly EventDish[];
  readonly recipeIds: readonly string[];
  readonly serveTimeMinutes: number | null;

  constructor(input: EventInput) {
    if (typeof input.id !== 'string' || input.id.trim().length === 0) {
      throw new InvalidEventError(
        `Invalid event id: "${input.id}". id must be a non-empty string.`
      );
    }

    if (typeof input.name !== 'string' || input.name.trim().length === 0) {
      throw new InvalidEventError(
        `Invalid event name: "${input.name}". name must be a non-empty string.`
      );
    }

    if (!(input.guestGroup instanceof GuestGroup)) {
      throw new InvalidEventError('Invalid guestGroup: Must be a valid GuestGroup instance.');
    }

    const dishes = normalizeEventDishes(input.dishes);

    const serveTimeMinutes = input.serveTimeMinutes ?? null;
    if (serveTimeMinutes !== null) {
      if (
        typeof serveTimeMinutes !== 'number' ||
        !Number.isInteger(serveTimeMinutes) ||
        serveTimeMinutes < 0 ||
        serveTimeMinutes >= MINUTES_PER_DAY
      ) {
        throw new InvalidEventError(
          `Invalid serveTimeMinutes: ${input.serveTimeMinutes}. Must be an integer from 0 to ${MINUTES_PER_DAY - 1} (wall-clock minutes from midnight), or null.`
        );
      }
    }

    this.id = input.id;
    this.name = input.name;
    this.guestGroup = input.guestGroup;
    this.dishes = Object.freeze(dishes);
    this.recipeIds = Object.freeze(dishes.map((dish) => dish.recipeId));
    this.serveTimeMinutes = serveTimeMinutes;

    Object.freeze(this);
  }
}
