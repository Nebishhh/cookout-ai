import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  AlertCircle,
  RefreshCw,
  ChefHat,
  Pencil,
  Trash2,
  Search,
  X,
  ShoppingBag,
  CheckSquare,
  Square,
  Filter,
  Loader2,
  Clock,
  Thermometer,
} from 'lucide-react';
import type { RecipeDto } from '../lib/api';
import {
  useRecipesPage,
  useDeleteRecipe,
  useBulkDeleteRecipes,
  OPTIMISTIC_ID_PREFIX,
} from '../lib/queries';
import { formatQuantityAmount } from '../lib/formatQuantity';
import { formatDuration, formatTemperature } from '../lib/formatStepTiming';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';

export interface RecipeListProps {
  onEditRecipe?: (recipe: RecipeDto) => void;
  onSendToShoppingList?: (recipeIds: string[]) => void;
}

const RECIPES_PAGE_SIZE = 20;

export const RecipeList: React.FC<RecipeListProps> = ({ onEditRecipe, onSendToShoppingList }) => {
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Search moved server-side (see useRecipesPage) so it covers the whole catalog, not just
  // the loaded page — debounced so typing doesn't fire a request per keystroke. Dietary-tag
  // toggles are discrete clicks and fire immediately.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useRecipesPage({
    limit: RECIPES_PAGE_SIZE,
    search: debouncedSearchQuery,
    tags: selectedTags,
  });

  // Already filtered server-side and flattened across every page loaded so far.
  const recipes = data?.pages.flatMap((page) => page.items) ?? [];

  const deleteRecipeMutation = useDeleteRecipe();
  const bulkDeleteMutation = useBulkDeleteRecipes();

  // Bulk Selection State
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);
  const [bulkActionError, setBulkActionError] = useState<string | null>(null);

  // Available dietary tag options
  const AVAILABLE_TAGS = ['Vegetarian', 'Vegan'];

  // Recipes still awaiting server confirmation (optimistic create) have no real id yet —
  // editing/deleting/selecting them would 404 or act on a soon-to-be-replaced entry.
  const isOptimistic = (id: string) => id.startsWith(OPTIMISTIC_ID_PREFIX);

  // Immediate — drives UI feedback (Clear Filters button visibility, header copy) the instant
  // the user types/toggles, no debounce lag.
  const isFilterActive = searchQuery.trim() !== '' || selectedTags.length > 0;
  // Debounced — matches the params actually driving the current `recipes` fetch. Using the
  // immediate isFilterActive here instead would flash the wrong empty state: after clearing
  // filters, searchQuery resets synchronously but `recipes` still reflects the stale filtered
  // query for ~300ms, so isFilterActive and "recipes.length === 0" would briefly both hold true
  // for the wrong reason, unmounting the whole search UI into the "database is empty" state.
  const isFetchFilterActive = debouncedSearchQuery.trim() !== '' || selectedTags.length > 0;

  const toggleTagFilter = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedTags([]);
  };

  const handleSelectRecipe = (id: string) => {
    if (isOptimistic(id)) return;
    setSelectedRecipeIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    // "Select all" means all currently-loaded recipes, not every recipe in the database —
    // the expected semantics for a paginated list ("select all loaded," not a server-driven
    // "select every matching row" mechanism, which is out of scope here).
    const loadedIds = recipes.filter((r) => !isOptimistic(r.id)).map((r) => r.id);
    const allLoadedSelected =
      loadedIds.length > 0 && loadedIds.every((id) => selectedRecipeIds.includes(id));

    if (allLoadedSelected) {
      setSelectedRecipeIds((prev) => prev.filter((id) => !loadedIds.includes(id)));
    } else {
      setSelectedRecipeIds((prev) => Array.from(new Set([...prev, ...loadedIds])));
    }
  };

  const handleDelete = (recipe: RecipeDto) => {
    if (isOptimistic(recipe.id)) return;
    if (window.confirm(`Are you sure you want to delete "${recipe.name}"?`)) {
      deleteRecipeMutation.mutate(recipe.id, {
        onSuccess: () => {
          setSelectedRecipeIds((prev) => prev.filter((id) => id !== recipe.id));
        },
      });
    }
  };

  const handleBulkDelete = async () => {
    const count = selectedRecipeIds.length;
    if (count === 0) return;

    if (
      !window.confirm(`Are you sure you want to delete ${count} recipe${count > 1 ? 's' : ''}?`)
    ) {
      return;
    }

    setBulkActionError(null);

    const { succeededIds, failedErrors } = await bulkDeleteMutation.mutateAsync(selectedRecipeIds);

    if (failedErrors.length === 0) {
      // Full success: reset selections to empty
      setSelectedRecipeIds([]);
    } else {
      // Partial failure: remove succeeded IDs from selection, display error banner
      setSelectedRecipeIds((prev) => prev.filter((id) => !succeededIds.includes(id)));
      setBulkActionError(
        `Successfully deleted ${succeededIds.length} recipe(s). Failed to delete ${failedErrors.length} recipe(s): ${failedErrors.join('; ')}`
      );
    }
  };

  const handleSendToShoppingList = () => {
    if (selectedRecipeIds.length === 0) return;
    if (onSendToShoppingList) {
      onSendToShoppingList(selectedRecipeIds);
    }
    setSelectedRecipeIds([]);
  };

  const handleEditClick = (recipe: RecipeDto) => {
    if (isOptimistic(recipe.id)) return;
    if (onEditRecipe) {
      onEditRecipe(recipe);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <RefreshCw className="h-8 w-8 animate-spin text-clay" />
        <p className="mt-3 text-sm font-medium text-ink-muted">Loading your recipe collection...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <Alert className="border-clay/30 bg-clay-light text-clay-hover">
        <AlertCircle className="h-5 w-5 text-clay-hover" />
        <AlertDescription className="text-sm">
          <span className="font-semibold">Failed to load recipes: </span>
          {error instanceof Error ? error.message : 'Unknown network error.'}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="ml-3 border-clay/30 text-xs text-clay-hover hover:bg-clay/10"
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (recipes.length === 0 && !isFetchFilterActive) {
    return (
      <Card className="flex flex-col items-center justify-center border-stone bg-paper p-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-clay/30 bg-clay-light text-clay">
          <ChefHat className="h-6 w-6" />
        </div>
        <h3 className="mt-4 font-serif text-lg font-bold text-ink">No Recipes Available</h3>
        <p className="mt-1 max-w-sm text-xs text-ink-muted">
          Your recipe book is empty. Add a new recipe above to start scaling and building shopping
          lists.
        </p>
      </Card>
    );
  }

  const allLoadedAreSelected =
    recipes.length > 0 && recipes.every((r) => selectedRecipeIds.includes(r.id));

  return (
    <div className="space-y-6">
      {deleteRecipeMutation.isError && (
        <Alert className="border-clay/30 bg-clay-light text-clay-hover">
          <AlertCircle className="h-5 w-5 text-clay-hover" />
          <AlertDescription className="text-sm">
            <span className="font-semibold">Error Deleting Recipe: </span>
            {deleteRecipeMutation.error.message}
          </AlertDescription>
        </Alert>
      )}

      {bulkActionError && (
        <Alert className="border-clay/30 bg-clay-light text-clay-hover">
          <AlertCircle className="h-5 w-5 text-clay-hover" />
          <AlertDescription className="text-sm">
            <span className="font-semibold">Bulk Action Error: </span>
            {bulkActionError}
          </AlertDescription>
        </Alert>
      )}

      {/* Header Section */}
      <div className="flex flex-col gap-4 border-b border-stone pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-bold tracking-tight text-ink">
            Saved Recipes ({recipes.length}
            {hasNextPage ? '+' : ''})
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {isFilterActive
              ? 'Filtered recipe results — showing loaded matches'
              : 'Showing loaded recipes'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {recipes.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleToggleSelectAll}
              className="space-x-1.5 text-xs text-ink border-stone"
            >
              {allLoadedAreSelected ? (
                <CheckSquare className="h-3.5 w-3.5 text-clay" />
              ) : (
                <Square className="h-3.5 w-3.5 text-ink-subtle" />
              )}
              <span>{allLoadedAreSelected ? 'Deselect All' : 'Select All'}</span>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="space-x-1.5 border-stone text-ink"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Search & Dietary Filter Controls Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-stone bg-paper p-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <Input
            id="recipe-search-input"
            type="text"
            placeholder="Search recipes by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-8 h-9 text-sm bg-canvas border-stone"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search input"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Dietary Tag Toggle Buttons & Clear Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1 text-xs text-ink-muted mr-1">
            <Filter className="h-3.5 w-3.5 text-clay-hover" />
            <span>Dietary:</span>
          </div>
          {AVAILABLE_TAGS.map((tag) => {
            const isSelected = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTagFilter(tag)}
                aria-label={`Filter by ${tag}`}
                className={`rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider transition-all ${
                  isSelected
                    ? tag === 'Vegan'
                      ? 'bg-olive-hover text-canvas border border-olive-hover shadow-warm-sm'
                      : 'bg-olive text-canvas border border-olive shadow-warm-sm'
                    : 'bg-canvas text-ink-muted border border-stone hover:border-ink-muted hover:text-ink'
                }`}
              >
                {tag} {isSelected ? '✓' : ''}
              </button>
            );
          })}

          {isFilterActive && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-7 px-2 text-xs text-clay-hover hover:text-clay-hover hover:bg-clay-light/60 font-semibold"
            >
              <X className="mr-1 h-3 w-3" />
              <span>Clear Filters</span>
            </Button>
          )}
        </div>
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedRecipeIds.length > 0 && (
        <div className="sticky top-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-clay/40 bg-paper/95 p-3.5 shadow-warm-xl backdrop-blur-md">
          <div className="flex items-center space-x-2">
            <span className="rounded-lg bg-clay-hover px-2.5 py-1 text-xs font-bold text-canvas shadow-warm-sm">
              {selectedRecipeIds.length} Selected
            </span>
            <span className="text-xs text-ink-muted hidden sm:inline">
              Choose an action for selected recipes:
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleSendToShoppingList}
              className="h-8 space-x-1.5 text-xs font-semibold text-white bg-clay hover:bg-clay-hover"
            >
              <ShoppingBag className="h-3.5 w-3.5 text-white" />
              <span>Build Shopping List</span>
            </Button>

            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
              className="h-8 space-x-1.5 text-xs font-semibold"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{bulkDeleteMutation.isPending ? 'Deleting...' : 'Delete Selected'}</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedRecipeIds([])}
              className="h-8 px-2 text-xs text-ink-muted hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Deselect All</span>
            </Button>
          </div>
        </div>
      )}

      {/* Zero Filter Results Empty State */}
      {recipes.length === 0 ? (
        <Card className="flex flex-col items-center justify-center border-stone bg-paper/60 p-10 text-center">
          <Search className="h-10 w-10 text-ink-subtle" />
          <h3 className="mt-3 font-serif text-base font-semibold text-ink">
            No recipes match your search/filter
          </h3>
          <p className="mt-1 text-xs text-ink-muted max-w-sm">
            Try adjusting your search query or dietary tag filters to find what you are looking for.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearFilters}
            className="mt-4 space-x-1.5 text-xs text-clay-hover border-clay/30 hover:bg-clay-light"
          >
            <X className="h-3.5 w-3.5" />
            <span>Clear Filters</span>
          </Button>
        </Card>
      ) : (
        /* Recipe Cards Grid */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe, index) => {
            const isSelected = selectedRecipeIds.includes(recipe.id);
            const cardCheckboxId = `select-recipe-${recipe.id}`;
            const pending = isOptimistic(recipe.id);

            return (
              <motion.div
                key={recipe.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -4 }}
                transition={{
                  duration: 0.25,
                  ease: [0.16, 1, 0.3, 1],
                  delay: Math.min(index * 0.03, 0.3),
                }}
              >
                <Card
                  className={`flex h-full flex-col justify-between p-5 transition-colors ${
                    isSelected
                      ? 'border-clay bg-clay-light/30 shadow-warm-md'
                      : 'border-stone bg-paper hover:border-stone-dark hover:shadow-warm-lg'
                  }`}
                >
                  <div>
                    <CardHeader className="p-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start space-x-2.5">
                          <Checkbox
                            id={cardCheckboxId}
                            checked={isSelected}
                            onChange={() => handleSelectRecipe(recipe.id)}
                            disabled={pending}
                            aria-label={`Select recipe ${recipe.name}`}
                            className="mt-1"
                          />
                          <label htmlFor={cardCheckboxId} className="cursor-pointer">
                            <CardTitle className="font-serif text-base text-ink hover:text-clay-hover transition-colors">
                              {recipe.name}
                            </CardTitle>
                          </label>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {pending && (
                            <span className="rounded-full bg-clay-light px-2.5 py-1 text-xs font-semibold text-clay-hover">
                              Saving…
                            </span>
                          )}
                          <div className="flex items-center space-x-1 rounded-full bg-canvas border border-stone/60 px-2.5 py-1 text-xs font-semibold text-ink-muted">
                            <Users className="h-3 w-3 text-clay-hover" />
                            <span>{recipe.baseServings} servings</span>
                          </div>
                        </div>
                      </div>

                      {recipe.dietaryTags && recipe.dietaryTags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5 pl-6">
                          {recipe.dietaryTags.map((tag) => (
                            <span
                              key={tag}
                              className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider shadow-warm-sm ${
                                tag === 'Vegan'
                                  ? 'bg-olive-hover text-canvas'
                                  : 'bg-olive text-canvas'
                              }`}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </CardHeader>

                    <CardContent className="mt-4 border-t border-stone/60 p-0 pt-3">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                        Ingredients ({recipe.ingredients.length})
                      </span>
                      <ul className="mt-2 space-y-1 text-xs text-ink">
                        {recipe.ingredients.map((ing, i) => (
                          <li key={i} className="flex justify-between py-0.5">
                            <span className="font-medium text-ink">{ing.displayName}</span>
                            <span className="font-mono text-ink-muted">
                              {formatQuantityAmount(ing.amount, ing.unit, ing.category, 'display')}{' '}
                              {ing.unit}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {recipe.steps && recipe.steps.length > 0 && (
                        <>
                          <span className="mt-4 block border-t border-stone/40 pt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                            Instructions ({recipe.steps.length})
                          </span>
                          <ol className="mt-2 space-y-1.5 text-xs text-ink">
                            {recipe.steps.map((step, i) => (
                              <li key={i} className="flex gap-2">
                                <span className="shrink-0 font-mono text-ink-muted">{i + 1}.</span>
                                <span className="flex-1">
                                  {step.instruction}
                                  {(step.duration || step.temperature) && (
                                    <span className="ml-1.5 inline-flex items-center gap-1.5 align-middle">
                                      {step.duration && (
                                        <span className="inline-flex items-center gap-0.5 rounded bg-canvas border border-stone/60 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                                          <Clock className="h-2.5 w-2.5" />
                                          {formatDuration(step.duration.amount, step.duration.unit)}
                                        </span>
                                      )}
                                      {step.temperature && (
                                        <span className="inline-flex items-center gap-0.5 rounded bg-canvas border border-stone/60 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                                          <Thermometer className="h-2.5 w-2.5" />
                                          {formatTemperature(
                                            step.temperature.amount,
                                            step.temperature.unit
                                          )}
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ol>
                        </>
                      )}
                    </CardContent>
                  </div>

                  <div className="mt-4 flex items-center justify-end border-t border-stone/40 pt-3 text-xs">
                    <div className="flex items-center space-x-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditClick(recipe)}
                        disabled={pending}
                        aria-label={`Edit recipe ${recipe.name}`}
                        className="h-7 px-2 text-xs text-ink-muted hover:text-ink"
                      >
                        <Pencil className="mr-1 h-3 w-3" />
                        <span>Edit</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(recipe)}
                        disabled={pending || deleteRecipeMutation.isPending}
                        aria-label={`Delete recipe ${recipe.name}`}
                        className="h-7 px-2 text-xs text-ink-muted hover:text-clay-hover"
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        <span>Delete</span>
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="space-x-1.5 border-stone text-ink"
          >
            {isFetchingNextPage ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span>{isFetchingNextPage ? 'Loading...' : 'Load More'}</span>
          </Button>
        </div>
      )}
    </div>
  );
};
