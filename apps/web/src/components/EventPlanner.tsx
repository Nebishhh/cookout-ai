import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  MAX_RECIPES_PER_EVENT,
  validateGuestGroupInput,
  type Course,
  type GuestGroupField,
} from '@cookout-ai/domain';
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
import {
  courseBalance,
  courseTotalLine,
  formatServings,
  groupIncludedByCourse,
  parseServingsOverride,
} from '../lib/eventPlanView';
import type { EventDishDto } from '../lib/api';
import { groupByCategory, GROCERY_CATEGORY_ORDER } from '../lib/groceryCategories';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { CookSchedulePanel } from './CookSchedulePanel';
import { COURSE_HINT_ID, RecipeSelectCard } from './RecipeSelectCard';

/**
 * `<input type="time">` speaks "HH:MM"; the API speaks wall-clock minutes from midnight (see
 * the Event domain object's note on why it's not a DateTime). These two bridge that boundary,
 * with '' / null both meaning "no serve time set, so no cook schedule."
 */
function timeInputToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

function minutesToTimeInput(minutes: number | null): string {
  if (minutes == null) {
    return '';
  }
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

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
  // Per-dish settings, keyed by recipe id like ShoppingListBuilder's targetServingsMap. Kept
  // when a dish is unchecked, so re-checking it brings its settings back.
  const [courseByRecipeId, setCourseByRecipeId] = useState<Record<string, Course | ''>>({});
  /** Raw text of each servings-override field; '' means no override. */
  const [overrideTextByRecipeId, setOverrideTextByRecipeId] = useState<Record<string, string>>({});
  const [guestDescription, setGuestDescription] = useState('');
  const [guestParseNotice, setGuestParseNotice] = useState<string | null>(null);
  /** "HH:MM" from <input type="time">, or '' for "no schedule requested". */
  const [serveTime, setServeTime] = useState('');

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
      // IDs of recipes deleted since the event was saved have no checkbox to uncheck, so they
      // leave the selection here; the next save then sends only recipes that still exist.
      const deletedIds = new Set(eventQuery.data.droppedRecipeIds);
      setSelectedRecipeIds(eventQuery.data.recipeIds.filter((id) => !deletedIds.has(id)));
      // An event fetched before courses existed has no `dishes`: every dish has no course.
      const dishes = eventQuery.data.dishes ?? [];
      setCourseByRecipeId(
        Object.fromEntries(dishes.map((dish) => [dish.recipeId, dish.course ?? '']))
      );
      setOverrideTextByRecipeId(
        Object.fromEntries(
          dishes.map((dish) => [
            dish.recipeId,
            dish.servingsOverride == null ? '' : String(dish.servingsOverride),
          ])
        )
      );
      setGuestDescription('');
      setGuestParseNotice(null);
      setServeTime(minutesToTimeInput(eventQuery.data.serveTimeMinutes));
    } else if (!isViewMode) {
      setName('');
      setTotalGuests(10);
      setVegetarianCount(0);
      setVeganCount(0);
      setSelectedRecipeIds([]);
      setCourseByRecipeId({});
      setOverrideTextByRecipeId({});
      setGuestDescription('');
      setGuestParseNotice(null);
      setServeTime('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventQuery.data, selectedEventId]);

  // Events saved before the cap existed can load with more than MAX_RECIPES_PER_EVENT selected;
  // unchecking always works, and the server's 400 still covers a save that's left over it.
  const atRecipeLimit = selectedRecipeIds.length >= MAX_RECIPES_PER_EVENT;
  const recipesOverLimit = selectedRecipeIds.length - MAX_RECIPES_PER_EVENT;

  // Stable callbacks (functional updates, no state in their closures) so the memoized recipe
  // cards don't all re-render when one of them changes.
  const toggleRecipeSelection = useCallback((recipeId: string) => {
    setSelectedRecipeIds((prev) => {
      if (prev.includes(recipeId)) return prev.filter((id) => id !== recipeId);
      return prev.length >= MAX_RECIPES_PER_EVENT ? prev : [...prev, recipeId];
    });
  }, []);
  const handleCourseChange = useCallback((recipeId: string, course: Course | '') => {
    setCourseByRecipeId((prev) => ({ ...prev, [recipeId]: course }));
  }, []);
  const handleOverrideChange = useCallback((recipeId: string, text: string) => {
    setOverrideTextByRecipeId((prev) => ({ ...prev, [recipeId]: text }));
  }, []);

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
  // Checked in the browser with the domain's own rules, so a bad breakdown is explained next to
  // the field it belongs to instead of coming back from the server as a raw banner.
  const guestErrors = validateGuestGroupInput(guestGroupPayload);
  const guestErrorFor = (field: GuestGroupField) =>
    guestErrors.find((e) => e.field === field)?.message;
  const serveTimeMinutes = timeInputToMinutes(serveTime);

  // Each checked dish with its course and override. A bad override is explained next to its
  // field and blocks planning and saving, the same way a bad guest breakdown does.
  const overrideFor = (recipeId: string) =>
    parseServingsOverride(overrideTextByRecipeId[recipeId] ?? '');
  const dishes: EventDishDto[] = selectedRecipeIds.map((recipeId) => ({
    recipeId,
    course: courseByRecipeId[recipeId] || null,
    servingsOverride: overrideFor(recipeId).value,
  }));
  const hasOverrideErrors = selectedRecipeIds.some((id) => overrideFor(id).error !== null);
  const hasFieldErrors = guestErrors.length !== 0 || hasOverrideErrors;

  // Shared by every plan/save/update call so the cook schedule is requested consistently.
  const planPayload = {
    dishes,
    guestGroup: guestGroupPayload,
    serveTimeMinutes,
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (hasFieldErrors) return;

    if (isViewMode && selectedEventId) {
      updateEventMutation.mutate({
        id: selectedEventId,
        data: {
          name: name.trim(),
          guestGroup: guestGroupPayload,
          dishes,
          serveTimeMinutes,
        },
      });
      return;
    }

    if (selectedRecipeIds.length === 0) return;

    planEventMutation.mutate(planPayload);
  };

  const handleSaveEvent = () => {
    if (!name.trim() || hasFieldErrors) return;

    createEventMutation.mutate(
      {
        name: name.trim(),
        guestGroup: guestGroupPayload,
        dishes,
        serveTimeMinutes,
      },
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
            planEventMutation.mutate(planPayload);
          }
        },
      }
    );
  };

  const handleResetCategory = (ingredientId: string) => {
    clearCategoryMutation.mutate(ingredientId, {
      onSuccess: () => {
        if (!isViewMode) {
          planEventMutation.mutate(planPayload);
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
  // `?? []`: a plan fetched before courses existed (still in the persisted cache) has neither.
  const planWarnings = resultData?.warnings ?? [];
  const courseGroups = resultData
    ? groupIncludedByCourse(resultData.includedRecipes, resultData.courseSummaries)
    : [];
  // Once planned, each override field's placeholder shows the computed share it would replace.
  // Memoized so the recipe cards' placeholder props only change when the plan does.
  const plannedServingsById = useMemo(
    () =>
      new Map(
        (resultData?.includedRecipes ?? [])
          .filter((item) => !item.servingsWereOverridden)
          .map((item) => [item.recipeId, formatServings(item.servings ?? item.eligibleServings)])
      ),
    [resultData]
  );

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
              {droppedRecipeIds.length} recipe{droppedRecipeIds.length === 1 ? '' : 's'} in this
              event {droppedRecipeIds.length === 1 ? 'was' : 'were'} deleted and will be removed
              when you save.
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

            {/* Serve time — drives the backward cook schedule. Optional: leave blank for none. */}
            <div>
              <Label htmlFor="input-serve-time" className="text-xs text-ink-muted">
                Serve Time (optional)
              </Label>
              <Input
                id="input-serve-time"
                type="time"
                value={serveTime}
                onChange={(e) => setServeTime(e.target.value)}
                className="mt-1 h-9 w-40 bg-canvas border-stone"
              />
              <p className="mt-1 text-xs text-ink-muted">
                Set a time and we&apos;ll work backwards to tell you when to start each dish.
              </p>
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
                  className={`mt-1 h-9 bg-canvas ${guestErrorFor('totalGuests') ? 'border-clay' : 'border-stone'}`}
                  aria-invalid={guestErrorFor('totalGuests') ? true : undefined}
                  aria-describedby={
                    guestErrorFor('totalGuests') ? 'input-total-guests-error' : undefined
                  }
                  required
                />
                {guestErrorFor('totalGuests') && (
                  <p id="input-total-guests-error" className="mt-1 text-xs text-clay-hover">
                    {guestErrorFor('totalGuests')}
                  </p>
                )}
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
                  className={`mt-1 h-9 bg-canvas ${guestErrorFor('vegetarianCount') ? 'border-clay' : 'border-stone'}`}
                  aria-invalid={guestErrorFor('vegetarianCount') ? true : undefined}
                  aria-describedby={
                    guestErrorFor('vegetarianCount') ? 'input-vegetarian-count-error' : undefined
                  }
                  required
                />
                {guestErrorFor('vegetarianCount') && (
                  <p id="input-vegetarian-count-error" className="mt-1 text-xs text-clay-hover">
                    {guestErrorFor('vegetarianCount')}
                  </p>
                )}
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
                  className={`mt-1 h-9 bg-canvas ${guestErrorFor('veganCount') ? 'border-clay' : 'border-stone'}`}
                  aria-invalid={guestErrorFor('veganCount') ? true : undefined}
                  aria-describedby={
                    guestErrorFor('veganCount') ? 'input-vegan-count-error' : undefined
                  }
                  required
                />
                {guestErrorFor('veganCount') && (
                  <p id="input-vegan-count-error" className="mt-1 text-xs text-clay-hover">
                    {guestErrorFor('veganCount')}
                  </p>
                )}
              </div>
            </div>

            {/* Recipe Multi-Select Grid */}
            <div>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <Label className="text-xs font-semibold text-ink-muted block">
                  Select Candidate Recipes
                </Label>
                <span
                  aria-live="polite"
                  className={`text-xs ${atRecipeLimit ? 'font-semibold text-clay-hover' : 'text-ink-muted'}`}
                >
                  {selectedRecipeIds.length} of {MAX_RECIPES_PER_EVENT} recipes selected
                </span>
              </div>
              {/* Each course picker points here (aria-describedby), so screen readers read the
                  hint with the picker, not only sighted users scanning the form. */}
              <p id={COURSE_HINT_ID} className="mb-3 text-xs text-ink-muted">
                Put alternatives in the same course to split servings.
              </p>
              {recipesOverLimit > 0 && (
                <p className="mb-3 text-xs font-semibold text-clay-hover">
                  An event can include at most {MAX_RECIPES_PER_EVENT} recipes. Uncheck{' '}
                  {recipesOverLimit} recipe{recipesOverLimit === 1 ? '' : 's'} before saving.
                </p>
              )}

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
                    return (
                      <RecipeSelectCard
                        key={recipe.id}
                        recipe={recipe}
                        isSelected={isSelected}
                        isDisabled={!isSelected && atRecipeLimit}
                        course={courseByRecipeId[recipe.id] ?? ''}
                        overrideText={overrideTextByRecipeId[recipe.id] ?? ''}
                        overridePlaceholder={plannedServingsById.get(recipe.id) ?? 'Auto'}
                        onToggle={toggleRecipeSelection}
                        onCourseChange={handleCourseChange}
                        onOverrideChange={handleOverrideChange}
                      />
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
                  disabled={updateEventMutation.isPending || hasFieldErrors}
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
                    disabled={
                      planEventMutation.isPending ||
                      selectedRecipeIds.length === 0 ||
                      hasFieldErrors
                    }
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
                      disabled={!canSaveEvent || createEventMutation.isPending || hasFieldErrors}
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

          {/* 0. Cook Schedule — renders only when a serve time is set (schedule is null
              otherwise). Works identically in preview and view mode, since `resultData` is the
              shared shape for both. */}
          <CookSchedulePanel schedule={resultData.schedule} />

          {/* Course shortfalls sit right above the numbers they explain, rather than with the
              page-top banners, which are out of view once the results render below the form. */}
          {planWarnings.length > 0 && (
            <Alert className="border-clay/30 bg-clay-light text-clay-hover">
              <AlertTriangle className="h-5 w-5 text-clay-hover" />
              <AlertDescription className="text-sm">
                <span className="font-semibold">Some guests have nothing to eat in a course:</span>
                <ul className="mt-1 list-disc pl-5">
                  {planWarnings.map((warning) => (
                    <li key={`${warning.course}-${warning.cohort}`}>{warning.message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

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
                <div className="space-y-6">
                  {courseGroups.map((group) => {
                    const balance = group.summary ? courseBalance(group.summary) : null;
                    return (
                      <section key={group.course ?? 'no-course'}>
                        {/* A plan with no courses at all keeps the plain grid it always had. */}
                        {(group.course !== null || courseGroups.length > 1) && (
                          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <h4 className="font-serif text-sm font-semibold text-ink">
                              {group.summary
                                ? courseTotalLine(group.summary)
                                : (group.course ?? 'No course')}
                            </h4>
                            {balance && (
                              <span className="text-xs font-semibold text-clay-hover">
                                {balance.label}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {group.dishes.map((item) => {
                            const servings = item.servings ?? item.eligibleServings;
                            return (
                              <article
                                key={item.recipeId}
                                aria-label={item.recipeName}
                                className="rounded-xl border border-olive/30 bg-canvas p-4"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="font-serif font-semibold text-ink">
                                    {item.recipeName}
                                  </div>
                                  {item.servingsWereOverridden && (
                                    <span className="rounded-full border border-clay/40 bg-clay-light px-2 py-0.5 text-[10px] font-semibold text-clay-hover">
                                      Your override
                                    </span>
                                  )}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span className="text-ink-muted">
                                    {item.eligibleServings}{' '}
                                    {item.eligibleServings === 1 ? 'guest' : 'guests'} can eat it
                                  </span>
                                  <span className="rounded-md border border-olive/30 bg-olive-light px-2.5 py-1 font-semibold text-olive">
                                    Cook {formatServings(servings)}{' '}
                                    {servings === 1 ? 'serving' : 'servings'}
                                  </span>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
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
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
};
