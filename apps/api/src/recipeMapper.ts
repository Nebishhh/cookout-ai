import {
  DietaryTag,
  IngredientLine,
  InvalidRecipeError,
  Quantity,
  Recipe,
} from '@cookout-ai/domain';
import type {
  Recipe as PrismaRecipe,
  IngredientLine as PrismaIngredientLine,
} from '@prisma/client';

export type PrismaRecipeWithIngredients = PrismaRecipe & {
  ingredients: PrismaIngredientLine[];
};

export interface CreateIngredientInput {
  ingredientId: string;
  displayName: string;
  amount: number;
  unit: string;
}

export interface CreateRecipeInput {
  name: string;
  baseServings: number;
  dietaryTags?: string[];
  ingredients: CreateIngredientInput[];
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

  return new Recipe(recipeId, input.name, input.baseServings, domainIngredients, tags);
}

/**
 * Reconstructs a domain Recipe object from Prisma database records.
 * Re-enforces domain invariants uniformly regardless of data source.
 */
export function toDomainRecipe(prismaRecipe: PrismaRecipeWithIngredients): Recipe {
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

  return new Recipe(
    prismaRecipe.id,
    prismaRecipe.name,
    prismaRecipe.baseServings,
    domainIngredients,
    tags
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
  };
}
