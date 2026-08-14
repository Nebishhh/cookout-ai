import React, { useState, useEffect } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { motion } from 'framer-motion';
import { api, type RecipeDto } from './lib/api';
import { TOGGLE_SHOPPING_LIST_ITEM_MUTATION_KEY } from './lib/queries';
import { Navigation } from './components/Navigation';
import { RecipeList } from './components/RecipeList';
import { RecipeForm } from './components/RecipeForm';
import { ShoppingListBuilder } from './components/ShoppingListBuilder';
import { EventPlanner } from './components/EventPlanner';
import { EventList } from './components/EventList';
import { SavedShoppingLists } from './components/SavedShoppingLists';
import { PantryPanel } from './components/PantryPanel';

/**
 * Offline persistence for the shopping-list checkbox toggle: without this, a mutation that
 * TanStack Query paused because the browser is offline (see queries.ts's
 * useToggleShoppingListItemChecked doc comment) only lives in memory — a full page reload while
 * still offline silently drops it. `createSyncStoragePersister` snapshots the query client
 * (cache + any paused mutations) to localStorage; `shouldDehydrateMutation` scopes what gets
 * persisted to only this one paused mutation, not every mutation ever run, keeping localStorage
 * usage bounded. `gcTime` must be at least the persister's default 24h `maxAge`, or a persisted
 * query could be garbage-collected in memory before it's ever written to storage.
 */
const ONE_DAY_MS = 1000 * 60 * 60 * 24;

function createPersistedQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 1000 * 60 * 5,
        gcTime: ONE_DAY_MS,
      },
    },
  });

  // Registered so a paused mutation rehydrated from localStorage (before this hook's owning
  // component has mounted) still knows which function to call on resume.
  queryClient.setMutationDefaults(TOGGLE_SHOPPING_LIST_ITEM_MUTATION_KEY, {
    mutationFn: ({
      listId,
      itemId,
      checked,
    }: {
      listId: string;
      itemId: string;
      checked: boolean;
    }) => api.toggleShoppingListItem(listId, itemId, checked),
  });

  return queryClient;
}

const persister = createSyncStoragePersister({ storage: window.localStorage });

/**
 * Open Questions / Scope Notes:
 * - Query stale time / cache invalidation strategy is using TanStack Query defaults (5-min staleTime configured for shared queries).
 * - No client-side routing guard or authentication exists (matches API's current no-auth scope).
 * - Shopping lists can now be saved standalone (POST /api/shopping-lists) or linked to an event
 *   (PUT /api/events/:eventId/shopping-list) with per-item checked state that persists.
 *   The ephemeral preview route (POST /api/shopping-list) still exists unchanged for "build before deciding to save".
 * - Event plans can now be saved (POST/PUT/GET/DELETE /api/events) and "recompute live" — the saved plan itself is never cached, only its inputs (name/guestGroup/recipeIds).
 * - No confirmation UI beyond basic browser confirm dialog.
 * - No optimistic updates on create/update mutations (deliberate — see queries.ts); delete mutations are optimistic.
 */

interface AppProps {
  queryClient?: QueryClient;
}

export const App: React.FC<AppProps> = ({ queryClient: propQueryClient }) => {
  const [queryClient] = useState(() => propQueryClient || createPersistedQueryClient());

  const [editingRecipe, setEditingRecipe] = useState<RecipeDto | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedShoppingListId, setSelectedShoppingListId] = useState<string | null>(null);

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

  const handleViewShoppingList = (id: string) => {
    setSelectedShoppingListId(id);
    setCurrentTab('shopping-list');
    window.location.hash = 'shopping-list';
  };

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        dehydrateOptions: {
          shouldDehydrateMutation: (mutation) =>
            mutation.state.isPaused &&
            JSON.stringify(mutation.options.mutationKey) ===
              JSON.stringify(TOGGLE_SHOPPING_LIST_ITEM_MUTATION_KEY),
        },
      }}
      onSuccess={() => {
        void queryClient.resumePausedMutations();
      }}
    >
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
              <div className="space-y-10">
                <PantryPanel />
                <SavedShoppingLists
                  selectedId={selectedShoppingListId}
                  onSelect={setSelectedShoppingListId}
                  onDeleted={() => setSelectedShoppingListId(null)}
                />
                <ShoppingListBuilder
                  initialSelectedRecipeIds={preselectedShoppingListIds}
                  selectedShoppingListId={selectedShoppingListId}
                  onSaved={setSelectedShoppingListId}
                  onCloseDetail={() => setSelectedShoppingListId(null)}
                />
              </div>
            ) : (
              <div className="space-y-10">
                <EventList
                  selectedId={selectedEventId}
                  onSelect={setSelectedEventId}
                  onDeleted={() => setSelectedEventId(null)}
                />
                <EventPlanner
                  selectedEventId={selectedEventId}
                  onSaved={setSelectedEventId}
                  onCloseDetail={() => setSelectedEventId(null)}
                  onViewShoppingList={handleViewShoppingList}
                />
              </div>
            )}
          </motion.div>
        </main>
      </div>
    </PersistQueryClientProvider>
  );
};

export default App;
