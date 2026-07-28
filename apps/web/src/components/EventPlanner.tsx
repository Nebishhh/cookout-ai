import React, { useState } from 'react';
import {
  Calendar,
  AlertCircle,
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';
import { useRecipes, usePlanEvent } from '../lib/queries';
import { formatQuantityAmount } from '../lib/formatQuantity';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';

/**
 * Open Questions / Scope Notes for Event Planner UI:
 * - No persistence of event plans in the UI (matches the API's on-demand-only design precedent).
 * - No holistic warning is shown if excluded recipes leave certain guest dietary groups with 0 food items,
 *   beyond the per-recipe exclusion reasons displayed in the Excluded Recipes section (future enhancement).
 */

export const EventPlanner: React.FC = () => {
  const {
    data: recipes = [],
    isLoading: loadingRecipes,
    isError: recipeIsError,
    error: recipeQueryError,
    refetch,
  } = useRecipes();

  // Form state
  const [totalGuests, setTotalGuests] = useState<number>(10);
  const [vegetarianCount, setVegetarianCount] = useState<number>(0);
  const [veganCount, setVeganCount] = useState<number>(0);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);

  const planEventMutation = usePlanEvent();

  const toggleRecipeSelection = (recipeId: string) => {
    if (selectedRecipeIds.includes(recipeId)) {
      setSelectedRecipeIds((prev) => prev.filter((id) => id !== recipeId));
    } else {
      setSelectedRecipeIds((prev) => [...prev, recipeId]);
    }
  };

  const handleTotalGuestsChange = (valueStr: string) => {
    const parsed = parseInt(valueStr, 10);
    setTotalGuests(isNaN(parsed) || parsed < 1 ? 1 : parsed);
  };

  const handleVegetarianCountChange = (valueStr: string) => {
    const parsed = parseInt(valueStr, 10);
    setVegetarianCount(isNaN(parsed) || parsed < 0 ? 0 : parsed);
  };

  const handleVeganCountChange = (valueStr: string) => {
    const parsed = parseInt(valueStr, 10);
    setVeganCount(isNaN(parsed) || parsed < 0 ? 0 : parsed);
  };

  const handlePlanEvent = (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedRecipeIds.length === 0 || totalGuests <= 0) {
      return;
    }

    planEventMutation.mutate({
      recipeIds: selectedRecipeIds,
      guestGroup: {
        totalGuests,
        vegetarianCount,
        veganCount,
      },
    });
  };

  const displayError =
    (planEventMutation.isError && planEventMutation.error
      ? planEventMutation.error.message
      : null) || (recipeIsError && recipeQueryError ? recipeQueryError.message : null);

  const eventPlanData = planEventMutation.data;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Event Planner</h2>
        <p className="mt-1 text-sm text-slate-400">
          Plan recipes and consolidated shopping lists tailored to guest counts and dietary
          restrictions.
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

      {/* Guest Group & Recipe Selection Form */}
      <form onSubmit={handlePlanEvent}>
        <Card>
          <CardHeader className="flex-row items-center justify-between border-b border-slate-800/80 pb-4">
            <div>
              <CardTitle className="text-lg">1. Guest Breakdown & Recipe Selection</CardTitle>
              <CardDescription className="text-xs">
                Specify total guests and dietary counts (vegetarians inclusive of vegans), then pick
                recipes.
              </CardDescription>
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

          <CardContent className="space-y-6 pt-6">
            {/* Guest Group Inputs */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="input-total-guests" className="text-xs text-slate-300">
                  Total Guests
                </Label>
                <Input
                  id="input-total-guests"
                  type="number"
                  min={1}
                  value={totalGuests}
                  onChange={(e) => handleTotalGuestsChange(e.target.value)}
                  className="mt-1 h-9 bg-slate-900"
                  required
                />
              </div>

              <div>
                <Label htmlFor="input-vegetarian-count" className="text-xs text-slate-300">
                  Vegetarian guests (including vegan)
                </Label>
                <Input
                  id="input-vegetarian-count"
                  type="number"
                  min={0}
                  value={vegetarianCount}
                  onChange={(e) => handleVegetarianCountChange(e.target.value)}
                  className="mt-1 h-9 bg-slate-900"
                  required
                />
              </div>

              <div>
                <Label htmlFor="input-vegan-count" className="text-xs text-slate-300">
                  Vegan guests
                </Label>
                <Input
                  id="input-vegan-count"
                  type="number"
                  min={0}
                  value={veganCount}
                  onChange={(e) => handleVeganCountChange(e.target.value)}
                  className="mt-1 h-9 bg-slate-900"
                  required
                />
              </div>
            </div>

            {/* Recipe Multi-Select Grid */}
            <div>
              <Label className="text-xs font-medium text-slate-300 block mb-3">
                Select Candidate Recipes
              </Label>

              {loadingRecipes ? (
                <div className="flex items-center justify-center py-8 text-slate-400">
                  <RefreshCw className="mr-2 h-5 w-5 animate-spin text-orange-500" />
                  <span className="text-sm font-medium">Loading recipes...</span>
                </div>
              ) : recipes.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400">
                  No recipes available. Go to the Recipes tab to create some!
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {recipes.map((recipe) => {
                    const isSelected = selectedRecipeIds.includes(recipe.id);
                    const checkboxId = `recipe-select-${recipe.id}`;

                    return (
                      <div
                        key={recipe.id}
                        className={`flex items-start justify-between rounded-xl border p-4 transition-all ${
                          isSelected
                            ? 'border-orange-500/60 bg-orange-500/10 shadow-md shadow-orange-500/10'
                            : 'border-slate-800 bg-slate-800/40 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start space-x-3">
                          <Checkbox
                            id={checkboxId}
                            checked={isSelected}
                            onChange={() => toggleRecipeSelection(recipe.id)}
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
                            {recipe.dietaryTags && recipe.dietaryTags.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {recipe.dietaryTags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-300"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </Label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="flex justify-end border-t border-slate-800/80 pt-4">
              <Button
                type="submit"
                disabled={planEventMutation.isPending || selectedRecipeIds.length === 0}
                className="space-x-2 text-black"
              >
                <Calendar className="h-4 w-4" />
                <span>
                  {planEventMutation.isPending
                    ? 'Planning Event...'
                    : `Plan Event Shopping List (${selectedRecipeIds.length} Selected)`}
                </span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Results View */}
      {eventPlanData && (
        <div className="space-y-8">
          {/* Guest Group Summary */}
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-300">
            <div className="flex items-center space-x-1.5 text-white font-semibold">
              <Users className="h-4 w-4 text-orange-400" />
              <span>Event Guest Group:</span>
            </div>
            <span className="rounded bg-slate-800 px-2 py-1 font-semibold text-slate-200">
              Total: {eventPlanData.guestGroup.totalGuests}
            </span>
            <span className="rounded bg-slate-800 px-2 py-1 font-semibold text-slate-200">
              Omnivores: {eventPlanData.guestGroup.omnivoreCount}
            </span>
            <span className="rounded bg-slate-800 px-2 py-1 font-semibold text-slate-200">
              Vegetarians: {eventPlanData.guestGroup.vegetarianCount}
            </span>
            <span className="rounded bg-slate-800 px-2 py-1 font-semibold text-slate-200">
              Vegans: {eventPlanData.guestGroup.veganCount}
            </span>
          </div>

          {/* 1. Included Recipes */}
          <Card className="border-emerald-500/20 bg-slate-900/90">
            <CardHeader className="flex-row items-center space-x-3 border-b border-slate-800/80 pb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg text-white">Included Recipes</CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Recipes with eligible guests, scaled to target guest counts.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="pt-6">
              {eventPlanData.includedRecipes.length === 0 ? (
                <div className="py-4 text-sm text-slate-400">
                  No recipes were included for this guest group.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {eventPlanData.includedRecipes.map((item) => (
                    <div
                      key={item.recipeId}
                      className="rounded-xl border border-emerald-500/20 bg-slate-950 p-4"
                    >
                      <div className="font-semibold text-white">{item.recipeName}</div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-slate-400">Eligible Servings:</span>
                        <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-400">
                          serves {item.eligibleServings} guests
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 2. Excluded Recipes (Visually Distinct Warning Treatment) */}
          {eventPlanData.excludedRecipes.length > 0 && (
            <Card className="border-amber-500/40 bg-amber-950/20 shadow-lg shadow-amber-950/20">
              <CardHeader className="flex-row items-center space-x-3 border-b border-amber-500/30 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/20 text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg text-amber-200">Excluded Recipes</CardTitle>
                  <CardDescription className="text-xs text-amber-400/80">
                    Recipes excluded due to 0 eligible guests in the selected guest breakdown.
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="pt-6">
                <div className="space-y-3">
                  {eventPlanData.excludedRecipes.map((item) => (
                    <div
                      key={item.recipeId}
                      className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs"
                    >
                      <span className="font-bold text-white text-sm block mb-1">
                        {item.recipeName}
                      </span>
                      <span className="text-amber-200/90">{item.reason}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 3. Consolidated Shopping List */}
          <Card className="border-orange-500/20 bg-slate-900/90">
            <CardHeader className="flex-row items-center space-x-3 border-b border-slate-800/80 pb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-400">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg text-white">
                  Consolidated Event Shopping List
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Total required ingredients merged across all included scaled recipes.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="pt-6">
              {eventPlanData.shoppingList.length === 0 ? (
                <div className="py-4 text-sm text-slate-400">
                  No ingredients required (all candidate recipes were excluded).
                </div>
              ) : (
                <div className="divide-y divide-slate-800/60">
                  {eventPlanData.shoppingList.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col justify-between py-3.5 sm:flex-row sm:items-center"
                    >
                      <div>
                        <span className="text-base font-semibold text-white">
                          {item.displayName}
                        </span>
                        <span className="ml-2 text-xs text-slate-500">({item.ingredientId})</span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <span className="text-[11px] text-slate-400">From recipes:</span>
                          {item.sourceRecipeIds.map((rId) => {
                            const matchedRecipe = eventPlanData.includedRecipes.find(
                              (ir) => ir.recipeId === rId
                            );
                            return (
                              <span
                                key={rId}
                                className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-300"
                              >
                                {matchedRecipe?.recipeName || rId}
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
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
