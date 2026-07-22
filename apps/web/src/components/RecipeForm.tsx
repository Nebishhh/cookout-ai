import React, { useState } from 'react';
import { Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { IngredientInput } from '../lib/api';
import { useCreateRecipe } from '../lib/queries';
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

export const RecipeForm: React.FC = () => {
  const [name, setName] = useState('');
  const [baseServings, setBaseServings] = useState<number>(4);
  const [dietaryTags, setDietaryTags] = useState<string[]>([]);
  const [ingredients, setIngredients] = useState<IngredientInput[]>([
    { ingredientId: '', displayName: '', amount: 1, unit: 'g' },
  ]);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const createRecipeMutation = useCreateRecipe();

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

    createRecipeMutation.mutate(
      {
        name: name.trim(),
        baseServings: Number(baseServings),
        dietaryTags,
        ingredients: ingredients.map((ing) => ({
          ingredientId: ing.ingredientId.trim(),
          displayName: ing.displayName.trim(),
          amount: Number(ing.amount),
          unit: ing.unit,
        })),
      },
      {
        onSuccess: (newRecipe) => {
          setSuccessMessage(`Recipe "${newRecipe.name}" created successfully!`);
          setName('');
          setBaseServings(4);
          setDietaryTags([]);
          setIngredients([{ ingredientId: '', displayName: '', amount: 1, unit: 'g' }]);
        },
      }
    );
  };

  const displayError =
    validationError || (createRecipeMutation.error ? createRecipeMutation.error.message : null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Recipe</CardTitle>
        <CardDescription>
          Add a new recipe to your collection with ingredients and serving size.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {displayError && (
          <Alert className="mb-6 border-red-500/30 bg-red-500/10 text-red-400">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <AlertDescription className="text-sm">
              <span className="font-semibold">Error: </span>
              {displayError}
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

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={createRecipeMutation.isPending}
              className="px-6 text-black"
            >
              {createRecipeMutation.isPending ? (
                <span>Creating...</span>
              ) : (
                <span>Create Recipe</span>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
