import type { Recipe } from '../recipes/recipe.js';
import type { ScaledRecipe } from '../recipes/types.js';
import type { ShoppingListItem } from '../shopping/types.js';
import type { Course } from './course.js';
import type { GuestCohortKind } from './guestCohorts.js';
import type { GuestGroup } from './guestGroup.js';

/**
 * One dish handed to the planner: the recipe, which course it belongs to at this event (null or
 * omitted = its own standalone course), and an optional host override of its servings.
 */
export interface PlanDish {
  readonly recipe: Recipe;
  readonly course?: Course | null;
  readonly servingsOverride?: number | null;
}

/**
 * Details of a recipe included in an event plan, along with its scaled serving count.
 */
export interface IncludedRecipePlan {
  readonly scaledRecipe: ScaledRecipe;
  /** How many guests could eat this dish at all, whatever else is on the menu. */
  readonly eligibleServings: number;
  /**
   * What to cook: this dish's share of its course (fractional when a course is split, e.g. 4.5),
   * or the host's override. Equals eligibleServings for a dish with no course and no override.
   */
  readonly servings: number;
  readonly course: Course | null;
  readonly servingsWereOverridden: boolean;
}

/**
 * Details of a recipe excluded from an event plan due to zero eligible guests,
 * along with the human-readable explanation for exclusion.
 */
export interface ExcludedRecipePlan {
  readonly recipe: Recipe;
  readonly reason: string;
}

/** A cohort of guests with nothing they can eat in one course, e.g. "1 vegan guest has no Side". */
export interface CourseShortfall {
  readonly course: Course;
  readonly cohort: GuestCohortKind;
  readonly guestCount: number;
  readonly message: string;
}

/**
 * One course's total against the party, e.g. Main: 12 servings for 12 guests.
 * - `guestCount` is the whole party.
 * - `coveredGuestCount` leaves out guests with a shortfall in this course, so a total that differs
 *   from it means an override moved the course over or under, not a gap already warned about.
 */
export interface CourseSummary {
  readonly course: Course;
  readonly servings: number;
  readonly guestCount: number;
  readonly coveredGuestCount: number;
}

/**
 * Output result of an event planning calculation (planEventShoppingList).
 */
export interface EventPlan {
  readonly guestGroup: GuestGroup;
  readonly includedRecipes: ReadonlyArray<IncludedRecipePlan>;
  readonly excludedRecipes: ReadonlyArray<ExcludedRecipePlan>;
  readonly shoppingList: ReadonlyArray<ShoppingListItem>;
  /** Shortfalls in course order, then cohort order. Never raised for dishes with no course. */
  readonly warnings: ReadonlyArray<CourseShortfall>;
  /** One per course that has at least one dish, in course order. None for uncoursed dishes. */
  readonly courseSummaries: ReadonlyArray<CourseSummary>;
}
