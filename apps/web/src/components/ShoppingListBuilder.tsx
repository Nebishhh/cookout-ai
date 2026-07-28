import React, { useState } from 'react';
import {
  ShoppingBag,
  AlertCircle,
  Users,
  Layers,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { useRecipes, useBuildShoppingList } from '../lib/queries';
import { formatQuantityAmount } from '../lib/formatQuantity';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';

export const ShoppingListBuilder: React.FC = () => {
  const {
    data: recipes = [],
    isLoading: loadingRecipes,
    isError: recipeIsError,
    error: recipeQueryError,
    refetch,
  } = useRecipes();

  // Selected recipe IDs and target servings map: { [recipeId]: number }
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);
  const [targetServingsMap, setTargetServingsMap] = useState<Record<string, number>>({});

  const buildShoppingListMutation = useBuildShoppingList();

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

  const handleBuildShoppingList = () => {
    if (selectedRecipeIds.length === 0) {
      return;
    }

    const payload = selectedRecipeIds.map((id) => ({
      recipeId: id,
      targetServings: Number(targetServingsMap[id] ?? 1),
    }));

    buildShoppingListMutation.mutate(payload);
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
      : null) || (recipeIsError && recipeQueryError ? recipeQueryError.message : null);

  const shoppingListData = buildShoppingListMutation.data;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Shopping List Builder</h2>
        <p className="mt-1 text-sm text-slate-400">
          Select recipes, set target serving counts, and get a consolidated ingredient shopping
          list.
        </p>
      </div>

      {displayError && (
        <Alert className="border-red-500/30 bg-red-500/10 text-red-400">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <AlertDescription className="text-sm">
            <span className="font-semibold">Error: </span>
            {displayError}
          </AlertDescription>
        </Alert>
      )}

      {/* Recipe Picker Section */}
      <Card>
        <CardHeader className="flex-row items-center justify-between border-b border-slate-800/80 pb-4">
          <div>
            <CardTitle className="text-lg">1. Select Recipes & Target Servings</CardTitle>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="space-x-1.5 text-xs text-slate-400 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingRecipes ? 'animate-spin' : ''}`} />
            <span>Reload Recipes</span>
          </Button>
        </CardHeader>

        <CardContent className="pt-6">
          {loadingRecipes ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <RefreshCw className="mr-2 h-5 w-5 animate-spin text-orange-500" />
              <span className="text-sm font-medium">Loading recipe options...</span>
            </div>
          ) : recipes.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
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
                          ? 'border-orange-500/60 bg-orange-500/10 shadow-md shadow-orange-500/10'
                          : 'border-slate-800 bg-slate-800/40 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3">
                            <Checkbox
                              id={checkboxId}
                              checked={isSelected}
                              onChange={() => toggleRecipeSelection(recipe.id, recipe.baseServings)}
                              aria-label={`Select recipe ${recipe.name}`}
                              className="mt-1"
                            />
                            <Label
                              htmlFor={checkboxId}
                              className="cursor-pointer text-left font-normal normal-case tracking-normal"
                            >
                              <span className="text-sm font-semibold text-white block">
                                {recipe.name}
                              </span>
                              <span className="text-xs text-slate-400 block">
                                Base: {recipe.baseServings} servings
                              </span>
                            </Label>
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="mt-4 border-t border-slate-800/80 pt-3">
                          <Label htmlFor={targetServingsId} className="text-[11px] text-slate-300">
                            Target Servings
                          </Label>
                          <Input
                            id={targetServingsId}
                            type="number"
                            min={1}
                            value={targetServingsMap[recipe.id] ?? recipe.baseServings}
                            onChange={(e) => handleServingsChange(recipe.id, e.target.value)}
                            className="mt-1 h-8 rounded-lg bg-slate-900 px-3 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex justify-end border-t border-slate-800/80 pt-4">
                <Button
                  type="button"
                  onClick={handleBuildShoppingList}
                  disabled={buildShoppingListMutation.isPending || selectedRecipeIds.length === 0}
                  className="space-x-2 text-black"
                >
                  <ShoppingBag className="h-4 w-4" />
                  <span>
                    {buildShoppingListMutation.isPending
                      ? 'Building List...'
                      : `Build Shopping List (${selectedRecipeIds.length} Selected)`}
                  </span>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shopping List Results */}
      {shoppingListData && (
        <div className="space-y-8">
          {/* Primary View: Consolidated Shopping List */}
          <Card>
            <CardHeader className="flex-row items-center space-x-3 border-b border-slate-800/80 pb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/20 text-orange-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Consolidated Shopping List</CardTitle>
                <CardDescription className="text-xs">
                  Total ingredients merged across {shoppingListData.scaledRecipes.length} scaled
                  recipe(s).
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="pt-6">
              <div className="divide-y divide-slate-800/60">
                {shoppingListData.shoppingList.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col justify-between py-3.5 sm:flex-row sm:items-center"
                  >
                    <div>
                      <span className="text-base font-semibold text-white">{item.displayName}</span>
                      <span className="ml-2 text-xs text-slate-500">({item.ingredientId})</span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span className="text-[11px] text-slate-400">From recipes:</span>
                        {item.sourceRecipeIds.map((rId) => {
                          const matchedRecipe = shoppingListData.scaledRecipes.find(
                            (sr) => sr.sourceRecipeId === rId
                          );
                          return (
                            <span
                              key={rId}
                              className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-300"
                            >
                              {matchedRecipe?.sourceRecipeName || rId}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-2 sm:mt-0">
                      <span className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2 font-mono text-sm font-semibold text-orange-400">
                        {formatQuantityAmount(item.quantity.amount)} {item.quantity.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Secondary View: Per-Recipe Scaled Breakdown */}
          <Card>
            <CardHeader className="flex-row items-center space-x-3 border-b border-slate-800/80 pb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Per-Recipe Scaled Breakdown</CardTitle>
                <CardDescription className="text-xs">
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
                      className="overflow-hidden rounded-xl border border-slate-800 bg-slate-800/30"
                    >
                      <button
                        type="button"
                        onClick={() => toggleRecipeExpanded(sr.sourceRecipeId)}
                        aria-expanded={isExpanded}
                        className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-800/50"
                      >
                        <div className="flex items-center space-x-3">
                          <span className="font-semibold text-white">{sr.sourceRecipeName}</span>
                          <span className="flex items-center space-x-1 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">
                            <Users className="h-3 w-3 text-orange-400" />
                            <span>
                              {sr.targetServings} servings (x{sr.scaleFactor})
                            </span>
                          </span>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="border-t border-slate-800/80 bg-slate-900/40 p-4">
                          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {sr.ingredients.map((ing, i) => (
                              <li
                                key={i}
                                className="flex items-center justify-between rounded-lg border border-slate-800/60 bg-slate-900/80 p-2.5 text-xs"
                              >
                                <span className="font-medium text-slate-200">
                                  {ing.displayName}
                                </span>
                                <span className="font-mono text-orange-400">
                                  {formatQuantityAmount(ing.quantity.amount)} {ing.quantity.unit}
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
        </div>
      )}
    </div>
  );
};
