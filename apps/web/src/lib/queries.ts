import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { getUnitDefinition } from '@cookout-ai/domain';
import {
  api,
  type RecipeDto,
  type CreateRecipeInput,
  type IngredientInput,
  type ShoppingListRequestItem,
  type ShoppingListResponseDto,
  type PlanEventInput,
  type EventPlanResponseDto,
  type CreateEventInput,
  type EventSummaryDto,
  type EventDetailDto,
  type CreateShoppingListInput,
  type ShoppingListDto,
  type ImportRecipeTextResponseDto,
} from './api';

/**
 * Open Questions / Scope Notes:
 * - Query stale time / cache invalidation strategy is using TanStack Query defaults —
 *   no custom staleTime or gcTime tuning has been performed yet (future tuning opportunity).
 */

export const RECIPES_QUERY_KEY = ['recipes'] as const;

/** Prefix marking a cache entry as an in-flight optimistic create, not yet assigned a real server id. */
export const OPTIMISTIC_ID_PREFIX = 'optimistic-';

let optimisticIdCounter = 0;
/** Doesn't rely on crypto.randomUUID(), which throws outside secure contexts (e.g. plain-HTTP LAN dev). */
function createOptimisticId(): string {
  optimisticIdCounter += 1;
  return `${OPTIMISTIC_ID_PREFIX}${Date.now()}-${optimisticIdCounter}`;
}

/** Derives each ingredient's UnitCategory client-side so optimistic cache entries render correctly. */
function enrichIngredientsWithCategory(ingredients: IngredientInput[]): RecipeDto['ingredients'] {
  return ingredients.map((ing) => {
    let category = '';
    try {
      category = getUnitDefinition(ing.unit).category;
    } catch {
      // Invalid unit — the mutation will be rejected server-side and rolled back; leave category blank.
    }
    return { ...ing, category };
  });
}

function cancelRecipesQueries(queryClient: QueryClient) {
  return queryClient.cancelQueries({ queryKey: RECIPES_QUERY_KEY });
}

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
 * Optimistically appends a draft entry to the ['recipes'] cache, rolling back on error;
 * reconciles with the server response via invalidation once the request settles.
 */
export function useCreateRecipe() {
  const queryClient = useQueryClient();

  return useMutation<RecipeDto, Error, CreateRecipeInput, { optimisticId: string }>({
    mutationFn: (data: CreateRecipeInput) => api.createRecipe(data),
    onMutate: async (data) => {
      await cancelRecipesQueries(queryClient);
      const optimisticId = createOptimisticId();
      const optimisticRecipe: RecipeDto = {
        id: optimisticId,
        name: data.name,
        baseServings: data.baseServings,
        dietaryTags: data.dietaryTags ?? [],
        ingredients: enrichIngredientsWithCategory(data.ingredients),
        steps: data.steps ?? [],
      };
      queryClient.setQueryData<RecipeDto[]>(RECIPES_QUERY_KEY, (old = []) => [
        ...old,
        optimisticRecipe,
      ]);
      return { optimisticId };
    },
    onError: (_err, _data, context) => {
      if (!context) return;
      queryClient.setQueryData<RecipeDto[]>(RECIPES_QUERY_KEY, (old = []) =>
        old.filter((recipe) => recipe.id !== context.optimisticId)
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });
    },
  });
}

/**
 * Mutation hook for updating an existing recipe (PUT /api/recipes/:id).
 * Optimistically patches the matching entry in the ['recipes'] cache, rolling back on error;
 * reconciles with the server response via invalidation once the request settles.
 */
export function useUpdateRecipe() {
  const queryClient = useQueryClient();

  return useMutation<
    RecipeDto,
    Error,
    { id: string; data: CreateRecipeInput },
    { previousRecipe?: RecipeDto }
  >({
    mutationFn: ({ id, data }) => api.updateRecipe(id, data),
    onMutate: async ({ id, data }) => {
      await cancelRecipesQueries(queryClient);
      const previousRecipe = queryClient
        .getQueryData<RecipeDto[]>(RECIPES_QUERY_KEY)
        ?.find((recipe) => recipe.id === id);
      queryClient.setQueryData<RecipeDto[]>(RECIPES_QUERY_KEY, (old = []) =>
        old.map((recipe) =>
          recipe.id === id
            ? {
                ...recipe,
                name: data.name,
                baseServings: data.baseServings,
                dietaryTags: data.dietaryTags ?? [],
                ingredients: enrichIngredientsWithCategory(data.ingredients),
                steps: data.steps ?? [],
              }
            : recipe
        )
      );
      return { previousRecipe };
    },
    onError: (_err, { id }, context) => {
      if (!context?.previousRecipe) return;
      const restored = context.previousRecipe;
      queryClient.setQueryData<RecipeDto[]>(RECIPES_QUERY_KEY, (old = []) =>
        old.map((recipe) => (recipe.id === id ? restored : recipe))
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });
    },
  });
}

