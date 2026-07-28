import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  X,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import type { IngredientInput, RecipeDto } from '../lib/api';
import { useCreateRecipe, useUpdateRecipe, useImportRecipeText } from '../lib/queries';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Select } from './ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';

const SUPPORTED_UNITS_BY_CATEGORY = [
  { category: 'Mass', units: ['g', 'kg', 'oz', 'lb'] },
  { category: 'Volume', units: ['ml', 'l', 'tsp', 'tbsp', 'cup', 'fl oz'] },
  { category: 'Count', units: ['count', 'clove', 'egg', 'onion'] },
];

export interface RecipeFormProps {
  recipe?: RecipeDto;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const RecipeForm: React.FC<RecipeFormProps> = ({ recipe, onSuccess, onCancel }) => {
  const isEditing = Boolean(recipe);

  const [name, setName] = useState(recipe?.name || '');
  const [baseServings, setBaseServings] = useState<number>(recipe?.baseServings || 4);
  const [dietaryTags, setDietaryTags] = useState<string[]>(recipe?.dietaryTags || []);
  const [ingredients, setIngredients] = useState<IngredientInput[]>(
    recipe?.ingredients.map((ing) => ({
      ingredientId: ing.ingredientId,
      displayName: ing.displayName,
      amount: ing.amount,
      unit: ing.unit,
    })) || [{ ingredientId: '', displayName: '', amount: 1, unit: 'g' }]
  );

  const [importText, setImportText] = useState('');
  const [showImportSection, setShowImportSection] = useState(false);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const createRecipeMutation = useCreateRecipe();
  const updateRecipeMutation = useUpdateRecipe();
  const importRecipeTextMutation = useImportRecipeText();

  useEffect(() => {
    if (recipe) {
      setName(recipe.name);
      setBaseServings(recipe.baseServings);
      setDietaryTags(recipe.dietaryTags || []);
      setIngredients(
        recipe.ingredients.map((ing) => ({
          ingredientId: ing.ingredientId,
          displayName: ing.displayName,
          amount: ing.amount,
          unit: ing.unit,
        }))
      );
    } else {
      setName('');
      setBaseServings(4);
      setDietaryTags([]);
      setIngredients([{ ingredientId: '', displayName: '', amount: 1, unit: 'g' }]);
    }
    setValidationError(null);
    setSuccessMessage(null);
    setReviewNotice(null);
    setImportText('');
  }, [recipe]);

  const handleTagToggle = (tag: string) => {
    setDietaryTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleAddIngredient = () => {
    setIngredients((prev) => [
      ...prev,
      { ingredientId: '', displayName: '', amount: 1, unit: 'g' },
    ]);
  };

  const handleRemoveIngredient = (index: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const handleIngredientChange = (
    index: number,
    field: keyof IngredientInput,
    value: string | number
  ) => {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === index ? { ...ing, [field]: value } : ing))
    );
  };

