import {
  DietaryTag,
  IngredientLine,
  InvalidRecipeError,
  Quantity,
  Recipe,
  RecipeStep,
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
}

export interface CreateRecipeInput {
  name: string;
  baseServings: number;
  dietaryTags?: string[];
  ingredients: CreateIngredientInput[];
  steps?: CreateStepInput[];
}

/**
 * Maps the AI-facing "instructions" field (an ordered array of plain strings, matching
 * both the Gemini extraction schema and the frontend's ImportRecipeTextResponseDto) onto
 * the "steps" shape validateAndCreateDomainRecipe expects (matching the real recipe-create
 * payload shape used by POST /api/recipes). Only the AI-import boundary needs this
 * translation — a real create/update request already sends "steps" directly.
 */
export function stepsFromInstructions(instructions: unknown): CreateStepInput[] {
  if (!Array.isArray(instructions)) {
    return [];
  }
  return instructions
    .filter((instruction): instruction is string => typeof instruction === 'string')
    .map((instruction) => ({ instruction }));
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
        return new RecipeStep(step.instruction);
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
  const domainSteps = sortedSteps.map((step) => new RecipeStep(step.instruction));

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
    })),
  };
}
