import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventPlanner } from './EventPlanner';

/** Recipes `recipe-1` … `recipe-N`, in the bare-array shape GET /api/recipes returns to the planner. */
function makeRecipes(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `recipe-${i + 1}`,
    name: `Recipe ${i + 1}`,
    baseServings: 4,
    dietaryTags: [],
    ingredients: [],
  }));
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  } as Response;
}

function savedEventDetail(recipeIds: string[], droppedRecipeIds: string[] = []) {
  return {
    id: 'event-1',
    name: 'Big Dinner',
    guestGroup: { totalGuests: 10, vegetarianCount: 0, veganCount: 0, omnivoreCount: 10 },
    recipeIds,
    serveTimeMinutes: null,
    shoppingListId: null,
    includedRecipes: [],
    excludedRecipes: [],
    shoppingList: [],
    schedule: null,
    droppedRecipeIds,
  };
}

function renderPlanner(props: React.ComponentProps<typeof EventPlanner> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EventPlanner {...props} />
    </QueryClientProvider>
  );
}

function recipeCheckbox(n: number) {
  return screen.getByLabelText(`Select recipe Recipe ${n}`) as HTMLInputElement;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('EventPlanner: events that reference deleted recipes', () => {
  it('drops deleted recipe IDs from the selection on load, says so, and saves without them', async () => {
    const liveRecipes = makeRecipes(45);
    const liveIds = liveRecipes.map((r) => r.id);
    const deletedIds = Array.from({ length: 10 }, (_, i) => `deleted-${i + 1}`);

    // Mirrors the real server: GET returns every stored ID plus the ones it couldn't resolve,
    // and PUT checks the cap against the full requested list before dropping anything.
    let stored = savedEventDetail([...liveIds, ...deletedIds], deletedIds);
    const putBodies: { recipeIds: string[] }[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      const u = url.toString();
      if (u.includes('/api/recipes')) return jsonResponse(liveRecipes);
      if (u.endsWith('/api/events/event-1') && options?.method === 'PUT') {
        const body = JSON.parse(options.body as string) as { recipeIds: string[] };
        putBodies.push(body);
        if (body.recipeIds.length > 50) {
          return jsonResponse(
            {
              error: 'InvalidEventError',
              message: `An event can include at most 50 recipes (got ${body.recipeIds.length}).`,
            },
            400
          );
        }
        const owned = body.recipeIds.filter((id) => liveIds.includes(id));
        stored = savedEventDetail(owned, []);
        return jsonResponse(stored);
      }
      if (u.endsWith('/api/events/event-1')) return jsonResponse(stored);
      return jsonResponse({ error: 'NotFound', message: 'not mocked' }, 404);
    });

    renderPlanner({ selectedEventId: 'event-1' });

    expect(
      await screen.findByText(
        '10 recipes in this event were deleted and will be removed when you save.'
      )
    ).toBeInTheDocument();
    await waitFor(() => expect(recipeCheckbox(45)).toBeChecked());
    const checked = screen
      .getAllByRole('checkbox')
      .filter((box) => (box as HTMLInputElement).checked);
    expect(checked).toHaveLength(45);

    fireEvent.click(screen.getByRole('button', { name: /^update event$/i }));

    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0].recipeIds).toEqual(liveIds);
    await waitFor(() =>
      expect(
        screen.queryByText(/were deleted and will be removed when you save/)
      ).not.toBeInTheDocument()
    );
    expect(screen.queryByText(/^Error:/)).not.toBeInTheDocument();
    expect(recipeCheckbox(1)).toBeChecked();
  });

  it('uses the singular for one deleted recipe', async () => {
    const liveRecipes = makeRecipes(2);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const u = url.toString();
      if (u.includes('/api/recipes')) return jsonResponse(liveRecipes);
      if (u.endsWith('/api/events/event-1')) {
        return jsonResponse(savedEventDetail(['recipe-1', 'gone-1'], ['gone-1']));
      }
      return jsonResponse({ error: 'NotFound', message: 'not mocked' }, 404);
    });

    renderPlanner({ selectedEventId: 'event-1' });

    expect(
      await screen.findByText(
        '1 recipe in this event was deleted and will be removed when you save.'
      )
    ).toBeInTheDocument();
  });
});
