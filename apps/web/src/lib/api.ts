/// <reference types="vite/client" />

/**
 * Shared API Client Module
 *
 * Base URL Configuration Note:
 * In development, Vite's dev server proxy (configured in `vite.config.ts`) automatically forwards
 * requests starting with `/api` to `http://localhost:3001/api`.
 * In production or custom environments, `VITE_API_BASE_URL` can override the default base URL.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export interface IngredientInput {
  ingredientId: string;
  displayName: string;
  amount: number;
  unit: string;
}

export interface CreateRecipeInput {
  name: string;
  baseServings: number;
  dietaryTags?: string[];
  ingredients: IngredientInput[];
}

export interface RecipeDto {
  id: string;
  name: string;
  baseServings: number;
  dietaryTags: string[];
  ingredients: Array<{
    ingredientId: string;
    displayName: string;
    amount: number;
    unit: string;
    category: string;
  }>;
}

export interface ShoppingListRequestItem {
  recipeId: string;
  targetServings: number;
}

export interface ShoppingListItemDto {
  ingredientId: string;
  displayName: string;
  quantity: {
    amount: number;
    unit: string;
    category: string;
  };
  sourceRecipeIds: string[];
}

export interface ScaledRecipeDto {
  sourceRecipeId: string;
  sourceRecipeName: string;
  targetServings: number;
  scaleFactor: number;
  ingredients: Array<{
    ingredientId: string;
    displayName: string;
    quantity: {
      amount: number;
      unit: string;
      category: string;
    };
  }>;
  dietaryTags: string[];
}

export interface ShoppingListResponseDto {
  shoppingList: ShoppingListItemDto[];
  scaledRecipes: ScaledRecipeDto[];
}

export interface GuestGroupDto {
  totalGuests: number;
  vegetarianCount: number;
  veganCount: number;
  omnivoreCount: number;
}

export interface IncludedRecipePlanDto {
  recipeId: string;
  recipeName: string;
  eligibleServings: number;
  scaledIngredients: Array<{
    ingredientId: string;
    displayName: string;
    quantity: {
      amount: number;
      unit: string;
      category: string;
    };
  }>;
}

export interface ExcludedRecipePlanDto {
  recipeId: string;
  recipeName: string;
  reason: string;
}

export interface EventPlanResponseDto {
  guestGroup: GuestGroupDto;
  includedRecipes: IncludedRecipePlanDto[];
  excludedRecipes: ExcludedRecipePlanDto[];
  shoppingList: ShoppingListItemDto[];
}

export interface PlanEventInput {
  recipeIds: string[];
  guestGroup: {
    totalGuests: number;
    vegetarianCount?: number;
    veganCount?: number;
  };
}

export class ApiError extends Error {
  status: number;
  errorName?: string;

  constructor(message: string, status: number, errorName?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorName = errorName;
  }
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const errorMessage =
      data?.message || data?.error || `HTTP ${response.status}: ${response.statusText}`;
    throw new ApiError(errorMessage, response.status, data?.error);
  }

  return data as T;
}

export interface ImportRecipeTextResponseDto {
  name: string;
  baseServings: number;
  dietaryTags: string[];
  ingredients: Array<{
    ingredientId: string;
    displayName: string;
    amount: number;
    unit: string;
  }>;
}

export const api = {
  getRecipes: () => request<RecipeDto[]>('/api/recipes'),
  getRecipeById: (id: string) => request<RecipeDto>(`/api/recipes/${id}`),
  createRecipe: (data: CreateRecipeInput) =>
    request<RecipeDto>('/api/recipes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateRecipe: (id: string, data: CreateRecipeInput) =>
    request<RecipeDto>(`/api/recipes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteRecipe: (id: string) =>
    request<void>(`/api/recipes/${id}`, {
      method: 'DELETE',
    }),
  buildShoppingList: (items: ShoppingListRequestItem[]) =>
    request<ShoppingListResponseDto>('/api/shopping-list', {
      method: 'POST',
      body: JSON.stringify(items),
    }),
  planEvent: (data: PlanEventInput) =>
    request<EventPlanResponseDto>('/api/events/plan', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  importRecipeText: (text: string) =>
    request<ImportRecipeTextResponseDto>('/api/recipes/import-text', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
};
