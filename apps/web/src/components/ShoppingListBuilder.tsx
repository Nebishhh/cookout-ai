import React, { useState, useEffect } from 'react';
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
import { api, type RecipeDto, type ShoppingListResponseDto } from '../lib/api';

export const ShoppingListBuilder: React.FC = () => {
  const [recipes, setRecipes] = useState<RecipeDto[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState<boolean>(true);
  const [recipeError, setRecipeError] = useState<string | null>(null);

  // Selected recipe IDs and target servings map: { [recipeId]: number }
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);
  const [targetServingsMap, setTargetServingsMap] = useState<Record<string, number>>({});

  const [building, setBuilding] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [shoppingListData, setShoppingListData] = useState<ShoppingListResponseDto | null>(null);

  const [expandedRecipes, setExpandedRecipes] = useState<Record<string, boolean>>({});

  const loadRecipes = async () => {
    setLoadingRecipes(true);
    setRecipeError(null);
    try {
      const data = await api.getRecipes();
      setRecipes(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setRecipeError(err.message);
      } else {
        setRecipeError('Failed to load recipes for shopping list.');
      }
    } finally {
      setLoadingRecipes(false);
    }
  };

  useEffect(() => {
    loadRecipes();
  }, []);

  const toggleRecipeSelection = (recipe: RecipeDto) => {
    if (selectedRecipeIds.includes(recipe.id)) {
      setSelectedRecipeIds((prev) => prev.filter((id) => id !== recipe.id));
    } else {
      setSelectedRecipeIds((prev) => [...prev, recipe.id]);
      setTargetServingsMap((prev) => ({
        ...prev,
        [recipe.id]: recipe.baseServings,
      }));
    }
  };

  const handleServingsChange = (recipeId: string, servings: number) => {
    setTargetServingsMap((prev) => ({
      ...prev,
      [recipeId]: servings,
    }));
  };

  const handleBuildShoppingList = async () => {
    setApiError(null);
    setShoppingListData(null);

    if (selectedRecipeIds.length === 0) {
      setApiError('Please select at least one recipe to build a shopping list.');
      return;
    }

    const payload = selectedRecipeIds.map((id) => ({
      recipeId: id,
      targetServings: Number(targetServingsMap[id] ?? 1),
    }));

    setBuilding(true);

    try {
      const result = await api.buildShoppingList(payload);
      setShoppingListData(result);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiError(err.message);
      } else {
        setApiError('Failed to generate shopping list.');
      }
    } finally {
      setBuilding(false);
    }
  };

  const toggleRecipeExpanded = (recipeId: string) => {
    setExpandedRecipes((prev) => ({
      ...prev,
      [recipeId]: !prev[recipeId],
    }));
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Shopping List Builder</h2>
        <p className="mt-1 text-sm text-slate-400">
          Select recipes, set target serving counts, and get a consolidated ingredient shopping
          list.
        </p>
      </div>

      {apiError && (
        <div
          role="alert"
          className="flex items-start space-x-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-400 shadow-lg"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-400" />
          <div className="text-sm">
            <span className="font-semibold">Error: </span>
            {apiError}
          </div>
        </div>
      )}

      {/* Recipe Picker Section */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 backdrop-blur-md shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <h3 className="text-lg font-semibold text-white">1. Select Recipes & Target Servings</h3>
          <button
            type="button"
            onClick={loadRecipes}
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingRecipes ? 'animate-spin' : ''}`} />
            <span>Reload Recipes</span>
          </button>
        </div>

        {loadingRecipes ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <RefreshCw className="h-5 w-5 animate-spin text-orange-500 mr-2" />
            <span className="text-sm font-medium">Loading recipe options...</span>
          </div>
        ) : recipeError ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {recipeError}
          </div>
        ) : recipes.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            No recipes available yet. Go to the Recipes tab to create some!
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recipes.map((recipe) => {
                const isSelected = selectedRecipeIds.includes(recipe.id);
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
                        <label className="flex cursor-pointer items-start space-x-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRecipeSelection(recipe)}
                            className="mt-1 h-4 w-4 rounded border-slate-700 text-orange-500 focus:ring-orange-500"
                          />
                          <div>
                            <span className="text-sm font-semibold text-white">{recipe.name}</span>
                            <span className="block text-xs text-slate-400">
                              Base: {recipe.baseServings} servings
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="mt-4 border-t border-slate-800/80 pt-3">
                        <label
                          htmlFor={`target-servings-${recipe.id}`}
                          className="block text-[11px] font-medium text-slate-300"
                        >
                          Target Servings
                        </label>
                        <input
                          id={`target-servings-${recipe.id}`}
                          type="number"
                          min={1}
                          value={targetServingsMap[recipe.id] ?? recipe.baseServings}
                          onChange={(e) => handleServingsChange(recipe.id, Number(e.target.value))}
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-orange-500 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end border-t border-slate-800/80 pt-4">
              <button
                type="button"
                onClick={handleBuildShoppingList}
                disabled={building || selectedRecipeIds.length === 0}
                className="flex items-center space-x-2 rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-semibold text-black shadow-sm hover:bg-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50"
              >
                <ShoppingBag className="h-4 w-4" />
                <span>
                  {building
                    ? 'Building List...'
                    : `Build Shopping List (${selectedRecipeIds.length} Selected)`}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Shopping List Results */}
      {shoppingListData && (
        <div className="space-y-8">
          {/* Primary View: Consolidated Shopping List */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 backdrop-blur-md shadow-xl">
            <div className="flex items-center space-x-3 border-b border-slate-800/80 pb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/20 text-orange-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Consolidated Shopping List</h3>
                <p className="text-xs text-slate-400">
                  Total ingredients merged across {shoppingListData.scaledRecipes.length} scaled
                  recipe(s).
                </p>
              </div>
            </div>

            <div className="mt-6 divide-y divide-slate-800/60">
              {shoppingListData.shoppingList.map((item, idx) => (
                <div
                  key={idx}
                  className="flex flex-col justify-between py-3.5 sm:flex-row sm:items-center"
                >
                  <div>
                    <span className="text-base font-semibold text-white">{item.displayName}</span>
                    <span className="ml-2 font-mono text-xs text-slate-500">
                      ({item.ingredientId})
                    </span>
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
                      {item.quantity.amount} {item.quantity.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Secondary View: Per-Recipe Scaled Breakdown */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 backdrop-blur-md shadow-xl">
            <div className="flex items-center space-x-3 border-b border-slate-800/80 pb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Per-Recipe Scaled Breakdown</h3>
                <p className="text-xs text-slate-400">
                  Individual scaled ingredient quantities for each recipe.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {shoppingListData.scaledRecipes.map((sr) => {
                const isExpanded = expandedRecipes[sr.sourceRecipeId] ?? true;
                return (
                  <div
                    key={sr.sourceRecipeId}
                    className="rounded-xl border border-slate-800 bg-slate-800/30 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleRecipeExpanded(sr.sourceRecipeId)}
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
                      <div className="border-t border-slate-800/80 p-4 bg-slate-900/40">
                        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {sr.ingredients.map((ing, i) => (
                            <li
                              key={i}
                              className="flex items-center justify-between rounded-lg border border-slate-800/60 bg-slate-900/80 p-2.5 text-xs"
                            >
                              <span className="font-medium text-slate-200">{ing.displayName}</span>
                              <span className="font-mono text-orange-400">
                                {ing.quantity.amount} {ing.quantity.unit}
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
          </div>
        </div>
      )}
    </div>
  );
};
