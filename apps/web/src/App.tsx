import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigation } from './components/Navigation';
import { RecipeList } from './components/RecipeList';
import { RecipeForm } from './components/RecipeForm';
import { ShoppingListBuilder } from './components/ShoppingListBuilder';

/**
 * Open Questions / Scope Notes:
 * - Query stale time / cache invalidation strategy is using TanStack Query defaults (5-min staleTime configured for shared queries).
 * - No client-side routing guard or authentication exists (matches API's current no-auth scope).
 * - No edit or delete UI for recipes exists (matches API's current create/read-only scope).
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

  // Sync tab with URL hash (#recipes or #shopping-list)
  const getInitialTab = (): 'recipes' | 'shopping-list' => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'shopping-list') return 'shopping-list';
    return 'recipes';
  };

  const [currentTab, setCurrentTab] = useState<'recipes' | 'shopping-list'>(getInitialTab);

  useEffect(() => {
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
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-slate-950 font-sans text-slate-100 antialiased">
        <Navigation currentTab={currentTab} onTabChange={handleTabChange} />

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {currentTab === 'recipes' ? (
            <div className="space-y-10">
              <RecipeForm />
              <RecipeList />
            </div>
          ) : (
            <ShoppingListBuilder />
          )}
        </main>
      </div>
    </QueryClientProvider>
  );
};

export default App;
