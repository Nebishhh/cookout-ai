import { InvalidEventError } from '../errors.js';
import { COURSE_ORDER, isCourse, type Course } from './course.js';
import type { GuestGroup } from './guestGroup.js';
import { guestCohorts, isRecipeEligibleForCohort, type GuestCohort } from './guestCohorts.js';
import { normalizeServingsOverride } from './servingsOverride.js';
import type { CourseShortfall, CourseSummary, PlanDish } from './types.js';

export interface DishServings {
  /** This dish's share of its course before any override (0 when nobody can eat it). */
  readonly computedServings: number;
  /** What to cook: the override when there is one, otherwise computedServings. */
  readonly servings: number;
  readonly servingsWereOverridden: boolean;
}

export interface CourseSplit {
  /** One entry per input dish, in input order. */
  readonly dishes: readonly DishServings[];
  readonly shortfalls: readonly CourseShortfall[];
  readonly courseSummaries: readonly CourseSummary[];
}

export interface SplitCourseServingsInput {
  readonly dishes: readonly PlanDish[];
  readonly guestGroup: GuestGroup;
}

/**
 * Works out how many servings of each dish an event needs.
 *
 * - Across courses, servings add up: every guest gets one serving of each course.
 * - Within a course, each guest's one serving is split evenly across the dishes in that course
 *   they can eat. A vegan with one vegan main gets a whole serving of it; an omnivore who can eat
 *   both mains gets half of each.
 * - A cohort with no dish it can eat in a course becomes a shortfall ("1 vegan guest has no Side")
 *   rather than being skipped silently.
 * - A dish with no course is its own standalone course: every guest who can eat it gets a whole
 *   serving and no shortfall is raised, which is exactly how events were planned before courses
 *   existed. Saved events keep their quantities until someone assigns courses.
 * - A servings override replaces the computed number for that dish only; the other dishes in its
 *   course keep their shares, and the course summary shows the course going over or under.
 *
 * Generic over courses: nothing here knows what a Main or a Dessert is. Which guests can eat a
 * dish comes from guestCohorts.ts.
 *
 * Open Question / Scope Notes:
 * - Shares are exact and often fractional (9 omnivores over 2 mains = 4.5 each). Rounding to
 *   something buyable happens later, on the shopping list, not here.
 * - The split is even across a guest's options; it doesn't model preference ("most people pick
 *   the meat main"). An override is the escape hatch for that.
 */
export function splitCourseServings({ dishes, guestGroup }: SplitCourseServingsInput): CourseSplit {
  const overrides = dishes.map((dish) =>
    normalizeServingsOverride(dish.servingsOverride, `recipe "${dish.recipe.id}"`)
  );

  const courseMembers = new Map<Course, number[]>();
  const standalone: number[] = [];
  dishes.forEach((dish, index) => {
    const course = dish.course ?? null;
    if (course === null) {
      standalone.push(index);
      return;
    }
    if (!isCourse(course)) {
      throw new InvalidEventError(
        `Invalid course for recipe "${dish.recipe.id}": "${String(course)}". Must be one of ${COURSE_ORDER.join(', ')}, or null.`
      );
    }
    const members = courseMembers.get(course);
    if (members) members.push(index);
    else courseMembers.set(course, [index]);
  });

  const cohorts = guestCohorts(guestGroup);
  const computed = dishes.map(() => 0);

  /** Shares each cohort's servings across the dishes it can eat; returns cohorts left with none. */
  const shareOut = (members: readonly number[]): GuestCohort[] => {
    const unserved: GuestCohort[] = [];
    for (const cohort of cohorts) {
      const eligible = members.filter((i) =>
        isRecipeEligibleForCohort(dishes[i].recipe, cohort.kind)
      );
      if (eligible.length === 0) {
        unserved.push(cohort);
        continue;
      }
      const share = cohort.size / eligible.length;
      for (const i of eligible) computed[i] += share;
    }
    return unserved;
  };

  for (const index of standalone) shareOut([index]);

  const shortfalls: CourseShortfall[] = [];
  const unservedGuestsByCourse = new Map<Course, number>();
  for (const course of COURSE_ORDER) {
    const members = courseMembers.get(course);
    if (!members) continue;

    let unservedGuests = 0;
    for (const cohort of shareOut(members)) {
      unservedGuests += cohort.size;
      shortfalls.push(
        Object.freeze({
          course,
          cohort: cohort.kind,
          guestCount: cohort.size,
          message: shortfallMessage(cohort, course),
        })
      );
    }
    unservedGuestsByCourse.set(course, unservedGuests);
  }

  const dishServings = dishes.map((_, index): DishServings => {
    const override = overrides[index];
    return Object.freeze({
      computedServings: computed[index],
      servings: override ?? computed[index],
      servingsWereOverridden: override !== null,
    });
  });

  const courseSummaries: CourseSummary[] = [];
  for (const course of COURSE_ORDER) {
    const members = courseMembers.get(course);
    if (!members) continue;
    courseSummaries.push(
      Object.freeze({
        course,
        servings: members.reduce((sum, i) => sum + dishServings[i].servings, 0),
        guestCount: guestGroup.totalGuests,
        coveredGuestCount: guestGroup.totalGuests - (unservedGuestsByCourse.get(course) ?? 0),
      })
    );
  }

  return Object.freeze({
    dishes: Object.freeze(dishServings),
    shortfalls: Object.freeze(shortfalls),
    courseSummaries: Object.freeze(courseSummaries),
  });
}

function shortfallMessage(cohort: GuestCohort, course: Course): string {
  const one = cohort.size === 1;
  return `${cohort.size} ${cohort.label} ${one ? 'guest has' : 'guests have'} no ${course}`;
}
