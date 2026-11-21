import type { Recipe } from '../recipes/recipe.js';
import { DietaryTag } from '../recipes/types.js';
import type { GuestGroup } from './guestGroup.js';

/**
 * The three kinds of guest the GuestGroup subset model describes, as disjoint groups:
 * - `omnivore`: no restriction (totalGuests - vegetarianCount)
 * - `vegetarian`: vegetarian but not vegan (vegetarianCount - veganCount)
 * - `vegan`: vegan (veganCount)
 */
export type GuestCohortKind = 'omnivore' | 'vegetarian' | 'vegan';

export interface GuestCohort {
  readonly kind: GuestCohortKind;
  readonly size: number;
  /** Plain-language word for messages, e.g. "1 vegan guest has no Side". */
  readonly label: string;
}

/**
 * Splits a GuestGroup's overlapping counts into disjoint cohorts, in a fixed order (omnivore,
 * vegetarian, vegan), omitting any cohort with no guests.
 *
 * This and isRecipeEligibleForCohort() are the single home of dietary eligibility: every other
 * piece of event math (computeEligibleServings, splitCourseServings) is expressed in terms of
 * them, so the rules can't drift apart between "who could eat this" and "who gets a share".
 */
export function guestCohorts(guestGroup: GuestGroup): readonly GuestCohort[] {
  const all: GuestCohort[] = [
    { kind: 'omnivore', size: guestGroup.omnivoreCount, label: 'omnivore' },
    {
      kind: 'vegetarian',
      size: guestGroup.vegetarianCount - guestGroup.veganCount,
      label: 'vegetarian',
    },
    { kind: 'vegan', size: guestGroup.veganCount, label: 'vegan' },
  ];

  return Object.freeze(all.filter((cohort) => cohort.size > 0).map((c) => Object.freeze(c)));
}

/**
 * Whether guests of one cohort can eat a recipe:
 * - tagged Vegan (alone or alongside Vegetarian): everyone can;
 * - tagged Vegetarian but not Vegan: everyone except vegans;
 * - untagged (assumed to contain meat): omnivores only.
 */
export function isRecipeEligibleForCohort(recipe: Recipe, kind: GuestCohortKind): boolean {
  const tags = recipe.dietaryTags || [];
  if (tags.includes(DietaryTag.Vegan)) return true;
  if (tags.includes(DietaryTag.Vegetarian)) return kind !== 'vegan';
  return kind === 'omnivore';
}
