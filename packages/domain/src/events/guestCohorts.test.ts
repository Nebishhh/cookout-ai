import { describe, expect, it } from 'vitest';
import { computeEligibleServings } from './computeEligibleServings.js';
import { GuestGroup } from './guestGroup.js';
import { guestCohorts, isRecipeEligibleForCohort } from './guestCohorts.js';
import { Recipe } from '../recipes/recipe.js';
import { IngredientLine } from '../recipes/ingredientLine.js';
import { DietaryTag } from '../recipes/types.js';
import { Quantity } from '../units/quantity.js';

const recipeTagged = (tags: DietaryTag[]) =>
  new Recipe('r', 'R', 4, [new IngredientLine('x', 'X', new Quantity(1, 'count'))], tags);

describe('guestCohorts()', () => {
  it('splits the subset model into omnivore, vegetarian-not-vegan and vegan cohorts', () => {
    const cohorts = guestCohorts(
      new GuestGroup({ totalGuests: 12, vegetarianCount: 3, veganCount: 1 })
    );
    expect(cohorts.map((c) => [c.kind, c.size])).toEqual([
      ['omnivore', 9],
      ['vegetarian', 2],
      ['vegan', 1],
    ]);
  });

  it('omits empty cohorts', () => {
    expect(guestCohorts(new GuestGroup({ totalGuests: 5 })).map((c) => c.kind)).toEqual([
      'omnivore',
    ]);
    expect(
      guestCohorts(new GuestGroup({ totalGuests: 4, vegetarianCount: 4, veganCount: 4 })).map(
        (c) => c.kind
      )
    ).toEqual(['vegan']);
  });

  it('returns a frozen list of frozen cohorts', () => {
    const cohorts = guestCohorts(new GuestGroup({ totalGuests: 3, vegetarianCount: 1 }));
    expect(Object.isFrozen(cohorts)).toBe(true);
    expect(cohorts.every((c) => Object.isFrozen(c))).toBe(true);
  });
});

describe('isRecipeEligibleForCohort()', () => {
  it('lets every cohort eat a vegan dish, including one also tagged vegetarian', () => {
    for (const tags of [[DietaryTag.Vegan], [DietaryTag.Vegetarian, DietaryTag.Vegan]]) {
      const recipe = recipeTagged(tags);
      expect(isRecipeEligibleForCohort(recipe, 'omnivore')).toBe(true);
      expect(isRecipeEligibleForCohort(recipe, 'vegetarian')).toBe(true);
      expect(isRecipeEligibleForCohort(recipe, 'vegan')).toBe(true);
    }
  });

  it('keeps vegans off a vegetarian (not vegan) dish', () => {
    const recipe = recipeTagged([DietaryTag.Vegetarian]);
    expect(isRecipeEligibleForCohort(recipe, 'omnivore')).toBe(true);
    expect(isRecipeEligibleForCohort(recipe, 'vegetarian')).toBe(true);
    expect(isRecipeEligibleForCohort(recipe, 'vegan')).toBe(false);
  });

  it('treats an untagged dish as omnivore-only', () => {
    const recipe = recipeTagged([]);
    expect(isRecipeEligibleForCohort(recipe, 'omnivore')).toBe(true);
    expect(isRecipeEligibleForCohort(recipe, 'vegetarian')).toBe(false);
    expect(isRecipeEligibleForCohort(recipe, 'vegan')).toBe(false);
  });
});

describe('computeEligibleServings() agrees with the cohort model', () => {
  // An independent statement of the documented eligibility rules, so this grid checks the cohort
  // implementation against the rules rather than against itself.
  function documentedEligibleGuests(tags: DietaryTag[], group: GuestGroup): number {
    if (tags.includes(DietaryTag.Vegan)) return group.totalGuests;
    if (tags.includes(DietaryTag.Vegetarian)) return group.totalGuests - group.veganCount;
    return group.totalGuests - group.vegetarianCount;
  }

  it('on every guest breakdown in a grid, for every tag combination', () => {
    const tagCombos: DietaryTag[][] = [
      [],
      [DietaryTag.Vegetarian],
      [DietaryTag.Vegan],
      [DietaryTag.Vegetarian, DietaryTag.Vegan],
    ];
    let checked = 0;
    for (let total = 1; total <= 8; total++) {
      for (let vegetarian = 0; vegetarian <= total; vegetarian++) {
        for (let vegan = 0; vegan <= vegetarian; vegan++) {
          const group = new GuestGroup({
            totalGuests: total,
            vegetarianCount: vegetarian,
            veganCount: vegan,
          });
          for (const tags of tagCombos) {
            const recipe = recipeTagged(tags);
            const viaCohorts = guestCohorts(group)
              .filter((c) => isRecipeEligibleForCohort(recipe, c.kind))
              .reduce((sum, c) => sum + c.size, 0);

            expect(viaCohorts).toBe(documentedEligibleGuests(tags, group));
            expect(computeEligibleServings(recipe, group)).toBe(viaCohorts);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(400);
  });
});