/**
 * Mutation hook for deleting a recipe (DELETE /api/recipes/:id).
 * Optimistically removes the entry from the ['recipes'] cache, rolling back on error;
 * reconciles with the server via invalidation once the request settles.
 */
export function useDeleteRecipe() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string, { previousRecipe?: RecipeDto }>({
    mutationFn: (id: string) => api.deleteRecipe(id),
    onMutate: async (id) => {
      await cancelRecipesQueries(queryClient);
      const previousRecipe = queryClient
        .getQueryData<RecipeDto[]>(RECIPES_QUERY_KEY)
        ?.find((recipe) => recipe.id === id);
      queryClient.setQueryData<RecipeDto[]>(RECIPES_QUERY_KEY, (old = []) =>
        old.filter((recipe) => recipe.id !== id)
      );
      return { previousRecipe };
    },
    onError: (_err, _id, context) => {
      const restored = context?.previousRecipe;
      if (!restored) return;
      queryClient.setQueryData<RecipeDto[]>(RECIPES_QUERY_KEY, (old = []) =>
        old.some((recipe) => recipe.id === restored.id) ? old : [...old, restored]
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });
    },
  });
}

export interface BulkDeleteResult {
  succeededIds: string[];
  failedErrors: string[];
}

/**
 * Mutation hook for deleting multiple recipes concurrently (DELETE /api/recipes/:id per id).
 * Resolves with a partial-failure result rather than throwing, so callers can report which
 * ids succeeded and which failed. Optimistically removes all targeted entries from the
 * ['recipes'] cache up front, then re-adds any that failed to delete once results are known.
 */
export function useBulkDeleteRecipes() {
  const queryClient = useQueryClient();

  return useMutation<BulkDeleteResult, Error, string[], { targetRecipes: RecipeDto[] }>({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map((id) => api.deleteRecipe(id)));

      const succeededIds: string[] = [];
      const failedErrors: string[] = [];

      results.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
          succeededIds.push(ids[idx]);
        } else {
          failedErrors.push(res.reason instanceof Error ? res.reason.message : 'Unknown error');
        }
      });

      return { succeededIds, failedErrors };
    },
    onMutate: async (ids) => {
      await cancelRecipesQueries(queryClient);
      const current = queryClient.getQueryData<RecipeDto[]>(RECIPES_QUERY_KEY) ?? [];
      const targetRecipes = current.filter((recipe) => ids.includes(recipe.id));
      queryClient.setQueryData<RecipeDto[]>(RECIPES_QUERY_KEY, (old = []) =>
        old.filter((recipe) => !ids.includes(recipe.id))
      );
      return { targetRecipes };
    },
    onSuccess: ({ succeededIds }, _ids, context) => {
      const recipesToRestore = context.targetRecipes.filter((r) => !succeededIds.includes(r.id));
      if (recipesToRestore.length > 0) {
        queryClient.setQueryData<RecipeDto[]>(RECIPES_QUERY_KEY, (old = []) => [
          ...old,
          ...recipesToRestore,
        ]);
      }
    },
    onError: (_err, _ids, context) => {
      if (!context || context.targetRecipes.length === 0) return;
      queryClient.setQueryData<RecipeDto[]>(RECIPES_QUERY_KEY, (old = []) => {
        const missing = context.targetRecipes.filter(
          (recipe) => !old.some((o) => o.id === recipe.id)
        );
        return missing.length > 0 ? [...old, ...missing] : old;
      });
    },
    onSettled: () => {
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

export const EVENTS_QUERY_KEY = ['events'] as const;

/**
 * Query hook for fetching all saved events (GET /api/events), summary shape only.
 */
export function useEvents() {
  return useQuery<EventSummaryDto[]>({
    queryKey: EVENTS_QUERY_KEY,
    queryFn: () => api.getEvents(),
  });
}

/**
 * Query hook for fetching a single saved event (GET /api/events/:id).
 * The response is recomputed live server-side on every call — "recompute live" means this
 * hook is never patched optimistically by other mutations, only invalidated to refetch.
 */
export function useEvent(id: string | null) {
  return useQuery<EventDetailDto>({
    queryKey: [...EVENTS_QUERY_KEY, id],
    queryFn: () => api.getEventById(id as string),
    enabled: id != null,
  });
}

/**
 * Mutation hook for saving a new event (POST /api/events).
 * Non-optimistic: the response carries a server-recomputed plan the client can't cheaply
 * predict, and this is a low-frequency "save" action where correctness beats snappiness.
 */
export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation<EventDetailDto, Error, CreateEventInput>({
    mutationFn: (data: CreateEventInput) => api.createEvent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
    },
  });
}

