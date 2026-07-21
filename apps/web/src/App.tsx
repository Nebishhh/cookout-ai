import React, { useState, useEffect } from 'react';
import { Navigation } from './components/Navigation';
import { RecipeList } from './components/RecipeList';
import { RecipeForm } from './components/RecipeForm';
import { ShoppingListBuilder } from './components/ShoppingListBuilder';
import { api, type RecipeDto } from './lib/api';

/**
 * Open Questions / Scope Notes:
 * - No client-side routing guard or authentication exists (matches API's current no-auth scope).
 * - No edit or delete UI for recipes exists (matches API's current create/read-only scope).
 * - No loading skeletons or optimistic UI beyond basic loading indicators (deferred polish item).
 */

export const App: React.FC = () => {
  // Sync tab with URL hash (#recipes or #shopping-list)
  const getInitialTab = (): 'recipes' | 'shopping-list' => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'shopping-list') return 'shopping-list';
    return 'recipes';
  };

  const [currentTab, setCurrentTab] = useState<'recipes' | 'shopping-list'>(getInitialTab);

  const [recipes, setRecipes] = useState<RecipeDto[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState<boolean>(true);
  const [recipesError, setRecipesError] = useState<string | null>(null);

  const loadRecipes = async () => {
    setLoadingRecipes(true);
    setRecipesError(null);
    try {
      const data = await api.getRecipes();
      setRecipes(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setRecipesError(err.message);
      } else {
        setRecipesError('Failed to fetch recipes.');
      }
    } finally {
      setLoadingRecipes(false);
    }
  };

  useEffect(() => {
    loadRecipes();

    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'shopping-list') {
        setCurrentTab('shopping-list');
      } else {
        setCurrentTab('recipes');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleTabChange = (tab: 'recipes' | 'shopping-list') => {
    setCurrentTab(tab);
    window.location.hash = tab;
  };

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 antialiased">
      <Navigation currentTab={currentTab} onTabChange={handleTabChange} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {currentTab === 'recipes' ? (
          <div className="space-y-10">
            <RecipeForm onSuccess={loadRecipes} />
            <RecipeList
              recipes={recipes}
              loading={loadingRecipes}
              error={recipesError}
              onRefresh={loadRecipes}
            />
          </div>
        ) : (
          <ShoppingListBuilder />
        )}
      </main>
    </div>
  );
};

export default App;