  const handleImportText = () => {
    setValidationError(null);
    setSuccessMessage(null);
    setReviewNotice(null);

    if (!importText.trim()) {
      setValidationError('Please paste recipe text to import.');
      return;
    }

    importRecipeTextMutation.mutate(importText.trim(), {
      onSuccess: (draft) => {
        setName(draft.name);
        setBaseServings(draft.baseServings);
        setDietaryTags(draft.dietaryTags || []);
        setIngredients(
          draft.ingredients.map((ing) => ({
            ingredientId: ing.ingredientId,
            displayName: ing.displayName,
            amount: ing.amount,
            unit: ing.unit,
          }))
        );
        setImportText('');
        setReviewNotice(
          'Imported via AI — please review all fields, especially dietary tags and ingredient amounts, before saving.'
        );
      },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setSuccessMessage(null);

    if (!name.trim()) {
      setValidationError('Recipe name is required.');
      return;
    }

    if (ingredients.length === 0) {
      setValidationError('At least one ingredient line is required.');
      return;
    }

    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      if (!ing.ingredientId.trim() || !ing.displayName.trim()) {
        setValidationError(`Ingredient row #${i + 1} requires an Ingredient ID and Display Name.`);
        return;
      }
    }

    const payload = {
      name: name.trim(),
      baseServings: Number(baseServings),
      dietaryTags,
      ingredients: ingredients.map((ing) => ({
        ingredientId: ing.ingredientId.trim(),
        displayName: ing.displayName.trim(),
        amount: Number(ing.amount),
        unit: ing.unit,
      })),
    };

    if (isEditing && recipe) {
      updateRecipeMutation.mutate(
        { id: recipe.id, data: payload },
        {
          onSuccess: (updatedRecipe) => {
            setSuccessMessage(`Recipe "${updatedRecipe.name}" updated successfully!`);
            if (onSuccess) onSuccess();
          },
        }
      );
    } else {
      createRecipeMutation.mutate(payload, {
        onSuccess: (newRecipe) => {
          setSuccessMessage(`Recipe "${newRecipe.name}" created successfully!`);
          setName('');
          setBaseServings(4);
          setDietaryTags([]);
          setIngredients([{ ingredientId: '', displayName: '', amount: 1, unit: 'g' }]);
          setReviewNotice(null);
          if (onSuccess) onSuccess();
        },
      });
    }
  };

  const isPending = createRecipeMutation.isPending || updateRecipeMutation.isPending;
  const displayError =
    validationError ||
    (createRecipeMutation.error ? createRecipeMutation.error.message : null) ||
    (updateRecipeMutation.error ? updateRecipeMutation.error.message : null) ||
    (importRecipeTextMutation.error ? importRecipeTextMutation.error.message : null);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>{isEditing ? `Edit Recipe: ${recipe?.name}` : 'Create New Recipe'}</CardTitle>
          <CardDescription>
            {isEditing
              ? 'Update ingredient quantities, base servings, or dietary tags for this recipe.'
              : 'Add a new recipe to your collection with ingredients and serving size.'}
          </CardDescription>
        </div>

        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="space-x-1.5 text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
            <span>Cancel</span>
          </Button>
        )}
      </CardHeader>

      <CardContent>
        {/*
          Open Questions / Scope Notes for AI Text Import:
          - No undo/re-import feature — if a user dislikes the parsed output, they edit manually or re-paste.
          - No per-field AI provenance badges — the general review notice alerts users to double-check inferred tags/amounts.
          - URL and Image imports remain out of scope for this milestone.
        */}
        {!isEditing && (
          <div className="mb-6 rounded-2xl border border-amber-500/20 bg-slate-800/40 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-amber-300">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-semibold">Import Recipe with AI</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowImportSection((prev) => !prev)}
                className="space-x-1 text-xs text-amber-300 hover:bg-slate-800 hover:text-white"
              >
                <span>{showImportSection ? 'Hide Text Area' : 'Paste Recipe Text'}</span>
                {showImportSection ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>

            {showImportSection && (
              <div className="mt-3 space-y-3">
                <Label htmlFor="import-text-input" className="text-xs text-slate-300">
                  Paste unformatted recipe text below (ingredients, servings, instructions)
                </Label>
                <textarea
                  id="import-text-input"
                  rows={4}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="e.g. Grandma's Pancakes&#10;Serves 4&#10;- 2 cups flour&#10;- 2 eggs&#10;- 300 ml milk"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/90 p-3 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={handleImportText}
                    disabled={importRecipeTextMutation.isPending || !importText.trim()}
                    className="space-x-2 bg-amber-500 px-4 text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
                  >
                    {importRecipeTextMutation.isPending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-black" />
                        <span>Importing with AI...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5 text-black" />
                        <span>Import with AI</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {displayError && (
          <Alert className="mb-6 border-red-500/30 bg-red-500/10 text-red-400">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <AlertDescription className="text-sm">
              <span className="font-semibold">Error: </span>
              {displayError}
            </AlertDescription>
          </Alert>
        )}

        {reviewNotice && (
          <Alert className="mb-6 border-amber-500/30 bg-amber-500/10 text-amber-300">
            <Info className="h-5 w-5 text-amber-400" />
            <AlertDescription className="flex items-center justify-between text-sm font-medium">
              <span>{reviewNotice}</span>
              <button
                type="button"
                onClick={() => setReviewNotice(null)}
                className="ml-2 text-amber-400 hover:text-white"
                aria-label="Dismiss review notice"
              >
                <X className="h-4 w-4" />
              </button>
            </AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert className="mb-6 border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <AlertDescription className="text-sm font-medium">{successMessage}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor="recipe-name">Recipe Name</Label>
              <Input
                id="recipe-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Fluffy Chocolate Pancakes"
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="recipe-base-servings">Base Servings</Label>
              <Input
                id="recipe-base-servings"
                type="number"
                required
                min={1}
                value={baseServings}
                onChange={(e) => setBaseServings(Number(e.target.value))}
                className="mt-2"
              />
            </div>
          </div>

          <div>
            <Label>Dietary Tags</Label>
            <div className="mt-2.5 flex flex-wrap gap-3">
              {['Vegetarian', 'Vegan'].map((tag) => {
                const checked = dietaryTags.includes(tag);
                const tagId = `tag-${tag.toLowerCase()}`;
                return (
                  <Label
                    key={tag}
                    htmlFor={tagId}
                    className={`flex cursor-pointer items-center space-x-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                      checked
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <Checkbox id={tagId} checked={checked} onChange={() => handleTagToggle(tag)} />
                    <span>{tag}</span>
                  </Label>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                Ingredients
              </Label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddIngredient}
                className="space-x-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Ingredient</span>
              </Button>
            </div>

            {ingredients.map((ing, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-3 rounded-xl border border-slate-800 bg-slate-800/40 p-3.5"
              >
                <div className="col-span-12 sm:col-span-3">
                  <Label htmlFor={`ingredient-id-${idx}`} className="text-[11px] text-slate-400">
                    ID (e.g. flour)
                  </Label>
                  <Input
                    id={`ingredient-id-${idx}`}
                    type="text"
                    required
                    value={ing.ingredientId}
                    onChange={(e) => handleIngredientChange(idx, 'ingredientId', e.target.value)}
                    placeholder="flour"
                    className="mt-1 h-8 rounded-lg bg-slate-900 px-3 text-xs"
                  />
                </div>

                <div className="col-span-12 sm:col-span-4">
                  <Label
                    htmlFor={`ingredient-display-${idx}`}
                    className="text-[11px] text-slate-400"
                  >
                    Display Name
                  </Label>
                  <Input
                    id={`ingredient-display-${idx}`}
                    type="text"
                    required
                    value={ing.displayName}
                    onChange={(e) => handleIngredientChange(idx, 'displayName', e.target.value)}
                    placeholder="All-Purpose Flour"
                    className="mt-1 h-8 rounded-lg bg-slate-900 px-3 text-xs"
                  />
                </div>

                <div className="col-span-6 sm:col-span-2">
                  <Label
                    htmlFor={`ingredient-amount-${idx}`}
                    className="text-[11px] text-slate-400"
                  >
                    Amount
                  </Label>
                  <Input
                    id={`ingredient-amount-${idx}`}
                    type="number"
                    required
                    step="any"
                    value={ing.amount}
                    onChange={(e) => handleIngredientChange(idx, 'amount', Number(e.target.value))}
                    className="mt-1 h-8 rounded-lg bg-slate-900 px-3 text-xs"
                  />
                </div>

                <div className="col-span-5 sm:col-span-2">
                  <Label htmlFor={`ingredient-unit-${idx}`} className="text-[11px] text-slate-400">
                    Unit
                  </Label>
                  <Select
                    id={`ingredient-unit-${idx}`}
                    value={ing.unit}
                    onChange={(e) => handleIngredientChange(idx, 'unit', e.target.value)}
                    className="mt-1 h-8 rounded-lg bg-slate-900 px-2 text-xs"
                  >
                    {SUPPORTED_UNITS_BY_CATEGORY.map((catGroup) => (
                      <optgroup key={catGroup.category} label={catGroup.category}>
                        {catGroup.units.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </div>

                <div className="col-span-1 flex items-end justify-center pb-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveIngredient(idx)}
                    disabled={ingredients.length <= 1}
                    aria-label={`Remove ingredient line #${idx + 1}`}
                    className="h-8 w-8 text-slate-400 hover:bg-slate-800 hover:text-red-400 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end space-x-3 pt-2">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={isPending} className="px-6 text-black">
              {isPending ? (
                <span>{isEditing ? 'Saving...' : 'Creating...'}</span>
              ) : (
                <span>{isEditing ? 'Save Changes' : 'Create Recipe'}</span>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
