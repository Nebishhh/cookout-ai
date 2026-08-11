import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import type { RecipeDto } from './lib/api';
import { Navigation } from './components/Navigation';
import { RecipeList } from './components/RecipeList';
import { RecipeForm } from './components/RecipeForm';
import { ShoppingListBuilder } from './components/ShoppingListBuilder';
import { EventPlanner } from './components/EventPlanner';

/**
 * Open Questions / Scope Notes:
 * - Query stale time / cache invalidation strategy is using TanStack Query defaults (5-min staleTime configured for shared queries).
 * - No client-side routing guard or authentication exists (matches API's current no-auth scope).
 * - Shopping lists built via POST /api/shopping-list and event plans built via POST /api/events/plan are dynamically generated on request and never persisted.
 * - No confirmation UI beyond basic browser confirm dialog.
 * - No optimistic updates on mutations (out of scope for this milestone).
 */

interface AppProps {
  queryClient?: QueryClient;
}

export const App: React.FC<AppProps> = ({ queryClient: propQueryClient }) => {
  const [queryClient] = useState(
    () =>
      propQueryClient ||
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: 1000 * 60 * 5,
          },
        },
      })
  );

  const [editingRecipe, setEditingRecipe] = useState<RecipeDto | null>(null);

  // Sync tab with URL hash (#recipes, #shopping-list, or #event-planner)
  const getInitialTab = (): 'recipes' | 'shopping-list' | 'event-planner' => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'shopping-list') return 'shopping-list';
    if (hash === 'event-planner') return 'event-planner';
    return 'recipes';
  };

  const [currentTab, setCurrentTab] = useState<'recipes' | 'shopping-list' | 'event-planner'>(
    getInitialTab
  );

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'shopping-list') {
        setCurrentTab('shopping-list');
      } else if (hash === 'event-planner') {
        setCurrentTab('event-planner');
      } else {
        setCurrentTab('recipes');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleTabChange = (tab: 'recipes' | 'shopping-list' | 'event-planner') => {
    setCurrentTab(tab);
    window.location.hash = tab;
  };

  const [preselectedShoppingListIds, setPreselectedShoppingListIds] = useState<string[]>([]);

  const handleSendToShoppingList = (recipeIds: string[]) => {
    setPreselectedShoppingListIds(recipeIds);
    setCurrentTab('shopping-list');
    window.location.hash = 'shopping-list';
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <Navigation currentTab={currentTab} onTabChange={handleTabChange} />

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <motion.div
            key={currentTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {currentTab === 'recipes' ? (
              <div className="space-y-10">
                <RecipeForm
                  recipe={editingRecipe || undefined}
                  onCancel={editingRecipe ? () => setEditingRecipe(null) : undefined}
                  onSuccess={() => setEditingRecipe(null)}
                />
                <RecipeList
                  onEditRecipe={(recipe) => setEditingRecipe(recipe)}
                  onSendToShoppingList={handleSendToShoppingList}
                />
              </div>
            ) : currentTab === 'shopping-list' ? (
              <ShoppingListBuilder initialSelectedRecipeIds={preselectedShoppingListIds} />
            ) : (
              <EventPlanner />
            )}
          </motion.div>
        </main>
      </div>
    </QueryClientProvider>
  );
};

export default App;
