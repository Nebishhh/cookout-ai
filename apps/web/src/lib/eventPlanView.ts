import { COURSE_ORDER, type Course } from '@cookout-ai/domain';
import type { CourseSummaryDto, IncludedRecipePlanDto } from './api';
import { formatQuantityAmount } from './formatQuantity';

/**
 * Presentation helpers for an event plan's course split. The numbers themselves (servings, course
 * totals, who is covered) all come from the domain via the API; these only decide how to show
 * them.
 */

/** Servings as a cook reads them: 4.5 -> "4 1/2", 10/3 -> "3 1/3", 12 -> "12". */
export function formatServings(servings: number): string {
  return formatQuantityAmount(servings, undefined, 'Count', 'display');
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "Main: 12 servings for 12 guests" */
export function courseTotalLine(summary: CourseSummaryDto): string {
  return (
    `${summary.course}: ${formatServings(summary.servings)} ` +
    `${plural(summary.servings, 'serving', 'servings')} for ` +
    `${summary.guestCount} ${plural(summary.guestCount, 'guest', 'guests')}`
  );
}

export interface CourseBalance {
  direction: 'over' | 'under';
  /** e.g. "over by 1 1/2" */
  label: string;
}

/**
 * How far a course's total is from one serving per guest who can eat from it, or null when it
 * matches. Only an override can move it: guests with nothing to eat in the course are already
 * left out of coveredGuestCount (the shortfall warning explains them), so a gap caused only by a
 * shortfall is not reported here.
 */
export function courseBalance(summary: CourseSummaryDto): CourseBalance | null {
  const difference = summary.servings - summary.coveredGuestCount;
  if (Math.abs(difference) < 1e-9 * Math.max(1, summary.coveredGuestCount)) return null;
  const direction = difference > 0 ? 'over' : 'under';
  return { direction, label: `${direction} by ${formatServings(Math.abs(difference))}` };
}

export interface CourseGroup {
  /** null for dishes with no course, each of which is its own course. */
  course: Course | null;
  summary: CourseSummaryDto | null;
  dishes: IncludedRecipePlanDto[];
}

/**
 * The plan's included dishes grouped by course in serving order (Main, Side, Dessert, Drink,
 * Other), each with its course total, then the dishes with no course last. A plan with no courses
 * at all comes back as the single uncoursed group.
 */
export function groupIncludedByCourse(
  included: readonly IncludedRecipePlanDto[],
  summaries: readonly CourseSummaryDto[] | undefined
): CourseGroup[] {
  const groups: CourseGroup[] = [];
  for (const course of COURSE_ORDER) {
    const dishes = included.filter((dish) => dish.course === course);
    if (dishes.length > 0) {
      groups.push({
        course,
        summary: summaries?.find((s) => s.course === course) ?? null,
        dishes,
      });
    }
  }
  const uncoursed = included.filter((dish) => !dish.course);
  if (uncoursed.length > 0) groups.push({ course: null, summary: null, dishes: uncoursed });
  return groups;
}

export interface ParsedServingsOverride {
  value: number | null;
  error: string | null;
}

/**
 * The servings-override field: blank means no override; otherwise a whole number of 1 or more,
 * matching what the domain accepts.
 */
export function parseServingsOverride(text: string): ParsedServingsOverride {
  const trimmed = text.trim();
  if (trimmed === '') return { value: null, error: null };
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 1) {
    return { value: null, error: 'Enter a whole number of servings, 1 or more.' };
  }
  return { value, error: null };
}
