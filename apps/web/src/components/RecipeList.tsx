import React from 'react';
import { Users, AlertCircle, RefreshCw, ChefHat } from 'lucide-react';
import type { RecipeDto } from '../lib/api';

interface RecipeListProps {
  recipes: RecipeDto[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export const RecipeList: React.FC<RecipeListProps> = ({ recipes, loading, error, onRefresh }) => {
  if (loading && recipes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center backdrop-blur-md">
        <RefreshCw className="h-8 w-8 animate-spin text-orange-500" />
        <p className="mt-4 text-sm font-medium text-slate-300">Loading recipes...</p>
      </div>
    );
  }

  if (error && recipes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 p-12 text-center backdrop-blur-md">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <h3 className="mt-3 text-lg font-semibold text-white">Failed to Load Recipes</h3>
        <p className="mt-1 text-sm text-red-300">{error}</p>
        <button
          type="button"
          onClick={onRefresh}
          className="mt-6 flex items-center space-x-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Try Again</span>
        </button>
      </div>
    );
  }

  if (recipes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center backdrop-blur-md">
        <ChefHat className="h-12 w-12 text-slate-600" />
        <h3 className="mt-4 text-lg font-semibold text-white">No Recipes Found</h3>
        <p className="mt-1 text-sm text-slate-400">
          Create your first recipe using the form to get started!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Saved Recipes ({recipes.length})</h2>
          <p className="text-xs text-slate-400">All available recipes in database</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center space-x-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-400 hover:text-white"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {recipes.map((recipe) => (
          <div
            key={recipe.id}
            className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-md transition-all hover:border-slate-700 hover:shadow-lg"
          >
            <div>
              <div className="flex items-start justify-between">
                <h3 className="text-base font-semibold text-white">{recipe.name}</h3>
                <div className="flex items-center space-x-1 rounded-full bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-300">
                  <Users className="h-3 w-3 text-orange-400" />
                  <span>{recipe.baseServings} servings</span>
                </div>
              </div>

              {recipe.dietaryTags && recipe.dietaryTags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {recipe.dietaryTags.map((tag) => (
                    <span
                      key={tag}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                        tag === 'Vegan'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 border-t border-slate-800/60 pt-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Ingredients ({recipe.ingredients.length})
                </span>
                <ul className="mt-2 space-y-1 text-xs text-slate-300">
                  {recipe.ingredients.map((ing, i) => (
                    <li key={i} className="flex justify-between py-0.5">
                      <span className="font-medium text-slate-200">{ing.displayName}</span>
                      <span className="text-slate-400">
                        {ing.amount} {ing.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-4 pt-3 text-[11px] text-slate-500 border-t border-slate-800/40">
              ID: <span className="font-mono">{recipe.id}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
