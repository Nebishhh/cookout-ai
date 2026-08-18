import { InvalidEventError } from '../errors.js';
import type { Recipe } from '../recipes/recipe.js';
import type { RecipeStep } from '../recipes/recipeStep.js';

export const MINUTES_PER_DAY = 24 * 60;

export interface ScheduledStep {
  readonly stepIndex: number;
  readonly instruction: string;
  /** null means "not stated for this step" — deliberately NOT zero. See scope notes below. */
  readonly durationMinutes: number | null;
  readonly startTimeMinutes: number;
}

export interface ScheduledRecipe {
  readonly recipeId: string;
  readonly recipeName: string;
  readonly totalMinutes: number;
  readonly startTimeMinutes: number;
  /** True when any step lacks a stated duration, so the UI can mark this dish an estimate. */
  readonly hasUnstatedDurations: boolean;
  readonly steps: readonly ScheduledStep[];
}

export interface CookSchedule {
  readonly serveTimeMinutes: number;
  /** Sorted by startTimeMinutes ascending — this ordering IS the host's to-do list. */
  readonly recipes: readonly ScheduledRecipe[];
  readonly earliestStartMinutes: number;
}

export interface CookScheduleInput {
  readonly recipes: readonly Recipe[];
  /** Wall-clock minutes from midnight, 0..1439. */
  readonly serveTimeMinutes: number;
}

/**
 * Works backwards from a single serving time to tell a host when to START each dish — the
 * planning problem an event with several dishes converging on one deadline actually poses, and
 * the one thing this app is shaped for that a solo weekly meal planner isn't.
 *
 * Open Question / Scope Notes:
 * - **Steps with no stated duration contribute 0 minutes and set `hasUnstatedDurations`.**
 *   NULL duration means "not stated," not "instant" (see prisma/schema.prisma's RecipeStep
 *   note), so treating it as zero necessarily understates a dish's total. The flag exists so
 *   the presentation layer can render the dish as an estimate rather than as fact — a silently
 *   short schedule is the dangerous failure mode here, not a visibly incomplete one.
 * - **Durations are summed, never scaled.** Cooking twice as much food does not take twice as
 *   long, so scale factor / serving count deliberately plays no part in this computation. See
 *   StepDuration's own note on why no scale() exists.
 * - **`startTimeMinutes` may be negative**, meaning "the previous day" — a 20-hour brisket
 *   served at 6pm genuinely starts the day before. Clamping at zero would silently lie about
 *   an unmeetable schedule; the formatting layer is responsible for rendering it legibly.
 * - **Oven/resource conflict detection is deliberately NOT here.** Flagging "two dishes need
 *   the oven at 5:15pm at different temperatures" requires modeling the oven as a contended
 *   resource, which nothing in this codebase does. The only available proxy — "the step states
 *   a temperature" — false-positives on stovetop, candy, and meat-probe temperatures, so it
 *   would generate noise rather than warnings. Deferred until steps can say what equipment
 *   they need. See docs/ideas/cook-scheduling.md.
 * - Steps are scheduled strictly sequentially within a dish (step N+1 starts when step N ends);
 *   no attempt is made to model unattended time as parallelizable, since nothing in RecipeStep
 *   distinguishes "actively stirring" from "sitting in the oven."
 */
export function computeCookSchedule({
  recipes,
  serveTimeMinutes,
}: CookScheduleInput): CookSchedule {
  if (
    typeof serveTimeMinutes !== 'number' ||
    !Number.isInteger(serveTimeMinutes) ||
    serveTimeMinutes < 0 ||
    serveTimeMinutes >= MINUTES_PER_DAY
  ) {
    throw new InvalidEventError(
      `Invalid serveTimeMinutes: ${serveTimeMinutes}. Must be an integer from 0 to ${MINUTES_PER_DAY - 1} (wall-clock minutes from midnight).`
    );
  }

  if (!Array.isArray(recipes)) {
    throw new InvalidEventError('recipes must be an array.');
  }

  const scheduled: ScheduledRecipe[] = recipes.map((recipe) => {
    let totalMinutes = 0;
    let hasUnstatedDurations = false;

    for (const step of recipe.steps) {
      if (step.duration === null) {
        hasUnstatedDurations = true;
        continue;
      }
      totalMinutes += step.duration.toMinutes();
    }

    const startTimeMinutes = serveTimeMinutes - totalMinutes;

    // Second pass: walk forward from the dish's start so each step carries an absolute time.
    let cursor = startTimeMinutes;
    const steps: ScheduledStep[] = recipe.steps.map((step: RecipeStep, stepIndex: number) => {
      const durationMinutes = step.duration === null ? null : step.duration.toMinutes();
      const entry = Object.freeze({
        stepIndex,
        instruction: step.instruction,
        durationMinutes,
        startTimeMinutes: cursor,
      });
      cursor += durationMinutes ?? 0;
      return entry;
    });

    return Object.freeze({
      recipeId: recipe.id,
      recipeName: recipe.name,
      totalMinutes,
      startTimeMinutes,
      hasUnstatedDurations,
      steps: Object.freeze(steps),
    });
  });

  // Ascending start time = the order the host actually does things. Ties broken by name so the
  // output is deterministic rather than dependent on input array order.
  const ordered = [...scheduled].sort(
    (a, b) => a.startTimeMinutes - b.startTimeMinutes || a.recipeName.localeCompare(b.recipeName)
  );

  const earliestStartMinutes = ordered.length > 0 ? ordered[0].startTimeMinutes : serveTimeMinutes;

  return Object.freeze({
    serveTimeMinutes,
    recipes: Object.freeze(ordered),
    earliestStartMinutes,
  });
}
