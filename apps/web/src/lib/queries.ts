import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  api,
  type RecipeDto,
  type CreateRecipeInput,
  type ShoppingListRequestItem,
  type ShoppingListResponseDto,
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
 * Shared across RecipeList and ShoppingListBuilder so both components share a single cache entry.
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
 * Mutation hook for generating a consolidated shopping list (POST /api/shopping-list).
 */
export function useBuildShoppingList() {
  return useMutation<ShoppingListResponseDto, Error, ShoppingListRequestItem[]>({
    mutationFn: (items: ShoppingListRequestItem[]) => api.buildShoppingList(items),
  });
}
