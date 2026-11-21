import { describe, expect, it } from 'vitest';
import { Course } from './course.js';
import { computeEligibleServings } from './computeEligibleServings.js';
import { GuestGroup } from './guestGroup.js';
import { splitCourseServings } from './splitCourseServings.js';
import type { PlanDish } from './types.js';
import { InvalidEventError } from '../errors.js';
import { Recipe } from '../recipes/recipe.js';
import { IngredientLine } from '../recipes/ingredientLine.js';
import { DietaryTag } from '../recipes/types.js';
import { Quantity } from '../units/quantity.js';

const dish = (id: string, tags: DietaryTag[] = []) =>
  new Recipe(id, id, 4, [new IngredientLine('x', 'X', new Quantity(1, 'count'))], tags);

const pork = dish('Pulled Pork');
const tagine = dish('Chickpea Tagine', [DietaryTag.Vegan]);
const potatoes = dish('Scalloped Potatoes', [DietaryTag.Vegetarian]);
const sorbet = dish('Coconut Sorbet', [DietaryTag.Vegan]);

/** 12 guests, 3 vegetarian of whom 1 is vegan: 9 omnivores, 2 vegetarians, 1 vegan. */
const twelve = () => new GuestGroup({ totalGuests: 12, vegetarianCount: 3, veganCount: 1 });

/** The 12-guest example from the plan: two mains, one side, one dessert. */
const twelveGuestMenu = (): PlanDish[] => [
  { recipe: pork, course: Course.Main },
  { recipe: tagine, course: Course.Main },
  { recipe: potatoes, course: Course.Side },
  { recipe: sorbet, course: Course.Dessert },
];

const servingsOf = (dishes: PlanDish[], guestGroup: GuestGroup) =>
  splitCourseServings({ dishes, guestGroup }).dishes.map((d) => d.servings);

