import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShoppingBag,
  AlertCircle,
  Users,
  Layers,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  PlusCircle,
  Loader2,
} from 'lucide-react';
import {
  useRecipes,
  useBuildShoppingList,
  useShoppingList,
  useCreateShoppingList,
  useDeleteShoppingList,
  useToggleShoppingListItemChecked,
  useSetIngredientCategory,
  useClearIngredientCategory,
} from '../lib/queries';
import { formatQuantityAmount } from '../lib/formatQuantity';
import { groupByCategory, GROCERY_CATEGORY_ORDER } from '../lib/groceryCategories';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Select } from './ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';

export interface ShoppingListBuilderProps {
  initialSelectedRecipeIds?: string[];
  selectedShoppingListId?: string | null;
  onSaved?: (id: string) => void;
  onCloseDetail?: () => void;
}

export const ShoppingListBuilder: React.FC<ShoppingListBuilderProps> = ({
  initialSelectedRecipeIds,
  selectedShoppingListId = null,
  onSaved,
  onCloseDetail,
}) => {
  const isViewMode = selectedShoppingListId != null;

  const {
    data: recipes = [],
    isLoading: loadingRecipes,
    isError: recipeIsError,
    error: recipeQueryError,
    refetch,
  } = useRecipes();

  // Selected recipe IDs and target servings map: { [recipeId]: number }
  const [name, setName] = useState('');
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);
  const [targetServingsMap, setTargetServingsMap] = useState<Record<string, number>>({});

  React.useEffect(() => {
    if (initialSelectedRecipeIds && initialSelectedRecipeIds.length > 0 && recipes.length > 0) {
      setSelectedRecipeIds((prev) => Array.from(new Set([...prev, ...initialSelectedRecipeIds])));
      setTargetServingsMap((prev) => {
        const next = { ...prev };
        initialSelectedRecipeIds.forEach((id) => {
          const matched = recipes.find((r) => r.id === id);
          if (matched && !(id in next)) {
            next[id] = matched.baseServings;
          }
        });
        return next;
      });
    }
  }, [initialSelectedRecipeIds, recipes]);

  const buildShoppingListMutation = useBuildShoppingList();
  const shoppingListQuery = useShoppingList(selectedShoppingListId);
  const createListMutation = useCreateShoppingList();
  const deleteListMutation = useDeleteShoppingList();
  const toggleItemMutation = useToggleShoppingListItemChecked();
  const setCategoryMutation = useSetIngredientCategory();
  const clearCategoryMutation = useClearIngredientCategory();

  const [expandedRecipes, setExpandedRecipes] = useState<Record<string, boolean>>({});

  const toggleRecipeSelection = (recipeId: string, baseServings: number) => {
    if (selectedRecipeIds.includes(recipeId)) {
      setSelectedRecipeIds((prev) => prev.filter((id) => id !== recipeId));
    } else {
      setSelectedRecipeIds((prev) => [...prev, recipeId]);
      setTargetServingsMap((prev) => ({
        ...prev,
        [recipeId]: baseServings,
      }));
    }
  };

  const handleServingsChange = (recipeId: string, valueStr: string) => {
    const parsed = parseInt(valueStr, 10);
    const servings = isNaN(parsed) || parsed < 1 ? 1 : parsed;
    setTargetServingsMap((prev) => ({
      ...prev,
      [recipeId]: servings,
    }));
  };

  const buildPayload = () =>
    selectedRecipeIds.map((id) => ({
      recipeId: id,
      targetServings: Number(targetServingsMap[id] ?? 1),
    }));

  const handleBuildShoppingList = () => {
    if (selectedRecipeIds.length === 0) {
      return;
    }

    buildShoppingListMutation.mutate(buildPayload());
  };

  const handleSaveList = () => {
    if (!name.trim()) return;

    createListMutation.mutate(
      { name: name.trim(), sourceItems: buildPayload() },
      {
        onSuccess: (created) => {
          if (onSaved) onSaved(created.id);
        },
      }
    );
  };

  const handleDeleteList = () => {
    if (!selectedShoppingListId) return;
    if (!window.confirm(`Are you sure you want to delete "${shoppingListQuery.data?.name}"?`))
      return;

    deleteListMutation.mutate(selectedShoppingListId, {
      onSuccess: () => {
        if (onCloseDetail) onCloseDetail();
      },
    });
  };

  const handleBuildNewList = () => {
    if (onCloseDetail) onCloseDetail();
  };

  const handleToggleItem = (itemId: string, checked: boolean) => {
    if (!selectedShoppingListId) return;
    toggleItemMutation.mutate({ listId: selectedShoppingListId, itemId, checked });
  };

  // In view mode, useSetIngredientCategory/useClearIngredientCategory already invalidate
  // ['shoppingLists'], which refetches this saved list automatically. Build-mode's preview
  // is a mutation result (buildShoppingListMutation.data), not a cached query, so nothing
  // refetches it on its own — re-running the build with the same payload is what makes the
  // override visible in the still-open preview.
  const handleRecategorize = (ingredientId: string, category: string) => {
    setCategoryMutation.mutate(
      { ingredientId, category },
      {
        onSuccess: () => {
          if (!isViewMode) buildShoppingListMutation.mutate(buildPayload());
        },
      }
    );
  };

  const handleResetCategory = (ingredientId: string) => {
    clearCategoryMutation.mutate(ingredientId, {
      onSuccess: () => {
        if (!isViewMode) buildShoppingListMutation.mutate(buildPayload());
      },
    });
  };

  const toggleRecipeExpanded = (recipeId: string) => {
    setExpandedRecipes((prev) => ({
      ...prev,
      [recipeId]: !prev[recipeId],
    }));
  };

  const displayError =
    (buildShoppingListMutation.isError && buildShoppingListMutation.error
      ? buildShoppingListMutation.error.message
      : null) ||
    (createListMutation.isError && createListMutation.error
      ? createListMutation.error.message
      : null) ||
    (deleteListMutation.isError && deleteListMutation.error
      ? deleteListMutation.error.message
      : null) ||
    (shoppingListQuery.isError && shoppingListQuery.error
      ? shoppingListQuery.error.message
      : null) ||
    (recipeIsError && recipeQueryError ? recipeQueryError.message : null);

  const shoppingListData = buildShoppingListMutation.data;
  const canSaveList = !isViewMode && Boolean(shoppingListData) && name.trim().length > 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl font-bold tracking-tight text-ink">
            {isViewMode
              ? `Viewing: ${shoppingListQuery.data?.name ?? '...'}`
              : 'Shopping List Builder'}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {isViewMode
              ? 'Check items off as you shop — changes save instantly.'
              : 'Select recipes, set target serving counts, and get a consolidated ingredient shopping list.'}
          </p>
        </div>
        {isViewMode && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleBuildNewList}
            className="space-x-1.5 border-stone text-ink"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>Build New List</span>
          </Button>
        )}
      </div>

      {displayError && (
        <Alert className="border-clay/30 bg-clay-light text-clay-hover">
          <AlertCircle className="h-5 w-5 text-clay-hover" />
          <AlertDescription className="text-sm">
            <span className="font-semibold">Error: </span>
            {displayError}
          </AlertDescription>
        </Alert>
      )}

      {isViewMode ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <Card>
            <CardHeader className="flex-row items-center justify-between border-b border-stone pb-4">
              <div className="flex items-center space-x-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-clay-light text-clay">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="font-serif text-lg font-bold text-ink">Checklist</CardTitle>
                  <CardDescription className="text-xs text-ink-muted">
                    {shoppingListQuery.data
                      ? `${shoppingListQuery.data.items.filter((i) => i.checked).length} of ${shoppingListQuery.data.items.length} checked`
                      : 'Loading...'}
                  </CardDescription>
                </div>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDeleteList}
                disabled={deleteListMutation.isPending}
                className="space-x-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{deleteListMutation.isPending ? 'Deleting...' : 'Delete List'}</span>
              </Button>
            </CardHeader>

            <CardContent className="pt-6">
              {shoppingListQuery.isLoading ? (
                <div className="flex items-center justify-center py-8 text-ink-muted">
                  <RefreshCw className="mr-2 h-5 w-5 animate-spin text-clay" />
                  <span className="text-sm font-medium">Loading list...</span>
                </div>
              ) : !shoppingListQuery.data || shoppingListQuery.data.items.length === 0 ? (
                <div className="py-4 text-sm text-ink-muted">This list has no items yet.</div>
              ) : (
                <div className="space-y-6">
                  {groupByCategory(shoppingListQuery.data.items).map((group) => (
                    <div key={group.category}>
                      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                        {group.category}
                      </h3>
                      <div className="divide-y divide-stone/60">
                        {group.items.map((item) => {
                          const checkboxId = `list-item-${item.id}`;
                          return (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-3 py-3.5"
                            >
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  id={checkboxId}
                                  checked={item.checked}
                                  onChange={() => handleToggleItem(item.id, !item.checked)}
                                  aria-label={`Mark ${item.displayName} as ${item.checked ? 'not purchased' : 'purchased'}`}
                                />
                                <div>
                                  <Label
                                    htmlFor={checkboxId}
                                    className={`cursor-pointer text-left font-normal normal-case tracking-normal text-base ${
                                      item.checked ? 'text-ink-muted line-through' : 'text-ink'
                                    }`}
                                  >
                                    {item.displayName}
                                  </Label>
                                  <div className="mt-1 flex items-center gap-1">
                                    <Select
                                      value={item.category}
                                      onChange={(e) =>
                                        handleRecategorize(item.ingredientId, e.target.value)
                                      }
                                      aria-label={`Grocery category for ${item.displayName}`}
                                      className="h-6 w-auto rounded-md border-stone/60 bg-canvas px-1.5 py-0 text-[11px] text-ink-muted"
                                    >
                                      {GROCERY_CATEGORY_ORDER.map((category) => (
                                        <option key={category} value={category}>
                                          {category}
                                        </option>
                                      ))}
                                    </Select>
                                    {item.categoryIsOverridden && (
                                      <button
                                        type="button"
                                        onClick={() => handleResetCategory(item.ingredientId)}
                                        disabled={clearCategoryMutation.isPending}
                                        title="Reset to default category"
                                        aria-label={`Reset ${item.displayName} to its default category`}
                                        className="flex h-6 w-6 items-center justify-center rounded-md text-ink-muted hover:bg-canvas hover:text-clay-hover disabled:opacity-50"
                                      >
                                        <RotateCcw className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <span
                                className={`rounded-xl border px-4 py-2 font-mono text-sm font-semibold ${
                                  item.checked
                                    ? 'border-stone/60 bg-canvas text-ink-muted'
                                    : 'border-clay/30 bg-clay-light text-clay-hover'
                                }`}
                                title={
                                  item.wasRoundedForPurchase
                                    ? `Rounded up for purchase — exact amount needed: ${formatQuantityAmount(item.mathematicalQuantity.amount, item.mathematicalQuantity.unit, item.mathematicalQuantity.category, 'display')} ${item.mathematicalQuantity.unit}`
                                    : undefined
                                }
                              >
                                {formatQuantityAmount(
                                  item.quantity.amount,
                                  item.quantity.unit,
                                  item.quantity.category,
                                  'consolidated'
                                )}{' '}
                                {item.quantity.unit}
                                {item.wasRoundedForPurchase && (
                                  <sup className="ml-0.5 text-[10px] font-normal text-clay-hover/70">
                                    *
                                  </sup>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <>
          {/* Recipe Picker Section */}
          <Card>
            <CardHeader className="flex-row items-center justify-between border-b border-stone pb-4">
              <div>
                <CardTitle className="font-serif text-lg font-bold text-ink">
                  1. Select Recipes & Target Servings
                </CardTitle>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => refetch()}
                className="space-x-1.5 text-xs text-ink-muted hover:text-ink"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingRecipes ? 'animate-spin' : ''}`} />
                <span>Reload Recipes</span>
              </Button>
            </CardHeader>

            <CardContent className="space-y-6 pt-6">
              <div>
                <Label htmlFor="input-shopping-list-name" className="text-xs text-ink-muted">
                  List Name
                </Label>
                <Input
                  id="input-shopping-list-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Weekly Groceries"
                  className="mt-1 h-9 bg-canvas border-stone"
                />
              </div>

              {loadingRecipes ? (
                <div className="flex items-center justify-center py-8 text-ink-muted">
                  <RefreshCw className="mr-2 h-5 w-5 animate-spin text-clay" />
                  <span className="text-sm font-medium">Loading recipe options...</span>
                </div>
              ) : recipes.length === 0 ? (
                <div className="py-8 text-center text-sm text-ink-muted">
                  No recipes available yet. Go to the Recipes tab to create some!
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {recipes.map((recipe) => {
                      const isSelected = selectedRecipeIds.includes(recipe.id);
                      const checkboxId = `recipe-select-${recipe.id}`;
                      const targetServingsId = `target-servings-${recipe.id}`;

                      return (
                        <div
                          key={recipe.id}
                          className={`flex flex-col justify-between rounded-xl border p-4 transition-all ${
                            isSelected
                              ? 'border-clay bg-clay-light/30 shadow-warm-md'
                              : 'border-stone bg-paper hover:border-stone-dark'
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between">
                              <div className="flex items-start space-x-3">
                                <Checkbox
                                  id={checkboxId}
                                  checked={isSelected}
                                  onChange={() =>
                                    toggleRecipeSelection(recipe.id, recipe.baseServings)
                                  }
                                  aria-label={`Select recipe ${recipe.name}`}
                                  className="mt-1"
                                />
                                <Label
                                  htmlFor={checkboxId}
                                  className="cursor-pointer text-left font-normal normal-case tracking-normal"
                                >
                                  <span className="font-serif text-sm font-semibold text-ink block">
                                    {recipe.name}
                                  </span>
                                  <span className="text-xs text-ink-muted block">
                                    Base: {recipe.baseServings} servings
                                  </span>
                                </Label>
                              </div>
                            </div>
                          </div>

                          {isSelected && (
                            <div className="mt-4 border-t border-stone/60 pt-3">
                              <Label
                                htmlFor={targetServingsId}
                                className="text-[11px] text-ink-muted"
                              >
                                Target Servings
                              </Label>
                              <Input
                                id={targetServingsId}
                                type="number"
                                min={1}
                                value={targetServingsMap[recipe.id] ?? recipe.baseServings}
                                onChange={(e) => handleServingsChange(recipe.id, e.target.value)}
                                className="mt-1 h-8 rounded-lg bg-canvas border-stone px-3 text-xs"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-stone pt-4">
                    <Button
                      type="button"
                      onClick={handleBuildShoppingList}
                      disabled={
                        buildShoppingListMutation.isPending || selectedRecipeIds.length === 0
                      }
                      className="space-x-2 bg-clay text-white hover:bg-clay-hover disabled:opacity-50"
                    >
                      <ShoppingBag className="h-4 w-4" />
                      <span>
                        {buildShoppingListMutation.isPending
                          ? 'Building List...'
                          : `Build Shopping List (${selectedRecipeIds.length} Selected)`}
                      </span>
                    </Button>
                    {shoppingListData && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleSaveList}
                        disabled={!canSaveList || createListMutation.isPending}
                        className="space-x-2 bg-olive text-white hover:bg-olive-hover disabled:opacity-50"
                      >
                        {createListMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        <span>
                          {createListMutation.isPending ? 'Saving...' : 'Save Shopping List'}
                        </span>
                      </Button>
                    )}
                  </div>
                  {shoppingListData && !name.trim() && (
                    <p className="text-right text-xs text-clay-hover">
                      Add a list name above to save this list.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shopping List Results */}
          {shoppingListData && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-8"
            >
              {/* Primary View: Consolidated Shopping List */}
              <Card>
                <CardHeader className="flex-row items-center space-x-3 border-b border-stone pb-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-clay-light text-clay">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="font-serif text-lg font-bold text-ink">
                      Consolidated Shopping List
                    </CardTitle>
                    <CardDescription className="text-xs text-ink-muted">
                      Total ingredients merged across {shoppingListData.scaledRecipes.length} scaled
                      recipe(s).
                    </CardDescription>
                  </div>
                </CardHeader>

                <CardContent className="pt-6">
                  <div className="space-y-6">
                    {groupByCategory(shoppingListData.shoppingList).map((group) => (
                      <div key={group.category}>
                        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          {group.category}
                        </h3>
                        <div className="divide-y divide-stone/60">
                          {group.items.map((item, idx) => (
                            <div
                              key={idx}
                              className="flex flex-col justify-between py-3.5 sm:flex-row sm:items-center"
                            >
                              <div>
                                <span className="text-base font-semibold text-ink">
                                  {item.displayName}
                                </span>
                                <span className="ml-2 text-xs text-ink-muted">
                                  ({item.ingredientId})
                                </span>
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  <span className="text-[11px] text-ink-muted">From recipes:</span>
                                  {item.sourceRecipeIds.map((rId) => {
                                    const matchedRecipe = shoppingListData.scaledRecipes.find(
                                      (sr) => sr.sourceRecipeId === rId
                                    );
                                    return (
                                      <span
                                        key={rId}
                                        className="rounded bg-canvas border border-stone/60 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted"
                                      >
                                        {matchedRecipe?.sourceRecipeName || rId}
                                      </span>
                                    );
                                  })}
                                </div>
                                <div className="mt-1.5 flex items-center gap-1">
                                  <Select
                                    value={item.category}
                                    onChange={(e) =>
                                      handleRecategorize(item.ingredientId, e.target.value)
                                    }
                                    aria-label={`Grocery category for ${item.displayName}`}
                                    className="h-6 w-auto rounded-md border-stone/60 bg-canvas px-1.5 py-0 text-[11px] text-ink-muted"
                                  >
                                    {GROCERY_CATEGORY_ORDER.map((category) => (
                                      <option key={category} value={category}>
                                        {category}
                                      </option>
                                    ))}
                                  </Select>
                                  {item.categoryIsOverridden && (
                                    <button
                                      type="button"
                                      onClick={() => handleResetCategory(item.ingredientId)}
                                      disabled={clearCategoryMutation.isPending}
                                      title="Reset to default category"
                                      aria-label={`Reset ${item.displayName} to its default category`}
                                      className="flex h-6 w-6 items-center justify-center rounded-md text-ink-muted hover:bg-canvas hover:text-clay-hover disabled:opacity-50"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="mt-2 sm:mt-0">
                                <span
                                  className="rounded-xl border border-clay/30 bg-clay-light px-4 py-2 font-mono text-sm font-semibold text-clay-hover"
                                  title={
                                    item.wasRoundedForPurchase
                                      ? `Rounded up for purchase — exact amount needed: ${formatQuantityAmount(item.mathematicalQuantity.amount, item.mathematicalQuantity.unit, item.mathematicalQuantity.category, 'display')} ${item.mathematicalQuantity.unit}`
                                      : undefined
                                  }
                                >
                                  {formatQuantityAmount(
                                    item.quantity.amount,
                                    item.quantity.unit,
                                    item.quantity.category,
                                    'consolidated'
                                  )}{' '}
                                  {item.quantity.unit}
                                  {item.wasRoundedForPurchase && (
                                    <sup className="ml-0.5 text-[10px] font-normal text-clay-hover/70">
                                      *
                                    </sup>
                                  )}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Secondary View: Per-Recipe Scaled Breakdown */}
              <Card>
                <CardHeader className="flex-row items-center space-x-3 border-b border-stone pb-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-olive-light text-olive">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="font-serif text-lg font-bold text-ink">
                      Per-Recipe Scaled Breakdown
                    </CardTitle>
                    <CardDescription className="text-xs text-ink-muted">
                      Individual scaled ingredient quantities for each recipe.
                    </CardDescription>
                  </div>
                </CardHeader>

                <CardContent className="pt-6">
                  <div className="space-y-4">
                    {shoppingListData.scaledRecipes.map((sr) => {
                      const isExpanded = expandedRecipes[sr.sourceRecipeId] ?? true;
                      return (
                        <div
                          key={sr.sourceRecipeId}
                          className="overflow-hidden rounded-xl border border-stone bg-paper"
                        >
                          <button
                            type="button"
                            onClick={() => toggleRecipeExpanded(sr.sourceRecipeId)}
                            aria-expanded={isExpanded}
                            className="flex w-full items-center justify-between p-4 text-left hover:bg-canvas/60"
                          >
                            <div className="flex items-center space-x-3">
                              <span className="font-serif font-semibold text-ink">
                                {sr.sourceRecipeName}
                              </span>
                              <span className="flex items-center space-x-1 rounded-full bg-canvas border border-stone/60 px-2.5 py-0.5 text-xs text-ink-muted">
                                <Users className="h-3 w-3 text-clay-hover" />
                                <span>
                                  {sr.targetServings} servings (x{sr.scaleFactor})
                                </span>
                              </span>
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-ink-muted" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-ink-muted" />
                            )}
                          </button>

                          {isExpanded && (
                            <div className="border-t border-stone/60 bg-canvas/40 p-4">
                              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {sr.ingredients.map((ing, i) => (
                                  <li
                                    key={i}
                                    className="flex items-center justify-between rounded-lg border border-stone/60 bg-paper p-2.5 text-xs"
                                  >
                                    <span className="font-medium text-ink">{ing.displayName}</span>
                                    <span className="font-mono font-semibold text-clay-hover">
                                      {formatQuantityAmount(
                                        ing.quantity.amount,
                                        ing.quantity.unit,
                                        ing.quantity.category,
                                        'display'
                                      )}{' '}
                                      {ing.quantity.unit}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
};
