import React, { useState } from 'react';
import { Users, AlertCircle, RefreshCw, ChefHat, Pencil, Trash2 } from 'lucide-react';
import type { RecipeDto } from '../lib/api';
import { useRecipes, useDeleteRecipe } from '../lib/queries';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Alert, AlertTitle, AlertDescription } from './ui/alert';
import { RecipeForm } from './RecipeForm';

export interface RecipeListProps {
  onEditRecipe?: (recipe: RecipeDto) => void;
}

export const RecipeList: React.FC<RecipeListProps> = ({ onEditRecipe }) => {
  const { data: recipes = [], isLoading, isError, error, refetch } = useRecipes();
  const deleteRecipeMutation = useDeleteRecipe();
  const [editingRecipe, setEditingRecipe] = useState<RecipeDto | null>(null);

  const handleDelete = (recipe: RecipeDto) => {
    if (window.confirm(`Are you sure you want to delete "${recipe.name}"?`)) {
      deleteRecipeMutation.mutate(recipe.id);
    }
  };

  const handleEditClick = (recipe: RecipeDto) => {
    if (onEditRecipe) {
      onEditRecipe(recipe);
    } else {
      setEditingRecipe(recipe);
    }
  };

  if (editingRecipe) {
    return (
      <RecipeForm
        recipe={editingRecipe}
        onCancel={() => setEditingRecipe(null)}
        onSuccess={() => setEditingRecipe(null)}
      />
    );
  }

  if (isLoading && recipes.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 text-center">
        <RefreshCw className="h-8 w-8 animate-spin text-orange-500" />
        <p className="mt-4 text-sm font-medium text-slate-300">Loading recipes...</p>
      </Card>
    );
  }

  if (isError && recipes.length === 0) {
    return (
      <Alert className="border-red-500/30 bg-red-500/10 p-8 text-center text-red-400">
        <div className="flex flex-col items-center">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <AlertTitle className="mt-3 text-lg font-semibold text-white">
            Failed to Load Recipes
          </AlertTitle>
          <AlertDescription className="mt-1 text-sm text-red-300">
            {error instanceof Error ? error.message : 'Unknown error'}
          </AlertDescription>
          <Button
            type="button"
            variant="secondary"
            onClick={() => refetch()}
            className="mt-6 space-x-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Try Again</span>
          </Button>
        </div>
      </Alert>
    );
  }

  if (recipes.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center border-dashed p-12 text-center">
        <ChefHat className="h-12 w-12 text-slate-600" />
        <h3 className="mt-4 text-lg font-semibold text-white">No Recipes Found</h3>
        <p className="mt-1 text-sm text-slate-400">
          Create your first recipe using the form to get started!
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {deleteRecipeMutation.isError && (
        <Alert className="border-red-500/30 bg-red-500/10 text-red-400">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <AlertDescription className="text-sm">
            <span className="font-semibold">Error Deleting Recipe: </span>
            {deleteRecipeMutation.error.message}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Saved Recipes ({recipes.length})
          </h2>
          <p className="mt-1 text-sm text-slate-400">All available recipes in database</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="space-x-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {recipes.map((recipe) => (
          <Card
            key={recipe.id}
            className="flex flex-col justify-between p-5 transition-colors hover:border-slate-700"
          >
            <div>
              <CardHeader className="p-0">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{recipe.name}</CardTitle>
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
              </CardHeader>

              <CardContent className="mt-4 border-t border-slate-800/60 p-0 pt-3">
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
              </CardContent>
            </div>

            <div className="mt-4 flex items-center justify-end border-t border-slate-800/40 pt-3 text-xs">
              <div className="flex items-center space-x-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEditClick(recipe)}
                  aria-label={`Edit recipe ${recipe.name}`}
                  className="h-7 px-2 text-xs text-slate-400 hover:text-white"
                >
                  <Pencil className="mr-1 h-3 w-3" />
                  <span>Edit</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(recipe)}
                  disabled={deleteRecipeMutation.isPending}
                  aria-label={`Delete recipe ${recipe.name}`}
                  className="h-7 px-2 text-xs text-slate-400 hover:text-red-400"
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  <span>Delete</span>
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
