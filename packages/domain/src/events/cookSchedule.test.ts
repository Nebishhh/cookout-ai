import { describe, expect, it } from 'vitest';
import {
  computeCookSchedule,
  IngredientLine,
  InvalidEventError,
  Quantity,
  Recipe,
  RecipeStep,
  StepDuration,
} from '../index.js';

const SIX_PM = 18 * 60; // 1080

function ingredient(): IngredientLine {
  return new IngredientLine('flour', 'Flour', new Quantity(1, 'cup'));
}

/** `durations` entries: [amount, unit] for a stated duration, or null for "not stated". */
function recipeWith(
  id: string,
  name: string,
  durations: ReadonlyArray<[number, 'minutes' | 'hours'] | null>
): Recipe {
  const steps = durations.map(
    (d, i) =>
      new RecipeStep(
        `Step ${i + 1} of ${name}`,
        d === null ? undefined : new StepDuration(d[0], d[1])
      )
  );
  return new Recipe(id, name, 4, [ingredient()], [], steps);
}

describe('computeCookSchedule', () => {
  it('works backwards from the serve time for a single dish', () => {
    const schedule = computeCookSchedule({
      recipes: [
        recipeWith('r1', 'Ribs', [
          [30, 'minutes'],
          [2, 'hours'],
        ]),
      ],
      serveTimeMinutes: SIX_PM,
    });

    expect(schedule.serveTimeMinutes).toBe(SIX_PM);
    expect(schedule.recipes).toHaveLength(1);

    const ribs = schedule.recipes[0];
    expect(ribs.totalMinutes).toBe(150); // 30min + 2h
    expect(ribs.startTimeMinutes).toBe(SIX_PM - 150); // 3:30pm
    expect(ribs.hasUnstatedDurations).toBe(false);
    expect(schedule.earliestStartMinutes).toBe(SIX_PM - 150);
  });

  it('gives each step an absolute start time, walking forward from the dish start', () => {
    const schedule = computeCookSchedule({
      recipes: [
        recipeWith('r1', 'Ribs', [
          [30, 'minutes'],
          [1, 'hours'],
        ]),
      ],
      serveTimeMinutes: SIX_PM,
    });

    const [first, second] = schedule.recipes[0].steps;
    expect(first.stepIndex).toBe(0);
    expect(first.durationMinutes).toBe(30);
    expect(first.startTimeMinutes).toBe(SIX_PM - 90); // 4:30pm
    expect(second.durationMinutes).toBe(60);
    expect(second.startTimeMinutes).toBe(SIX_PM - 60); // 5:00pm, right after the first ends
  });

  it('sorts dishes by start time ascending — the order the host actually does things', () => {
    const schedule = computeCookSchedule({
      recipes: [
        recipeWith('salad', 'Salad', [[20, 'minutes']]),
        recipeWith('ribs', 'Ribs', [[3, 'hours']]),
        recipeWith('cornbread', 'Cornbread', [[25, 'minutes']]),
      ],
      serveTimeMinutes: SIX_PM,
    });

    expect(schedule.recipes.map((r) => r.recipeName)).toEqual(['Ribs', 'Cornbread', 'Salad']);
    expect(schedule.earliestStartMinutes).toBe(SIX_PM - 180);
  });

  it('counts steps with no stated duration as zero and flags the dish as an estimate', () => {
    const schedule = computeCookSchedule({
      recipes: [recipeWith('r1', 'Vague Stew', [[10, 'minutes'], null, [5, 'minutes']])],
      serveTimeMinutes: SIX_PM,
    });

    const stew = schedule.recipes[0];
    expect(stew.totalMinutes).toBe(15); // the null contributes 0, not a guess
    expect(stew.hasUnstatedDurations).toBe(true);
    expect(stew.steps[1].durationMinutes).toBeNull();
    // The unstated step still gets a start time; it just doesn't advance the cursor.
    expect(stew.steps[1].startTimeMinutes).toBe(stew.steps[2].startTimeMinutes);
  });

  it('does not flag a dish whose every step states a duration', () => {
    const schedule = computeCookSchedule({
      recipes: [recipeWith('r1', 'Precise Pie', [[45, 'minutes']])],
      serveTimeMinutes: SIX_PM,
    });

    expect(schedule.recipes[0].hasUnstatedDurations).toBe(false);
  });

  it('treats a stepless recipe as zero-duration, starting at the serve time', () => {
    const schedule = computeCookSchedule({
      recipes: [recipeWith('r1', 'No Steps Recorded', [])],
      serveTimeMinutes: SIX_PM,
    });

    expect(schedule.recipes[0].totalMinutes).toBe(0);
    expect(schedule.recipes[0].startTimeMinutes).toBe(SIX_PM);
    expect(schedule.recipes[0].hasUnstatedDurations).toBe(false);
  });

  it('returns a negative start time for a dish that must begin the previous day', () => {
    const schedule = computeCookSchedule({
      recipes: [recipeWith('brisket', 'Brisket', [[20, 'hours']])],
      serveTimeMinutes: SIX_PM,
    });

    // 20h before 6pm is 10pm the day before — negative rather than clamped, so the schedule
    // never silently claims an unmeetable start is fine.
    expect(schedule.recipes[0].startTimeMinutes).toBe(SIX_PM - 1200);
    expect(schedule.recipes[0].startTimeMinutes).toBeLessThan(0);
  });

  it('handles fractional hours', () => {
    const schedule = computeCookSchedule({
      recipes: [recipeWith('r1', 'Quick Bake', [[0.25, 'hours']])],
      serveTimeMinutes: SIX_PM,
    });

    expect(schedule.recipes[0].totalMinutes).toBe(15);
  });

  it('falls back to the serve time as earliestStart when there are no recipes', () => {
    const schedule = computeCookSchedule({ recipes: [], serveTimeMinutes: SIX_PM });

    expect(schedule.recipes).toEqual([]);
    expect(schedule.earliestStartMinutes).toBe(SIX_PM);
  });

  it('accepts the boundary serve times (midnight and 23:59)', () => {
    expect(computeCookSchedule({ recipes: [], serveTimeMinutes: 0 }).serveTimeMinutes).toBe(0);
    expect(computeCookSchedule({ recipes: [], serveTimeMinutes: 1439 }).serveTimeMinutes).toBe(
      1439
    );
  });

  it.each([-1, 1440, 5000, 12.5, NaN])('rejects an invalid serveTimeMinutes: %s', (bad) => {
    expect(() => computeCookSchedule({ recipes: [], serveTimeMinutes: bad })).toThrow(
      InvalidEventError
    );
  });

  it('freezes the schedule, its recipe entries, and its step entries', () => {
    const schedule = computeCookSchedule({
      recipes: [recipeWith('r1', 'Ribs', [[30, 'minutes']])],
      serveTimeMinutes: SIX_PM,
    });

    expect(Object.isFrozen(schedule)).toBe(true);
    expect(Object.isFrozen(schedule.recipes)).toBe(true);
    expect(Object.isFrozen(schedule.recipes[0])).toBe(true);
    expect(Object.isFrozen(schedule.recipes[0].steps)).toBe(true);
    expect(Object.isFrozen(schedule.recipes[0].steps[0])).toBe(true);
  });

  it("does not mutate or reorder the caller's recipes array", () => {
    const recipes = [
      recipeWith('salad', 'Salad', [[20, 'minutes']]),
      recipeWith('ribs', 'Ribs', [[3, 'hours']]),
    ];

    computeCookSchedule({ recipes, serveTimeMinutes: SIX_PM });

    expect(recipes.map((r) => r.name)).toEqual(['Salad', 'Ribs']);
  });
});
