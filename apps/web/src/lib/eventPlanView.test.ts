import { describe, expect, it } from 'vitest';
import {
  courseBalance,
  courseTotalLine,
  formatServings,
  groupIncludedByCourse,
  parseServingsOverride,
} from './eventPlanView';
import type { Course } from '@cookout-ai/domain';
import type { CourseSummaryDto, IncludedRecipePlanDto } from './api';

// Course names as the server sends them over JSON (plain strings), cast once here.
type CourseName = `${Course}`;

const included = (
  recipeId: string,
  course: CourseName | null,
  servings: number
): IncludedRecipePlanDto => ({
  recipeId,
  recipeName: recipeId,
  eligibleServings: servings,
  servings,
  course: course as Course | null,
  servingsWereOverridden: false,
  scaledIngredients: [],
});

const summary = (
  course: CourseName,
  servings: number,
  coveredGuestCount = 12
): CourseSummaryDto => ({
  course: course as Course,
  servings,
  guestCount: 12,
  coveredGuestCount,
});

describe('formatServings()', () => {
  it('shows a split serving as a kitchen fraction', () => {
    expect(formatServings(4.5)).toBe('4 1/2');
    expect(formatServings(7.5)).toBe('7 1/2');
    expect(formatServings(10 / 3)).toBe('3 1/3');
    expect(formatServings(0.5)).toBe('1/2');
  });

  it('shows a whole number plainly', () => {
    expect(formatServings(12)).toBe('12');
  });
});

describe('courseTotalLine()', () => {
  it('states the course total against the party', () => {
    expect(courseTotalLine(summary('Main', 12))).toBe('Main: 12 servings for 12 guests');
    expect(courseTotalLine(summary('Side', 11, 11))).toBe('Side: 11 servings for 12 guests');
    expect(courseTotalLine(summary('Main', 13.5))).toBe('Main: 13 1/2 servings for 12 guests');
  });

  it('uses the singular for one serving and one guest', () => {
    expect(courseTotalLine({ ...summary('Drink', 1, 1), guestCount: 1 })).toBe(
      'Drink: 1 serving for 1 guest'
    );
  });
});

describe('courseBalance()', () => {
  it('says how far an override pushed a course over', () => {
    expect(courseBalance(summary('Main', 13.5))).toEqual({
      direction: 'over',
      label: 'over by 1 1/2',
    });
  });

  it('says how far an override pulled a course under', () => {
    expect(courseBalance(summary('Main', 9.5))).toEqual({
      direction: 'under',
      label: 'under by 2 1/2',
    });
  });

  it('says nothing when the course serves exactly the guests who can eat from it', () => {
    expect(courseBalance(summary('Main', 12))).toBeNull();
    // A shortfall is not an imbalance: the warning already explains the missing guest.
    expect(courseBalance(summary('Side', 11, 11))).toBeNull();
    // A floating-point crumb from adding up fractional shares is not "over".
    expect(courseBalance(summary('Main', 12.000000000000002))).toBeNull();
  });
});

describe('groupIncludedByCourse()', () => {
  it('groups dishes by course in serving order, each with its total, uncoursed last', () => {
    const groups = groupIncludedByCourse(
      [
        included('sorbet', 'Dessert', 12),
        included('salad', null, 12),
        included('pork', 'Main', 4.5),
        included('potatoes', 'Side', 11),
        included('tagine', 'Main', 7.5),
      ],
      [summary('Main', 12), summary('Side', 11, 11), summary('Dessert', 12)]
    );

    expect(groups.map((g) => [g.course, g.dishes.map((d) => d.recipeId)])).toEqual([
      ['Main', ['pork', 'tagine']],
      ['Side', ['potatoes']],
      ['Dessert', ['sorbet']],
      [null, ['salad']],
    ]);
    expect(groups[0].summary).toEqual(summary('Main', 12));
    expect(groups[3].summary).toBeNull();
  });

  it('returns one group for a plan with no courses at all', () => {
    const groups = groupIncludedByCourse([included('a', null, 9), included('b', null, 12)], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].course).toBeNull();
  });

  it('treats a result from before courses existed (no course field) as uncoursed', () => {
    const old = { ...included('a', null, 9) } as Partial<IncludedRecipePlanDto>;
    delete old.course;
    const groups = groupIncludedByCourse([old as IncludedRecipePlanDto], undefined);
    expect(groups.map((g) => g.course)).toEqual([null]);
  });
});

describe('parseServingsOverride()', () => {
  it('reads an empty field as no override', () => {
    expect(parseServingsOverride('')).toEqual({ value: null, error: null });
    expect(parseServingsOverride('   ')).toEqual({ value: null, error: null });
  });

  it('reads a whole number of 1 or more', () => {
    expect(parseServingsOverride(' 6 ')).toEqual({ value: 6, error: null });
  });

  it.each(['0', '-1', '2.5', 'abc'])('rejects %s with a plain message', (text) => {
    expect(parseServingsOverride(text)).toEqual({
      value: null,
      error: 'Enter a whole number of servings, 1 or more.',
    });
  });
});
