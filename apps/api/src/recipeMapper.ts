import {
  DietaryTag,
  IngredientLine,
  InvalidRecipeError,
  Quantity,
  Recipe,
  RecipeStep,
  StepDuration,
  StepTemperature,
} from '@cookout-ai/domain';
import type {
  Recipe as PrismaRecipe,
  IngredientLine as PrismaIngredientLine,
  RecipeStep as PrismaRecipeStep,
} from '@prisma/client';

export type PrismaRecipeWithRelations = PrismaRecipe & {
  ingredients: PrismaIngredientLine[];
  steps: PrismaRecipeStep[];
};

export interface CreateIngredientInput {
  ingredientId: string;
  displayName: string;
  amount: number;
  unit: string;
}

export interface CreateStepInput {
  instruction: string;
  durationAmount?: number;
  durationUnit?: string;
  temperatureAmount?: number;
  temperatureUnit?: string;
  notes?: string;
}

export interface CreateRecipeInput {
  name: string;
  baseServings: number;
  dietaryTags?: string[];
  ingredients: CreateIngredientInput[];
  steps?: CreateStepInput[];
}

/**
 * Maps the AI-facing "instructions" field onto the "steps" shape validateAndCreateDomainRecipe
 * expects (matching the real recipe-create payload shape used by POST /api/recipes). Only the
 * AI-import boundary needs this translation — a real create/update request already sends
 * "steps" directly.
 *
 * Each entry is normally `{ instruction, duration?: {amount, unit}, temperature?: {amount,
 * unit}, notes?: string }` (see GEMINI_SYSTEM_PROMPT in geminiClient.ts) — duration/temperature/
 * notes are extracted only when explicitly stated in the source text. A bare string entry is
 * also accepted (no duration/temperature/notes) as a defensive fallback: geminiClient.ts's
 * structured-output config makes schema compliance reliable, not guaranteed, for a live
 * (non-fixture) response.
 */
export function stepsFromInstructions(instructions: unknown): CreateStepInput[] {
  if (!Array.isArray(instructions)) {
    return [];
  }

  const steps: CreateStepInput[] = [];

  for (const entry of instructions) {
    if (typeof entry === 'string') {
      steps.push({ instruction: entry });
      continue;
    }

    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const candidate = entry as {
      instruction?: unknown;
      duration?: { amount?: unknown; unit?: unknown };
      temperature?: { amount?: unknown; unit?: unknown };
      notes?: unknown;
    };

    if (typeof candidate.instruction !== 'string') {
      continue;
    }

    const step: CreateStepInput = { instruction: candidate.instruction };

    if (
      candidate.duration &&
      typeof candidate.duration.amount === 'number' &&
      typeof candidate.duration.unit === 'string'
    ) {
      step.durationAmount = candidate.duration.amount;
      step.durationUnit = candidate.duration.unit;
    }

    if (
      candidate.temperature &&
      typeof candidate.temperature.amount === 'number' &&
      typeof candidate.temperature.unit === 'string'
    ) {
      step.temperatureAmount = candidate.temperature.amount;
      step.temperatureUnit = candidate.temperature.unit;
    }

    if (typeof candidate.notes === 'string') {
      step.notes = candidate.notes;
    }

    steps.push(step);
  }

  return steps;
}

/**
 * Minimal structural check on a Gemini candidate that's already been confirmed not to be the
 * {error, message} "NoRecipeFound" shape: does it have enough of a recipe shape to be worth
 * attempting domain validation on, vs. being fundamentally unusable (e.g. ingredient/instruction
 * text crammed into "name" with no "ingredients" array at all — see issue #1)?
 *
 * Deliberately narrow: only checks "name" is a non-empty string and "ingredients" is a non-empty
 * array. Does NOT check baseServings, ingredient item shape, or instructions — those are
 * legitimate domain-validation failures (422 on a candidate whose overall shape is fine but a
 * specific value is wrong), not extraction failures, and must keep reaching
 * validateAndCreateDomainRecipe unchanged.
 */
export function hasMinimalRecipeShape(candidate: unknown): boolean {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }
  const c = candidate as Record<string, unknown>;
  return (
    typeof c.name === 'string' &&
    c.name.trim() !== '' &&
    Array.isArray(c.ingredients) &&
    c.ingredients.length > 0
  );
}

/**
 * Validates request body by constructing a domain Recipe object first.
 * Reuses domain validation from @cookout-ai/domain (Quantity, IngredientLine, Recipe).
 *
 * @throws DomainError (InvalidRecipeError, InvalidQuantityError, InvalidUnitError) if invalid.
 */
