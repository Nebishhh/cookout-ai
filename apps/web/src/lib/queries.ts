import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  api,
  type RecipeDto,
  type CreateRecipeInput,
  type ShoppingListRequestItem,
  type ShoppingListResponseDto,
  type PlanEventInput,
  type EventPlanResponseDto,
  type ImportRecipeTextResponseDto,
} from './api';

/**
 * Open Questions / Scope Notes:
 * - Query stale time / cache invalidation strategy is using TanStack Query defaults —
 *   no custom staleTime or gcTime tuning has been performed yet (future tuning opportunity).
 * - No optimistic updates on mutations are implemented (out of scope for this milestone).
 */

export const RECIPES_QUERY_KEY = ['recipes'] as const;

/**
 * Shared query hook for fetching all recipes (GET /api/recipes).
 * Shared across RecipeList, ShoppingListBuilder, and EventPlanner so all components share a single cache entry.
 */
export function useRecipes() {
  return useQuery<RecipeDto[]>({
    queryKey: RECIPES_QUERY_KEY,
    queryFn: () => api.getRecipes(),
    staleTime: 1000 * 60 * 5, // 5 minutes staleTime so switching tabs reuses cached data
  });
}

/**
 * Mutation hook for creating a new recipe (POST /api/recipes).
 * Automatically invalidates the shared ['recipes'] query cache on success.
 */
export function useCreateRecipe() {
  const queryClient = useQueryClient();

  return useMutation<RecipeDto, Error, CreateRecipeInput>({
    mutationFn: (data: CreateRecipeInput) => api.createRecipe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });
    },
  });
}

/**
 * Mutation hook for updating an existing recipe (PUT /api/recipes/:id).
 * Automatically invalidates the shared ['recipes'] query cache on success.
 */
export function useUpdateRecipe() {
  const queryClient = useQueryClient();

  return useMutation<RecipeDto, Error, { id: string; data: CreateRecipeInput }>({
    mutationFn: ({ id, data }) => api.updateRecipe(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });
    },
  });
}

/**
 * Mutation hook for deleting a recipe (DELETE /api/recipes/:id).
 * Automatically invalidates the shared ['recipes'] query cache on success.
 */
export function useDeleteRecipe() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id: string) => api.deleteRecipe(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });
    },
  });
}

/**
 * Mutation hook for generating a consolidated shopping list (POST /api/shopping-list).
 */
export function useBuildShoppingList() {
  return useMutation<ShoppingListResponseDto, Error, ShoppingListRequestItem[]>({
    mutationFn: (items: ShoppingListRequestItem[]) => api.buildShoppingList(items),
  });
}

/**
 * Mutation hook for generating a diet-split event plan (POST /api/events/plan).
 * Implemented as a compute-on-demand mutation with no cache invalidation needed.
 */
export function usePlanEvent() {
  return useMutation<EventPlanResponseDto, Error, PlanEventInput>({
    mutationFn: (data: PlanEventInput) => api.planEvent(data),
  });
}

/**
 * Mutation hook for parsing raw recipe text into structured draft data using AI (POST /api/recipes/import-text).
 * Implemented as an on-demand mutation with no cache invalidation or automatic persistence.
 */
export function useImportRecipeText() {
  return useMutation<ImportRecipeTextResponseDto, Error, string>({
    mutationFn: (text: string) => api.importRecipeText(text),
  });
}

/**
 * Mutation hook for extracting and parsing recipe data from a URL using AI (POST /api/recipes/import-url).
 * Implemented as an on-demand mutation with no cache invalidation or automatic persistence.
 */
export function useImportRecipeUrl() {
  return useMutation<ImportRecipeTextResponseDto, Error, string>({
    mutationFn: (url: string) => api.importRecipeUrl(url),
  });
}
