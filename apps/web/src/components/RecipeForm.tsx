import React, { useState } from 'react';
import { Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api, type IngredientInput } from '../lib/api';

interface RecipeFormProps {
  onSuccess: () => void;
}

const SUPPORTED_UNITS_BY_CATEGORY = [
  { category: 'Mass', units: ['g', 'kg', 'oz', 'lb'] },
  { category: 'Volume', units: ['ml', 'l', 'tsp', 'tbsp', 'cup', 'fl oz'] },
  { category: 'Count', units: ['count', 'clove', 'egg', 'onion'] },
];

export const RecipeForm: React.FC<RecipeFormProps> = ({ onSuccess }) => {
  const [name, setName] = useState('');
  const [baseServings, setBaseServings] = useState<number>(4);
  const [dietaryTags, setDietaryTags] = useState<string[]>([]);
  const [ingredients, setIngredients] = useState<IngredientInput[]>([
    { ingredientId: '', displayName: '', amount: 1, unit: 'g' },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    // Basic client-side block for empty required fields
    if (!name.trim()) {
      setError('Recipe name is required.');
      return;
    }

    if (ingredients.length === 0) {
      setError('At least one ingredient line is required.');
      return;
    }

    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      if (!ing.ingredientId.trim() || !ing.displayName.trim()) {
        setError(`Ingredient row #${i + 1} requires an Ingredient ID and Display Name.`);
        return;
      }
    }

    setLoading(true);

    try {
      await api.createRecipe({
        name: name.trim(),
        baseServings: Number(baseServings),
        dietaryTags,
        ingredients: ingredients.map((ing) => ({
          ingredientId: ing.ingredientId.trim(),
          displayName: ing.displayName.trim(),
          amount: Number(ing.amount),
          unit: ing.unit,
        })),
      });

      setSuccessMessage(`Recipe "${name.trim()}" created successfully!`);
      setName('');
      setBaseServings(4);
      setDietaryTags([]);
      setIngredients([{ ingredientId: '', displayName: '', amount: 1, unit: 'g' }]);
      onSuccess();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to create recipe.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 backdrop-blur-md shadow-xl">
      <h2 className="text-xl font-semibold text-white">Create New Recipe</h2>
      <p className="mt-1 text-sm text-slate-400">
        Add a new recipe to your collection with ingredients and serving size.
      </p>

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start space-x-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-400" />
          <div className="text-sm">
            <span className="font-semibold">Error: </span>
            {error}
          </div>
        </div>
      )}

      {successMessage && (
        <div className="mt-4 flex items-center space-x-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-400">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-400" />
          <div className="text-sm font-medium">{successMessage}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label
              htmlFor="recipe-name"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
            >
              Recipe Name
            </label>
            <input
              id="recipe-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fluffy Chocolate Pancakes"
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          <div>
            <label
              htmlFor="recipe-base-servings"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
            >
              Base Servings
            </label>
            <input
              id="recipe-base-servings"
              type="number"
              required
              min={1}
              value={baseServings}
              onChange={(e) => setBaseServings(Number(e.target.value))}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </div>

        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
            Dietary Tags
          </span>
          <div className="mt-2.5 flex flex-wrap gap-3">
            {['Vegetarian', 'Vegan'].map((tag) => {
              const checked = dietaryTags.includes(tag);
              return (
                <label
                  key={tag}
                  className={`flex cursor-pointer items-center space-x-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                    checked
                      ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                      : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleTagToggle(tag)}
                    className="h-4 w-4 rounded border-slate-700 text-orange-500 focus:ring-orange-500"
                  />
                  <span>{tag}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              Ingredients
            </h3>
            <button
              type="button"
              onClick={handleAddIngredient}
              className="flex items-center space-x-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Ingredient</span>
            </button>
          </div>

          {ingredients.map((ing, idx) => (
            <div
              key={idx}
              className="grid grid-cols-12 gap-3 rounded-xl border border-slate-800 bg-slate-800/40 p-3.5"
            >
              <div className="col-span-12 sm:col-span-3">
                <label
                  htmlFor={`ingredient-id-${idx}`}
                  className="block text-[11px] font-medium text-slate-400"
                >
                  ID (e.g. flour)
                </label>
                <input
                  id={`ingredient-id-${idx}`}
                  type="text"
                  required
                  value={ing.ingredientId}
                  onChange={(e) => handleIngredientChange(idx, 'ingredientId', e.target.value)}
                  placeholder="flour"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div className="col-span-12 sm:col-span-4">
                <label
                  htmlFor={`ingredient-display-${idx}`}
                  className="block text-[11px] font-medium text-slate-400"
                >
                  Display Name
                </label>
                <input
                  id={`ingredient-display-${idx}`}
                  type="text"
                  required
                  value={ing.displayName}
                  onChange={(e) => handleIngredientChange(idx, 'displayName', e.target.value)}
                  placeholder="All-Purpose Flour"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div className="col-span-6 sm:col-span-2">
                <label
                  htmlFor={`ingredient-amount-${idx}`}
                  className="block text-[11px] font-medium text-slate-400"
                >
                  Amount
                </label>
                <input
                  id={`ingredient-amount-${idx}`}
                  type="number"
                  required
                  step="any"
                  value={ing.amount}
                  onChange={(e) => handleIngredientChange(idx, 'amount', Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div className="col-span-5 sm:col-span-2">
                <label
                  htmlFor={`ingredient-unit-${idx}`}
                  className="block text-[11px] font-medium text-slate-400"
                >
                  Unit
                </label>
                <select
                  id={`ingredient-unit-${idx}`}
                  value={ing.unit}
                  onChange={(e) => handleIngredientChange(idx, 'unit', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-orange-500 focus:outline-none"
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
                </select>
              </div>

              <div className="col-span-1 flex items-end justify-center pb-0.5">
                <button
                  type="button"
                  onClick={() => handleRemoveIngredient(idx)}
                  disabled={ingredients.length <= 1}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-red-400 disabled:opacity-30"
                  title="Remove ingredient"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center space-x-2 rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-semibold text-black shadow-sm hover:bg-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50"
          >
            {loading ? <span>Creating...</span> : <span>Create Recipe</span>}
          </button>
        </div>
      </form>
    </div>
  );
};