/**
 * Mutation hook for updating a saved event's name/guestGroup/recipeIds (PUT /api/events/:id).
 * Non-optimistic, same rationale as useCreateEvent.
 */
export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation<EventDetailDto, Error, { id: string; data: CreateEventInput }>({
    mutationFn: ({ id, data }) => api.updateEvent(id, data),
    onSuccess: (_updated, { id }) => {
      queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: [...EVENTS_QUERY_KEY, id] });
    },
  });
}

/**
 * Mutation hook for deleting a saved event (DELETE /api/events/:id).
 * Optimistically removes the entry from the ['events'] list cache, rolling back on error —
 * mirrors useDeleteRecipe exactly, since a deletion's outcome is trivial to predict correctly.
 */
export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string, { previousEvent?: EventSummaryDto }>({
    mutationFn: (id: string) => api.deleteEvent(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: EVENTS_QUERY_KEY });
      const previousEvent = queryClient
        .getQueryData<EventSummaryDto[]>(EVENTS_QUERY_KEY)
        ?.find((event) => event.id === id);
      queryClient.setQueryData<EventSummaryDto[]>(EVENTS_QUERY_KEY, (old = []) =>
        old.filter((event) => event.id !== id)
      );
      return { previousEvent };
    },
    onError: (_err, _id, context) => {
      const restored = context?.previousEvent;
      if (!restored) return;
      queryClient.setQueryData<EventSummaryDto[]>(EVENTS_QUERY_KEY, (old = []) =>
        old.some((event) => event.id === restored.id) ? old : [...old, restored]
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
    },
  });
}

export const SHOPPING_LISTS_QUERY_KEY = ['shoppingLists'] as const;

/**
 * Query hook for fetching all saved shopping lists (GET /api/shopping-lists), items included —
 * a plain DB read, unlike events this has no recompute cost, so it's safe to be non-lean.
 */
export function useShoppingLists() {
  return useQuery<ShoppingListDto[]>({
    queryKey: SHOPPING_LISTS_QUERY_KEY,
    queryFn: () => api.getShoppingLists(),
  });
}

/**
 * Query hook for fetching a single saved shopping list (GET /api/shopping-lists/:id).
 */
export function useShoppingList(id: string | null) {
  return useQuery<ShoppingListDto>({
    queryKey: [...SHOPPING_LISTS_QUERY_KEY, id],
    queryFn: () => api.getShoppingListById(id as string),
    enabled: id != null,
  });
}

/**
 * Mutation hook for saving a new standalone shopping list (POST /api/shopping-lists).
 * Non-optimistic — the response carries server-recomputed quantities the client can't
 * cheaply predict, and this is a low-frequency "save" action.
 */
export function useCreateShoppingList() {
  const queryClient = useQueryClient();

  return useMutation<ShoppingListDto, Error, CreateShoppingListInput>({
    mutationFn: (data: CreateShoppingListInput) => api.createShoppingList(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHOPPING_LISTS_QUERY_KEY });
    },
  });
}

/**
 * Mutation hook for saving/regenerating an event's linked shopping list
 * (PUT /api/events/:eventId/shopping-list). Non-optimistic, same rationale as
 * useCreateShoppingList. Invalidates both the shopping-lists cache and the event's own
 * detail cache, since the event's shoppingListId changes on every regenerate.
 */
export function useSaveEventShoppingList() {
  const queryClient = useQueryClient();

  return useMutation<ShoppingListDto, Error, { eventId: string; name?: string }>({
    mutationFn: ({ eventId, name }) => api.saveEventShoppingList(eventId, name),
    onSuccess: (_list, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: SHOPPING_LISTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: [...EVENTS_QUERY_KEY, eventId] });
    },
  });
}

