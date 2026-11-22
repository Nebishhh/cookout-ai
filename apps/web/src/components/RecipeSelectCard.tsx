import React from 'react';
import { COURSE_ORDER, isCourse, type Course } from '@cookout-ai/domain';
import type { RecipeDto } from '../lib/api';
import { parseServingsOverride } from '../lib/eventPlanView';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';

/** The hint every course picker is described by; EventPlanner renders the text once. */
export const COURSE_HINT_ID = 'event-course-hint';

export interface RecipeSelectCardProps {
  recipe: RecipeDto;
  isSelected: boolean;
  isDisabled: boolean;
  course: Course | '';
  /** Raw text of the servings-override field; '' means no override. */
  overrideText: string;
  /** The computed share the override would replace, once planned; otherwise "Auto". */
  overridePlaceholder: string;
  onToggle: (recipeId: string) => void;
  onCourseChange: (recipeId: string, course: Course | '') => void;
  onOverrideChange: (recipeId: string, text: string) => void;
}

/**
 * One recipe in the Event Planner's selection grid: its checkbox and, once checked, its course
 * picker and servings override.
 *
 * Memoized, with only primitives and stable callbacks as props, so checking one recipe re-renders
 * that card instead of all of them. With up to 50 checked cards each carrying two form controls,
 * re-rendering every card on every click made the 50-recipe tests several times slower. The card
 * keeps one element type and key per recipe, so its checkbox node survives every re-render.
 */
export const RecipeSelectCard = React.memo(function RecipeSelectCard({
  recipe,
  isSelected,
  isDisabled,
  course,
  overrideText,
  overridePlaceholder,
  onToggle,
  onCourseChange,
  onOverrideChange,
}: RecipeSelectCardProps) {
  const checkboxId = `recipe-select-${recipe.id}`;
  const courseId = `recipe-course-${recipe.id}`;
  const overrideId = `recipe-servings-override-${recipe.id}`;
  const overrideError = isSelected ? parseServingsOverride(overrideText).error : null;

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        isSelected
          ? 'border-clay bg-clay-light/30 shadow-warm-md'
          : isDisabled
            ? 'border-stone bg-paper opacity-60'
            : 'border-stone bg-paper hover:border-stone-dark'
      }`}
    >
      <div className="flex items-start space-x-3">
        <Checkbox
          id={checkboxId}
          checked={isSelected}
          disabled={isDisabled}
          onChange={() => onToggle(recipe.id)}
          aria-label={`Select recipe ${recipe.name}`}
          className="mt-1 disabled:cursor-not-allowed"
        />
        <Label
          htmlFor={checkboxId}
          className={`text-left font-normal normal-case tracking-normal ${
            isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          <span className="font-serif text-sm font-semibold text-ink block">{recipe.name}</span>
          <span className="text-xs text-ink-muted block">Base: {recipe.baseServings} servings</span>
          {recipe.dietaryTags && recipe.dietaryTags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {recipe.dietaryTags.map((tag) => (
                <span
                  key={tag}
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-warm-sm ${
                    tag === 'Vegan' ? 'bg-olive-hover text-canvas' : 'bg-olive text-canvas'
                  }`}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </Label>
      </div>

      {/* Stacked full-width with 44px touch targets on phones, side by side from sm up. */}
      {isSelected && (
        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-stone/60 pt-3 sm:grid-cols-2">
          <div>
            <Label
              htmlFor={courseId}
              className="text-[11px] normal-case tracking-normal text-ink-muted"
            >
              Course
            </Label>
            <Select
              id={courseId}
              value={course}
              onChange={(e) => {
                const value = e.target.value;
                onCourseChange(recipe.id, isCourse(value) ? value : '');
              }}
              aria-label={`Course for ${recipe.name}`}
              aria-describedby={COURSE_HINT_ID}
              className="mt-1 h-11 rounded-lg bg-canvas px-2 text-xs sm:h-9"
            >
              <option value="">No course</option>
              {COURSE_ORDER.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label
              htmlFor={overrideId}
              className="text-[11px] normal-case tracking-normal text-ink-muted"
            >
              Servings override
            </Label>
            <Input
              id={overrideId}
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              placeholder={overridePlaceholder}
              value={overrideText}
              onChange={(e) => onOverrideChange(recipe.id, e.target.value)}
              aria-label={`Servings override for ${recipe.name}`}
              aria-invalid={overrideError ? true : undefined}
              aria-describedby={overrideError ? `${overrideId}-error` : undefined}
              className={`mt-1 h-11 rounded-lg bg-canvas px-3 text-xs sm:h-9 ${
                overrideError ? 'border-clay' : 'border-stone'
              }`}
            />
            {overrideError && (
              <p id={`${overrideId}-error`} className="mt-1 text-xs text-clay-hover">
                {overrideError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
