import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar,
  AlertCircle,
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShoppingBag,
  Save,
  Trash2,
  PlusCircle,
  Loader2,
  Eye,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  useRecipes,
  usePlanEvent,
  useEvent,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  useSaveEventShoppingList,
  useSetIngredientCategory,
  useClearIngredientCategory,
  useParseEventDescription,
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

export interface EventPlannerProps {
  selectedEventId?: string | null;
  onSaved?: (id: string) => void;
  onCloseDetail?: () => void;
  onViewShoppingList?: (id: string) => void;
}

export const EventPlanner: React.FC<EventPlannerProps> = ({
  selectedEventId = null,
  onSaved,
  onCloseDetail,
  onViewShoppingList,
}) => {
  const isViewMode = selectedEventId != null;

  const {
    data: recipes = [],
    isLoading: loadingRecipes,
    isError: recipeIsError,
    error: recipeQueryError,
    refetch,
  } = useRecipes();

  // Form state
  const [name, setName] = useState('');
  const [totalGuests, setTotalGuests] = useState<number>(10);
  const [vegetarianCount, setVegetarianCount] = useState<number>(0);
  const [veganCount, setVeganCount] = useState<number>(0);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);
  const [guestDescription, setGuestDescription] = useState('');
  const [guestParseNotice, setGuestParseNotice] = useState<string | null>(null);

  const planEventMutation = usePlanEvent();
  const eventQuery = useEvent(selectedEventId);
  const createEventMutation = useCreateEvent();
  const updateEventMutation = useUpdateEvent();
  const deleteEventMutation = useDeleteEvent();
  const saveShoppingListMutation = useSaveEventShoppingList();
  const setCategoryMutation = useSetIngredientCategory();
  const clearCategoryMutation = useClearIngredientCategory();
  const parseEventDescriptionMutation = useParseEventDescription();

  // Pre-fill the form from the saved event whenever the selected event changes / refetches.
  useEffect(() => {
    if (eventQuery.data) {
      setName(eventQuery.data.name);
      setTotalGuests(eventQuery.data.guestGroup.totalGuests);
      setVegetarianCount(eventQuery.data.guestGroup.vegetarianCount);
      setVeganCount(eventQuery.data.guestGroup.veganCount);
      setSelectedRecipeIds(eventQuery.data.recipeIds);
      setGuestDescription('');
      setGuestParseNotice(null);
    } else if (!isViewMode) {
      setName('');
      setTotalGuests(10);
      setVegetarianCount(0);
      setVeganCount(0);
      setSelectedRecipeIds([]);
      setGuestDescription('');
      setGuestParseNotice(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventQuery.data, selectedEventId]);

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

  const handleParseGuestDescription = () => {
    setGuestParseNotice(null);
    if (!guestDescription.trim()) return;

    parseEventDescriptionMutation.mutate(guestDescription, {
      onSuccess: (result) => {
        setTotalGuests(result.totalGuests);
        setVegetarianCount(result.vegetarianCount);
        setVeganCount(result.veganCount);
        setGuestParseNotice(
          result.source === 'ai'
            ? 'Filled in from AI parsing — please review the numbers below before submitting.'
            : 'Filled in below — please review before submitting.'
        );
      },
    });
  };

  const guestGroupPayload = { totalGuests, vegetarianCount, veganCount };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (totalGuests <= 0) return;

    if (isViewMode && selectedEventId) {
      updateEventMutation.mutate({
        id: selectedEventId,
        data: { name: name.trim(), guestGroup: guestGroupPayload, recipeIds: selectedRecipeIds },
      });
      return;
    }

    if (selectedRecipeIds.length === 0) return;

    planEventMutation.mutate({
      recipeIds: selectedRecipeIds,
      guestGroup: guestGroupPayload,
    });
  };

  const handleSaveEvent = () => {
    if (!name.trim()) return;

    createEventMutation.mutate(
      { name: name.trim(), guestGroup: guestGroupPayload, recipeIds: selectedRecipeIds },
      {
        onSuccess: (created) => {
          if (onSaved) onSaved(created.id);
        },
      }
    );
  };

  const handleDeleteEvent = () => {
    if (!selectedEventId) return;
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;

    deleteEventMutation.mutate(selectedEventId, {
      onSuccess: () => {
        if (onCloseDetail) onCloseDetail();
      },
    });
  };

  const handleStartNewEvent = () => {
    if (onCloseDetail) onCloseDetail();
  };

  const handleSaveShoppingList = () => {
    if (!selectedEventId) return;
    saveShoppingListMutation.mutate({ eventId: selectedEventId });
  };

  const handleViewShoppingList = () => {
    const shoppingListId = eventQuery.data?.shoppingListId;
    if (shoppingListId && onViewShoppingList) onViewShoppingList(shoppingListId);
  };

  // In view mode, useSetIngredientCategory/useClearIngredientCategory already invalidate
  // ['events'], which refetches useEvent(selectedEventId) automatically. Preview mode's
  // result is a mutation result (planEventMutation.data), not a cached query, so nothing
  // refetches it on its own — re-running the plan with the same inputs is what makes the
  // override visible in the still-open preview.
  const handleRecategorize = (ingredientId: string, category: string) => {
    setCategoryMutation.mutate(
      { ingredientId, category },
      {
        onSuccess: () => {
          if (!isViewMode) {
            planEventMutation.mutate({
              recipeIds: selectedRecipeIds,
              guestGroup: guestGroupPayload,
            });
          }
        },
      }
    );
  };

  const handleResetCategory = (ingredientId: string) => {
    clearCategoryMutation.mutate(ingredientId, {
      onSuccess: () => {
        if (!isViewMode) {
          planEventMutation.mutate({ recipeIds: selectedRecipeIds, guestGroup: guestGroupPayload });
        }
      },
    });
  };

  const displayError =
    (planEventMutation.isError && planEventMutation.error
      ? planEventMutation.error.message
      : null) ||
    (createEventMutation.isError && createEventMutation.error
      ? createEventMutation.error.message
      : null) ||
    (updateEventMutation.isError && updateEventMutation.error
      ? updateEventMutation.error.message
      : null) ||
    (deleteEventMutation.isError && deleteEventMutation.error
      ? deleteEventMutation.error.message
      : null) ||
    (saveShoppingListMutation.isError && saveShoppingListMutation.error
      ? saveShoppingListMutation.error.message
      : null) ||
    (eventQuery.isError && eventQuery.error ? eventQuery.error.message : null) ||
    (recipeIsError && recipeQueryError ? recipeQueryError.message : null) ||
    (parseEventDescriptionMutation.isError && parseEventDescriptionMutation.error
      ? parseEventDescriptionMutation.error.message
      : null);

  // In view mode the recomputed-live event detail drives the results; in create mode,
  // the ephemeral preview mutation drives it. Both expose the same guestGroup /
  // includedRecipes / excludedRecipes / shoppingList shape.
  const resultData = isViewMode ? eventQuery.data : planEventMutation.data;
  const droppedRecipeIds = isViewMode ? (eventQuery.data?.droppedRecipeIds ?? []) : [];

  const canSaveEvent = !isViewMode && Boolean(planEventMutation.data) && name.trim().length > 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl font-bold tracking-tight text-ink">
            {isViewMode ? `Editing: ${eventQuery.data?.name ?? '...'}` : 'Event Planner'}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {isViewMode
              ? 'Update the guest breakdown or menu — the plan below always reflects your recipes as they are today.'
              : 'Plan recipes and consolidated shopping lists tailored to guest counts and dietary restrictions.'}
          </p>
        </div>
        {isViewMode && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleStartNewEvent}
            className="space-x-1.5 border-stone text-ink"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>Plan New Event</span>
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

      {droppedRecipeIds.length > 0 && (
        <Alert className="border-clay/30 bg-clay-light text-clay-hover">
          <AlertTriangle className="h-5 w-5 text-clay-hover" />
          <AlertDescription className="text-sm">
            <span className="font-semibold">
              {droppedRecipeIds.length} recipe{droppedRecipeIds.length === 1 ? '' : 's'} from this
              event's original plan no longer exist{droppedRecipeIds.length === 1 ? 's' : ''} and{' '}
              {droppedRecipeIds.length === 1 ? 'was' : 'were'} skipped.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Guest Group & Recipe Selection Form */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader className="flex-row items-center justify-between border-b border-stone pb-4">
            <div>
              <CardTitle className="font-serif text-lg font-bold text-ink">
                1. Event Name, Guest Breakdown & Recipe Selection
              </CardTitle>
              <CardDescription className="text-xs text-ink-muted">
                Specify total guests and dietary counts (vegetarians inclusive of vegans), then pick
                recipes.
              </CardDescription>
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
              <Label htmlFor="input-event-name" className="text-xs text-ink-muted">
                Event Name
              </Label>
              <Input
                id="input-event-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Thanksgiving 2026"
                className="mt-1 h-9 bg-canvas border-stone"
              />
            </div>

            {/* Natural-Language Guest-Breakdown Quick Fill */}
            <div className="rounded-xl border border-clay/30 bg-clay-light/30 p-3">
              <Label
                htmlFor="input-guest-description"
                className="flex items-center space-x-1.5 text-xs font-semibold text-clay-hover"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Quick Fill: Describe Your Guest List</span>
              </Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  id="input-guest-description"
                  type="text"
                  value={guestDescription}
                  onChange={(e) => setGuestDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleParseGuestDescription();
                    }
                  }}
                  placeholder='e.g. "dinner for 12, 3 vegetarian, 1 vegan"'
                  className="h-9 flex-1 bg-canvas border-stone"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleParseGuestDescription}
                  disabled={parseEventDescriptionMutation.isPending || !guestDescription.trim()}
                  className="space-x-1.5 bg-olive text-white hover:bg-olive-hover disabled:opacity-50"
                >
                  {parseEventDescriptionMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  <span>{parseEventDescriptionMutation.isPending ? 'Parsing...' : 'Fill In'}</span>
                </Button>
              </div>
              {guestParseNotice && (
                <p className="mt-1.5 text-xs text-clay-hover">{guestParseNotice}</p>
              )}
            </div>

            {/* Guest Group Inputs */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="input-total-guests" className="text-xs text-ink-muted">
                  Total Guests
                </Label>
                <Input
                  id="input-total-guests"
                  type="number"
                  min={1}
                  value={totalGuests}
                  onChange={(e) => handleTotalGuestsChange(e.target.value)}
                  className="mt-1 h-9 bg-canvas border-stone"
                  required
                />
              </div>

              <div>
                <Label htmlFor="input-vegetarian-count" className="text-xs text-ink-muted">
                  Vegetarian guests (including vegan)
                </Label>
                <Input
                  id="input-vegetarian-count"
                  type="number"
                  min={0}
                  value={vegetarianCount}
                  onChange={(e) => handleVegetarianCountChange(e.target.value)}
                  className="mt-1 h-9 bg-canvas border-stone"
                  required
                />
              </div>

              <div>
                <Label htmlFor="input-vegan-count" className="text-xs text-ink-muted">
                  Vegan guests
                </Label>
                <Input
                  id="input-vegan-count"
                  type="number"
                  min={0}
                  value={veganCount}
                  onChange={(e) => handleVeganCountChange(e.target.value)}
                  className="mt-1 h-9 bg-canvas border-stone"
                  required
                />
              </div>
            </div>

            {/* Recipe Multi-Select Grid */}
            <div>
              <Label className="text-xs font-semibold text-ink-muted block mb-3">
                Select Candidate Recipes
              </Label>

              {loadingRecipes ? (
                <div className="flex items-center justify-center py-8 text-ink-muted">
                  <RefreshCw className="mr-2 h-5 w-5 animate-spin text-clay" />
                  <span className="text-sm font-medium">Loading recipes...</span>
                </div>
              ) : recipes.length === 0 ? (
                <div className="py-8 text-center text-sm text-ink-muted">
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
                            ? 'border-clay bg-clay-light/30 shadow-warm-md'
                            : 'border-stone bg-paper hover:border-stone-dark'
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
                            <span className="font-serif text-sm font-semibold text-ink block">
                              {recipe.name}
                            </span>
                            <span className="text-xs text-ink-muted block">
                              Base: {recipe.baseServings} servings
                            </span>
                            {recipe.dietaryTags && recipe.dietaryTags.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {recipe.dietaryTags.map((tag) => (
                                  <span
                                    key={tag}
                                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-warm-sm ${
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
                          </Label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Submit / Save / Delete Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-stone pt-4">
              {isViewMode && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteEvent}
                  disabled={deleteEventMutation.isPending}
                  className="space-x-2"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>{deleteEventMutation.isPending ? 'Deleting...' : 'Delete Event'}</span>
                </Button>
              )}

              {isViewMode && eventQuery.data?.shoppingListId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleViewShoppingList}
                  className="space-x-2 border-stone text-ink"
                >
                  <Eye className="h-4 w-4" />
                  <span>View Shopping List</span>
                </Button>
              )}

              {isViewMode && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleSaveShoppingList}
                  disabled={saveShoppingListMutation.isPending}
                  className="space-x-2 bg-olive text-white hover:bg-olive-hover disabled:opacity-50"
                >
                  {saveShoppingListMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShoppingBag className="h-4 w-4" />
                  )}
                  <span>
                    {saveShoppingListMutation.isPending
                      ? 'Saving...'
                      : eventQuery.data?.shoppingListId
                        ? 'Regenerate Shopping List'
                        : 'Save Shopping List'}
                  </span>
                </Button>
              )}

              {isViewMode ? (
                <Button
                  type="submit"
                  disabled={updateEventMutation.isPending}
                  className="space-x-2 bg-clay text-white hover:bg-clay-hover disabled:opacity-50"
                >
                  {updateEventMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>{updateEventMutation.isPending ? 'Updating...' : 'Update Event'}</span>
                </Button>
              ) : (
                <>
                  <Button
                    type="submit"
                    disabled={planEventMutation.isPending || selectedRecipeIds.length === 0}
                    className="space-x-2 bg-clay text-white hover:bg-clay-hover disabled:opacity-50"
                  >
                    <Calendar className="h-4 w-4" />
                    <span>
                      {planEventMutation.isPending
                        ? 'Planning Event...'
                        : `Plan Event Shopping List (${selectedRecipeIds.length} Selected)`}
                    </span>
                  </Button>
                  {planEventMutation.data && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleSaveEvent}
                      disabled={!canSaveEvent || createEventMutation.isPending}
                      className="space-x-2 bg-olive text-white hover:bg-olive-hover disabled:opacity-50"
                    >
                      {createEventMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      <span>{createEventMutation.isPending ? 'Saving...' : 'Save Event'}</span>
                    </Button>
                  )}
                </>
              )}
            </div>
            {!isViewMode && planEventMutation.data && !name.trim() && (
              <p className="text-right text-xs text-clay-hover">
                Add an event name above to save this plan.
              </p>
            )}
          </CardContent>
        </Card>
      </form>

      {/* Results View */}
      {resultData && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-8"
        >
          {/* Guest Group Summary */}
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-stone bg-paper p-4 text-xs text-ink-muted">
            <div className="flex items-center space-x-1.5 text-ink font-semibold">
              <Users className="h-4 w-4 text-clay-hover" />
              <span>Event Guest Group:</span>
            </div>
            <span className="rounded bg-canvas border border-stone/60 px-2 py-1 font-semibold text-ink">
              Total: {resultData.guestGroup.totalGuests}
            </span>
            <span className="rounded bg-canvas border border-stone/60 px-2 py-1 font-semibold text-ink">
              Omnivores: {resultData.guestGroup.omnivoreCount}
            </span>
            <span className="rounded bg-canvas border border-stone/60 px-2 py-1 font-semibold text-ink">
              Vegetarians: {resultData.guestGroup.vegetarianCount}
            </span>
            <span className="rounded bg-canvas border border-stone/60 px-2 py-1 font-semibold text-ink">
              Vegans: {resultData.guestGroup.veganCount}
            </span>
          </div>

          {/* 1. Included Recipes */}
          <Card className="border-olive/30 bg-paper">
            <CardHeader className="flex-row items-center space-x-3 border-b border-stone pb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-olive/30 bg-olive-light text-olive">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="font-serif text-lg text-ink">Included Recipes</CardTitle>
                <CardDescription className="text-xs text-ink-muted">
                  Recipes with eligible guests, scaled to target guest counts.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="pt-6">
              {resultData.includedRecipes.length === 0 ? (
                <div className="py-4 text-sm text-ink-muted">
                  No recipes were included for this guest group.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {resultData.includedRecipes.map((item) => (
                    <div
                      key={item.recipeId}
                      className="rounded-xl border border-olive/30 bg-canvas p-4"
                    >
                      <div className="font-serif font-semibold text-ink">{item.recipeName}</div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-ink-muted">Eligible Servings:</span>
                        <span className="rounded-md border border-olive/30 bg-olive-light px-2.5 py-1 font-semibold text-olive">
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
          {resultData.excludedRecipes.length > 0 && (
            <Card className="border-clay/40 bg-clay-light/40 shadow-warm-sm">
              <CardHeader className="flex-row items-center space-x-3 border-b border-clay/30 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-clay/40 bg-clay-light text-clay-hover">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="font-serif text-lg text-clay-hover">
                    Excluded Recipes
                  </CardTitle>
                  <CardDescription className="text-xs text-ink-muted">
                    Recipes excluded due to 0 eligible guests in the selected guest breakdown.
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="pt-6">
                <div className="space-y-3">
                  {resultData.excludedRecipes.map((item) => (
                    <div
                      key={item.recipeId}
                      className="rounded-xl border border-clay/30 bg-paper p-4 text-xs"
                    >
                      <span className="font-serif font-bold text-ink text-sm block mb-1">
                        {item.recipeName}
                      </span>
                      <span className="text-clay-hover font-medium">{item.reason}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 3. Consolidated Shopping List */}
          <Card className="border-stone bg-paper">
            <CardHeader className="flex-row items-center space-x-3 border-b border-stone pb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-clay/30 bg-clay-light text-clay">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="font-serif text-lg text-ink">
                  Consolidated Event Shopping List
                </CardTitle>
                <CardDescription className="text-xs text-ink-muted">
                  Total required ingredients merged across all included scaled recipes.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="pt-6">
              {resultData.shoppingList.length === 0 ? (
                <div className="py-4 text-sm text-ink-muted">
                  No ingredients required (all candidate recipes were excluded).
                </div>
              ) : (
                <div className="space-y-6">
                  {groupByCategory(resultData.shoppingList).map((group) => (
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
                                  const matchedRecipe = resultData.includedRecipes.find(
                                    (ir) => ir.recipeId === rId
                                  );
                                  return (
                                    <span
                                      key={rId}
                                      className="rounded bg-canvas border border-stone/60 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted"
                                    >
                                      {matchedRecipe?.recipeName || rId}
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
                              <span className="rounded-xl border border-clay/30 bg-clay-light px-4 py-2 font-mono text-sm font-semibold text-clay-hover">
                                {formatQuantityAmount(
                                  item.quantity.amount,
                                  item.quantity.unit,
                                  item.quantity.category,
                                  'consolidated'
                                )}{' '}
                                {item.quantity.unit}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
};