describe('splitCourseServings()', () => {
  describe('splitting a course between its dishes', () => {
    it('works the 12-guest example: 4.5 / 7.5 / 11 / 12, 35 in all', () => {
      const servings = servingsOf(twelveGuestMenu(), twelve());

      expect(servings).toEqual([4.5, 7.5, 11, 12]);
      expect(servings.reduce((a, b) => a + b, 0)).toBe(35);
    });

    it('gives every eligible guest a whole serving when a course has one dish', () => {
      expect(servingsOf([{ recipe: potatoes, course: Course.Side }], twelve())).toEqual([11]);
    });

    it('gives a guest who can eat both mains half of each', () => {
      const fourOmnivores = new GuestGroup({ totalGuests: 4 });
      const servings = servingsOf(
        [
          { recipe: dish('Ribs'), course: Course.Main },
          { recipe: dish('Brisket'), course: Course.Main },
        ],
        fourOmnivores
      );
      expect(servings).toEqual([2, 2]);
    });

    it('gives a vegan guest with one vegan main a full serving of it', () => {
      const oneVegan = new GuestGroup({ totalGuests: 1, vegetarianCount: 1, veganCount: 1 });
      const servings = servingsOf(
        [
          { recipe: pork, course: Course.Main },
          { recipe: tagine, course: Course.Main },
        ],
        oneVegan
      );
      expect(servings).toEqual([0, 1]);
    });

    it('splits three dishes everyone can eat into equal thirds of the party', () => {
      const servings = servingsOf(
        [
          { recipe: dish('A', [DietaryTag.Vegan]), course: Course.Main },
          { recipe: dish('B', [DietaryTag.Vegan]), course: Course.Main },
          { recipe: dish('C', [DietaryTag.Vegan]), course: Course.Main },
        ],
        twelve()
      );
      expect(servings).toEqual([4, 4, 4]);
    });

    it('skips a dish nobody can eat, so its course splits across the rest only', () => {
      const allVegetarian = new GuestGroup({ totalGuests: 4, vegetarianCount: 4 });
      const servings = servingsOf(
        [
          { recipe: pork, course: Course.Main },
          { recipe: potatoes, course: Course.Main },
        ],
        allVegetarian
      );
      expect(servings).toEqual([0, 4]);
    });
  });

  describe('dishes with no course', () => {
    it('treats each uncoursed dish as its own course, matching computeEligibleServings', () => {
      const group = twelve();
      const recipes = [pork, tagine, potatoes, sorbet];
      const result = splitCourseServings({
        dishes: recipes.map((recipe) => ({ recipe })),
        guestGroup: group,
      });

      expect(result.dishes.map((d) => d.servings)).toEqual(
        recipes.map((r) => computeEligibleServings(r, group))
      );
      expect(result.dishes.map((d) => d.servings)).toEqual([9, 12, 11, 12]);
    });

    it('raises no shortfall for an uncoursed dish, even when some guests cannot eat it', () => {
      const result = splitCourseServings({ dishes: [{ recipe: pork }], guestGroup: twelve() });
      expect(result.shortfalls).toEqual([]);
    });

    it('treats an explicit null course the same as no course', () => {
      expect(servingsOf([{ recipe: pork, course: null }], twelve())).toEqual([9]);
    });

    it('splits only the coursed dishes in a mixed event', () => {
      const servings = servingsOf(
        [
          { recipe: pork, course: Course.Main },
          { recipe: tagine, course: Course.Main },
          { recipe: dish('Green Salad', [DietaryTag.Vegan]) },
        ],
        twelve()
      );
      // The salad is not pulled into Main: it stays a full serving for all 12.
      expect(servings).toEqual([4.5, 7.5, 12]);
    });
  });

  describe('shortfalls', () => {
    it('warns once when one cohort has nothing in a course', () => {
      const result = splitCourseServings({
        dishes: [{ recipe: potatoes, course: Course.Main }],
        guestGroup: twelve(),
      });

      expect(result.shortfalls).toEqual([
        {
          course: Course.Main,
          cohort: 'vegan',
          guestCount: 1,
          message: '1 vegan guest has no Main',
        },
      ]);
    });

    it('uses plural wording for more than one guest', () => {
      const twoVegetarians = new GuestGroup({ totalGuests: 12, vegetarianCount: 2 });
      const result = splitCourseServings({
        dishes: [{ recipe: pork, course: Course.Side }],
        guestGroup: twoVegetarians,
      });

      expect(result.shortfalls.map((s) => s.message)).toEqual(['2 vegetarian guests have no Side']);
    });

    it('raises the vegan-has-no-Side warning in the 12-guest example', () => {
      const result = splitCourseServings({ dishes: twelveGuestMenu(), guestGroup: twelve() });
      expect(result.shortfalls.map((s) => s.message)).toEqual(['1 vegan guest has no Side']);
    });

    it('lists shortfalls in course order, then cohort order, whatever order dishes arrive in', () => {
      const result = splitCourseServings({
        dishes: [
          { recipe: pork, course: Course.Dessert },
          { recipe: pork, course: Course.Main },
        ],
        guestGroup: twelve(),
      });

      expect(result.shortfalls.map((s) => s.message)).toEqual([
        '2 vegetarian guests have no Main',
        '1 vegan guest has no Main',
        '2 vegetarian guests have no Dessert',
        '1 vegan guest has no Dessert',
      ]);
    });

    it('raises none when every guest is an omnivore', () => {
      const result = splitCourseServings({
        dishes: [
          { recipe: pork, course: Course.Main },
          { recipe: dish('Lemonade'), course: Course.Drink },
        ],
        guestGroup: new GuestGroup({ totalGuests: 6, vegetarianCount: 0, veganCount: 0 }),
      });
      expect(result.shortfalls).toEqual([]);
    });
  });

  describe('servings override', () => {
    it('replaces the computed number without shifting the other dishes in the course', () => {
      const menu = twelveGuestMenu();
      menu[0] = { ...menu[0], servingsOverride: 6 };
      const result = splitCourseServings({ dishes: menu, guestGroup: twelve() });

      expect(result.dishes[0]).toEqual({
        computedServings: 4.5,
        servings: 6,
        servingsWereOverridden: true,
      });
      expect(result.dishes[1]).toEqual({
        computedServings: 7.5,
        servings: 7.5,
        servingsWereOverridden: false,
      });
    });

    it('applies to an uncoursed dish too', () => {
      const result = splitCourseServings({
        dishes: [{ recipe: pork, servingsOverride: 20 }],
        guestGroup: twelve(),
      });
      expect(result.dishes[0].servings).toBe(20);
    });

    it('lets the host cook a dish nobody is eligible for, if they ask for it', () => {
      const allVegetarian = new GuestGroup({ totalGuests: 4, vegetarianCount: 4 });
      const result = splitCourseServings({
        dishes: [{ recipe: pork, course: Course.Main, servingsOverride: 2 }],
        guestGroup: allVegetarian,
      });
      expect(result.dishes[0]).toEqual({
        computedServings: 0,
        servings: 2,
        servingsWereOverridden: true,
      });
    });

    it.each([0, -1, 2.5, NaN, Infinity])('rejects an override of %s', (bad) => {
      expect(() =>
        splitCourseServings({
          dishes: [{ recipe: pork, course: Course.Main, servingsOverride: bad }],
          guestGroup: twelve(),
        })
      ).toThrow(InvalidEventError);
    });
  });

  describe('course summaries', () => {
    it('totals each course against the party in the 12-guest example', () => {
      const result = splitCourseServings({ dishes: twelveGuestMenu(), guestGroup: twelve() });

      expect(result.courseSummaries).toEqual([
        { course: Course.Main, servings: 12, guestCount: 12, coveredGuestCount: 12 },
        { course: Course.Side, servings: 11, guestCount: 12, coveredGuestCount: 11 },
        { course: Course.Dessert, servings: 12, guestCount: 12, coveredGuestCount: 12 },
      ]);
    });

    it('shows a course going over when an override pushes it up', () => {
      const menu = twelveGuestMenu();
      menu[0] = { ...menu[0], servingsOverride: 6 };
      const main = splitCourseServings({ dishes: menu, guestGroup: twelve() }).courseSummaries[0];

      expect(main).toEqual({
        course: Course.Main,
        servings: 13.5,
        guestCount: 12,
        coveredGuestCount: 12,
      });
    });

    it('shows a course going under when an override pulls it down', () => {
      const menu = twelveGuestMenu();
      menu[1] = { ...menu[1], servingsOverride: 5 };
      const main = splitCourseServings({ dishes: menu, guestGroup: twelve() }).courseSummaries[0];

      expect(main.servings).toBe(9.5);
      expect(main.servings).toBeLessThan(main.coveredGuestCount);
    });

    it('produces no summary for uncoursed dishes', () => {
      const result = splitCourseServings({
        dishes: [{ recipe: pork }, { recipe: sorbet }],
        guestGroup: twelve(),
      });
      expect(result.courseSummaries).toEqual([]);
    });
  });

  it('serves every covered guest exactly one serving per course, across many parties', () => {
    const menus: PlanDish[][] = [
      twelveGuestMenu(),
      [
        { recipe: pork, course: Course.Main },
        { recipe: potatoes, course: Course.Main },
        { recipe: tagine, course: Course.Main },
      ],
      [
        { recipe: potatoes, course: Course.Side },
        { recipe: pork, course: Course.Side },
      ],
    ];
    let checked = 0;
    for (let total = 1; total <= 7; total++) {
      for (let vegetarian = 0; vegetarian <= total; vegetarian++) {
        for (let vegan = 0; vegan <= vegetarian; vegan++) {
          const guestGroup = new GuestGroup({
            totalGuests: total,
            vegetarianCount: vegetarian,
            veganCount: vegan,
          });
          for (const dishes of menus) {
            const { courseSummaries, shortfalls } = splitCourseServings({ dishes, guestGroup });
            for (const summary of courseSummaries) {
              const shortGuests = shortfalls
                .filter((s) => s.course === summary.course)
                .reduce((sum, s) => sum + s.guestCount, 0);
              expect(summary.coveredGuestCount).toBe(total - shortGuests);
              expect(summary.servings).toBeCloseTo(summary.coveredGuestCount, 9);
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('does not mutate its input and returns a frozen result', () => {
    const dishes = twelveGuestMenu();
    const snapshot = dishes.map((d) => ({ ...d }));
    const result = splitCourseServings({ dishes, guestGroup: twelve() });

    expect(dishes).toEqual(snapshot);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.dishes)).toBe(true);
    expect(Object.isFrozen(result.shortfalls)).toBe(true);
    expect(Object.isFrozen(result.courseSummaries)).toBe(true);
  });
});
