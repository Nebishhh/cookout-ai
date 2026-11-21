/**
 * Open Question / Scope Notes:
 * - A course is a pure grouping of an event's dishes. Nothing here knows what food is: which
 *   guests can eat which dish is decided by guestCohorts.ts, and how a course's servings are
 *   shared out is decided by splitCourseServings.ts. Courses only say which dishes are
 *   alternatives to each other ("two mains") and which add up ("a main and a dessert").
 * - A course belongs to a dish's place in an event, not to the recipe: the same recipe can be a
 *   Side at one event and a Main at another. A per-recipe default is a possible later addition.
 * - A dish with no course is valid and means "its own standalone course" — that is how events
 *   saved before courses existed keep their exact quantities.
 */
export enum Course {
  Main = 'Main',
  Side = 'Side',
  Dessert = 'Dessert',
  Drink = 'Drink',
  Other = 'Other',
}

/** Display/serving order. Also the order shortfall warnings and course summaries come back in. */
export const COURSE_ORDER: readonly Course[] = Object.freeze([
  Course.Main,
  Course.Side,
  Course.Dessert,
  Course.Drink,
  Course.Other,
]);

const COURSE_VALUES: ReadonlySet<string> = new Set(COURSE_ORDER);

/** True for exactly the five Course values; used to validate untrusted input at the boundary. */
export function isCourse(value: unknown): value is Course {
  return typeof value === 'string' && COURSE_VALUES.has(value);
}