/**
 * Mutation hook for deleting a saved shopping list (DELETE /api/shopping-lists/:id).
 * Optimistically removes the entry from the list cache, rolling back on error — mirrors
 * useDeleteRecipe/useDeleteEvent exactly.
 */
export function useDeleteShoppingList() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string, { previousList?: ShoppingListDto }>({
    mutationFn: (id: string) => api.deleteShoppingList(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: SHOPPING_LISTS_QUERY_KEY });
      const previousList = queryClient
        .getQueryData<ShoppingListDto[]>(SHOPPING_LISTS_QUERY_KEY)
        ?.find((list) => list.id === id);
      queryClient.setQueryData<ShoppingListDto[]>(SHOPPING_LISTS_QUERY_KEY, (old = []) =>
        old.filter((list) => list.id !== id)
      );
      return { previousList };
    },
    onError: (_err, _id, context) => {
      const restored = context?.previousList;
      if (!restored) return;
      queryClient.setQueryData<ShoppingListDto[]>(SHOPPING_LISTS_QUERY_KEY, (old = []) =>
        old.some((list) => list.id === restored.id) ? old : [...old, restored]
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SHOPPING_LISTS_QUERY_KEY });
    },
  });
}

/**
 * Mutation hook for toggling a single shopping list item's checked state
 * (PATCH /api/shopping-lists/:listId/items/:itemId). Optimistic with a targeted single-item
 * patch inside ['shoppingLists', listId] — not a whole-array snapshot/restore (the earlier
 * recipe-CRUD optimistic-update bug fix established why that pattern causes cross-mutation
 * clobbering). This is the one interaction here where instant feedback genuinely matters —
 * checking items off while physically at the store.
 */
export function useToggleShoppingListItemChecked() {
  const queryClient = useQueryClient();

  return useMutation<
    { id: string; checked: boolean },
    Error,
    { listId: string; itemId: string; checked: boolean },
    { previousChecked?: boolean }
  >({
    mutationFn: ({ listId, itemId, checked }) =>
      api.toggleShoppingListItem(listId, itemId, checked),
    onMutate: async ({ listId, itemId, checked }) => {
      const queryKey = [...SHOPPING_LISTS_QUERY_KEY, listId];
      await queryClient.cancelQueries({ queryKey });
      const previousList = queryClient.getQueryData<ShoppingListDto>(queryKey);
      const previousChecked = previousList?.items.find((item) => item.id === itemId)?.checked;

      queryClient.setQueryData<ShoppingListDto>(queryKey, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((item) => (item.id === itemId ? { ...item, checked } : item)),
            }
          : old
      );

      return { previousChecked };
    },
    onError: (_err, { listId, itemId }, context) => {
      if (context?.previousChecked === undefined) return;
      const queryKey = [...SHOPPING_LISTS_QUERY_KEY, listId];
      const restoredChecked = context.previousChecked;
      queryClient.setQueryData<ShoppingListDto>(queryKey, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((item) =>
                item.id === itemId ? { ...item, checked: restoredChecked } : item
              ),
            }
          : old
      );
    },
    onSettled: (_data, _err, { listId }) => {
      queryClient.invalidateQueries({ queryKey: [...SHOPPING_LISTS_QUERY_KEY, listId] });
    },
  });
}

/**
 * Mutation hook for correcting an ingredient's grocery category
 * (PUT /api/ingredient-categories/:ingredientId). Global by ingredientId — corrects every
 * saved shopping list and event-embedded plan containing that ingredient, not just the one
 * row being edited, so it's non-optimistic (its effect isn't confined to one cache entry) and
 * invalidates both ['shoppingLists'] and ['events'] on success.
 */
export function useSetIngredientCategory() {
  const queryClient = useQueryClient();

  return useMutation<
    { ingredientId: string; category: string },
    Error,
    { ingredientId: string; category: string }
  >({
    mutationFn: ({ ingredientId, category }) => api.setIngredientCategory(ingredientId, category),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHOPPING_LISTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
    },
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

/**
 * Mutation hook for extracting and parsing recipe data from an image file using AI (POST /api/recipes/import-image).
 * Implemented as an on-demand mutation with no cache invalidation or automatic persistence.
 */
export function useImportRecipeImage() {
  return useMutation<ImportRecipeTextResponseDto, Error, File>({
    mutationFn: (file: File) => api.importRecipeImage(file),
  });
}