export function validateAndCreateDomainRecipe(
  input: CreateRecipeInput,
  overrideId?: string
): Recipe {
  if (!input || typeof input !== 'object') {
    throw new InvalidRecipeError('Invalid request body.');
  }

  const recipeId = overrideId || crypto.randomUUID();

  if (!Array.isArray(input.ingredients)) {
    throw new InvalidRecipeError('Recipe ingredients must be an array.');
  }

  const domainIngredients = input.ingredients.map((ing) => {
    if (!ing || typeof ing !== 'object') {
      throw new InvalidRecipeError('Invalid ingredient line entry.');
    }
    const quantity = new Quantity(ing.amount, ing.unit);
    return new IngredientLine(ing.ingredientId, ing.displayName, quantity);
  });

  const tags: DietaryTag[] = [];
  if (Array.isArray(input.dietaryTags)) {
    for (const tag of input.dietaryTags) {
      if (Object.values(DietaryTag).includes(tag as DietaryTag)) {
        tags.push(tag as DietaryTag);
      }
    }
  }

  const domainSteps = Array.isArray(input.steps)
    ? input.steps.map((step) => {
        if (!step || typeof step !== 'object') {
          throw new InvalidRecipeError('Invalid step entry.');
        }
        const duration =
          step.durationAmount !== undefined && step.durationUnit !== undefined
            ? new StepDuration(step.durationAmount, step.durationUnit)
            : undefined;
        const temperature =
          step.temperatureAmount !== undefined && step.temperatureUnit !== undefined
            ? new StepTemperature(step.temperatureAmount, step.temperatureUnit)
            : undefined;
        return new RecipeStep(step.instruction, duration, temperature, step.notes);
      })
    : [];

  return new Recipe(recipeId, input.name, input.baseServings, domainIngredients, tags, domainSteps);
}

/**
 * Reconstructs a domain Recipe object from Prisma database records.
 * Re-enforces domain invariants uniformly regardless of data source.
 */
export function toDomainRecipe(prismaRecipe: PrismaRecipeWithRelations): Recipe {
  let tags: DietaryTag[] = [];
  try {
    const parsed = JSON.parse(prismaRecipe.dietaryTagsJson);
    if (Array.isArray(parsed)) {
      tags = parsed.filter((t): t is DietaryTag =>
        Object.values(DietaryTag).includes(t as DietaryTag)
      );
    }
  } catch {
    tags = [];
  }

  const sortedIngredients = [...prismaRecipe.ingredients].sort((a, b) => a.position - b.position);

  const domainIngredients = sortedIngredients.map((ing) => {
    const quantity = new Quantity(ing.amount, ing.unit);
    return new IngredientLine(ing.ingredientId, ing.displayName, quantity);
  });

  const sortedSteps = [...prismaRecipe.steps].sort((a, b) => a.position - b.position);
  const domainSteps = sortedSteps.map((step) => {
    const duration =
      step.durationAmount !== null && step.durationUnit !== null
        ? new StepDuration(step.durationAmount, step.durationUnit)
        : undefined;
    const temperature =
      step.temperatureAmount !== null && step.temperatureUnit !== null
        ? new StepTemperature(step.temperatureAmount, step.temperatureUnit)
        : undefined;
    return new RecipeStep(step.instruction, duration, temperature, step.notes ?? undefined);
  });

  return new Recipe(
    prismaRecipe.id,
    prismaRecipe.name,
    prismaRecipe.baseServings,
    domainIngredients,
    tags,
    domainSteps
  );
}

/**
 * Formats a domain Recipe object for JSON API responses.
 */
export function toRecipeJSON(domainRecipe: Recipe) {
  return {
    id: domainRecipe.id,
    name: domainRecipe.name,
    baseServings: domainRecipe.baseServings,
    dietaryTags: domainRecipe.dietaryTags,
    ingredients: domainRecipe.ingredients.map((ing) => ({
      ingredientId: ing.ingredientId,
      displayName: ing.displayName,
      amount: ing.quantity.amount,
      unit: ing.quantity.unit,
      category: ing.quantity.category,
    })),
    steps: domainRecipe.steps.map((step) => ({
      instruction: step.instruction,
      duration: step.duration ? { amount: step.duration.amount, unit: step.duration.unit } : null,
      temperature: step.temperature
        ? { amount: step.temperature.amount, unit: step.temperature.unit }
        : null,
      notes: step.notes,
    })),
  };
}
