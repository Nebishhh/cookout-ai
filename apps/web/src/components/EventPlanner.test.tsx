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

/** `n` from a checkbox labelled "Select recipe Recipe <n>". */
function recipeNumber(box: HTMLElement) {
  return Number(box.getAttribute('aria-label')?.match(/(\d+)$/)?.[1]);
}

function recipeCheckbox(n: number) {
  return screen.getByLabelText(`Select recipe Recipe ${n}`) as HTMLInputElement;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

function emptyPlanResult(recipeIds: string[]) {
  return {
    guestGroup: { totalGuests: 10, vegetarianCount: 0, veganCount: 0, omnivoreCount: 10 },
    includedRecipes: recipeIds.map((id) => ({
      recipeId: id,
      recipeName: id,
      eligibleServings: 10,
    })),
    excludedRecipes: [],
    shoppingList: [],
    schedule: null,
  };
}

/**
 * Serves `recipes` and, when given, a saved event `event-1` holding `eventRecipeIds`. Records
 * every plan/update body, and answers both with the server's 400 once a request goes over 50.
 */
function mockPlannerApi(recipes: ReturnType<typeof makeRecipes>, eventRecipeIds?: string[]) {
  const sentRecipeIds: string[][] = [];
  const overCap = (ids: string[]) =>
    ids.length > 50
      ? jsonResponse(
          {
            error: 'InvalidEventError',
            message: `An event can include at most 50 recipes (got ${ids.length}).`,
          },
          400
        )
      : null;

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    const u = url.toString();
    if (u.includes('/api/recipes')) return jsonResponse(recipes);
    if (u.endsWith('/api/events/plan') && options?.method === 'POST') {
      const { recipeIds } = JSON.parse(options.body as string) as { recipeIds: string[] };
      sentRecipeIds.push(recipeIds);
      return overCap(recipeIds) ?? jsonResponse(emptyPlanResult(recipeIds));
    }
    if (eventRecipeIds && u.endsWith('/api/events/event-1')) {
      if (options?.method === 'PUT') {
        const { recipeIds } = JSON.parse(options.body as string) as { recipeIds: string[] };
        sentRecipeIds.push(recipeIds);
        return overCap(recipeIds) ?? jsonResponse(savedEventDetail(recipeIds));
      }
      return jsonResponse(savedEventDetail(eventRecipeIds));
    }
    return jsonResponse({ error: 'NotFound', message: 'not mocked' }, 404);
  });

  return sentRecipeIds;
}

function checkRecipes(from: number, to: number) {
  for (let n = from; n <= to; n++) fireEvent.click(recipeCheckbox(n));
}

function checkedCount() {
  return screen.getAllByRole('checkbox').filter((box) => (box as HTMLInputElement).checked).length;
}

/** Opens saved event `event-1` with `Recipe 1` … `Recipe <selected>` checked, out of 55 recipes. */
async function renderEventWithSelected(selected: number) {
  const recipes = makeRecipes(55);
  const sent = mockPlannerApi(
    recipes,
    recipes.slice(0, selected).map((r) => r.id)
  );
  renderPlanner({ selectedEventId: 'event-1' });
  await waitFor(() => expect(recipeCheckbox(selected)).toBeChecked());
  return sent;
}

describe('EventPlanner: 50-recipe limit', () => {
  // The only test that clicks its way up to the limit; the rest start from a loaded event. It looks
  // the 51 checkboxes up once and clicks the saved references: a getByLabelText per click rescans
  // every label in the document after each re-render, which made this test take 8-26s depending on
  // machine load. React keys the cards by recipe id, so the same nodes survive every re-render; the
  // isConnected check below fails loudly if a future change starts remounting them. The 9s budget
  // is about 3x its isolated time (2.8-3.0s).
  it('lets exactly 50 recipes be selected by clicking and planned', async () => {
    const sent = mockPlannerApi(makeRecipes(51));
    renderPlanner();
    await screen.findByLabelText('Select recipe Recipe 1');

    const boxes = (
      screen.getAllByLabelText(/^Select recipe Recipe \d+$/) as HTMLInputElement[]
    ).sort((a, b) => recipeNumber(a) - recipeNumber(b));
    expect(boxes.map(recipeNumber)).toEqual(Array.from({ length: 51 }, (_, i) => i + 1));

    expect(screen.getByText('0 of 50 recipes selected')).toBeInTheDocument();
    for (const box of boxes.slice(0, 50)) fireEvent.click(box);

    expect(boxes.every((box) => box.isConnected)).toBe(true);
    expect(boxes.filter((box) => box.checked)).toHaveLength(50);
    expect(screen.getByText('50 of 50 recipes selected')).toBeInTheDocument();
    expect(boxes[50]).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /plan event shopping list/i }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toHaveLength(50);
    expect(screen.queryByText(/^Error:/)).not.toBeInTheDocument();
  }, 9_000);

  it('disables the 51st recipe once 50 are selected, but never the selected ones', async () => {
    await renderEventWithSelected(50);

    expect(recipeCheckbox(51)).toBeDisabled();
    expect(recipeCheckbox(55)).toBeDisabled();
    expect(recipeCheckbox(1)).toBeEnabled();
    expect(recipeCheckbox(50)).toBeEnabled();

    fireEvent.click(recipeCheckbox(51));
    expect(recipeCheckbox(51)).not.toBeChecked();
    expect(checkedCount()).toBe(50);
  });

  it('allows selecting another recipe after deselecting one at the limit', async () => {
    await renderEventWithSelected(50);

    fireEvent.click(recipeCheckbox(1));

    expect(recipeCheckbox(1)).not.toBeChecked();
    expect(screen.getByText('49 of 50 recipes selected')).toBeInTheDocument();
    expect(recipeCheckbox(51)).toBeEnabled();

    fireEvent.click(recipeCheckbox(51));
    expect(recipeCheckbox(51)).toBeChecked();
    expect(checkedCount()).toBe(50);
    expect(recipeCheckbox(1)).toBeDisabled();
    expect(recipeCheckbox(52)).toBeDisabled();
  });

  it('applies the limit when editing a saved event', async () => {
    const sent = await renderEventWithSelected(49);

    expect(screen.getByText('49 of 50 recipes selected')).toBeInTheDocument();
    expect(recipeCheckbox(50)).toBeEnabled();

    fireEvent.click(recipeCheckbox(50));
    expect(recipeCheckbox(51)).toBeDisabled();
    fireEvent.click(recipeCheckbox(51));
    expect(checkedCount()).toBe(50);

    fireEvent.click(screen.getByRole('button', { name: /^update event$/i }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toHaveLength(50);
  });

  it('still loads an event saved with more than 50 recipes and lets them be unchecked', async () => {
    await renderEventWithSelected(52);

    expect(checkedCount()).toBe(52);
    expect(screen.getByText('52 of 50 recipes selected')).toBeInTheDocument();
    expect(screen.getByText(/uncheck 2 recipes before saving/i)).toBeInTheDocument();
    expect(recipeCheckbox(53)).toBeDisabled();
    expect(recipeCheckbox(1)).toBeEnabled();

    checkRecipes(1, 2);

    expect(checkedCount()).toBe(50);
    expect(screen.queryByText(/before saving/i)).not.toBeInTheDocument();
    expect(recipeCheckbox(53)).toBeDisabled();
  });

  it("shows the server's 400 message when saving an event over the limit", async () => {
    const sent = await renderEventWithSelected(52);

    fireEvent.click(screen.getByRole('button', { name: /^update event$/i }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(
      await screen.findByText('An event can include at most 50 recipes (got 52).')
    ).toBeInTheDocument();
  });
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

describe('EventPlanner: guest breakdown validation', () => {
  async function renderWithOneRecipeChecked() {
    const sent = mockPlannerApi(makeRecipes(1));
    renderPlanner();
    fireEvent.click(await screen.findByLabelText('Select recipe Recipe 1'));
    return sent;
  }

  function setGuests(total: number, vegetarian: number, vegan: number) {
    fireEvent.change(screen.getByLabelText('Total Guests'), { target: { value: String(total) } });
    fireEvent.change(screen.getByLabelText('Vegetarian guests (including vegan)'), {
      target: { value: String(vegetarian) },
    });
    fireEvent.change(screen.getByLabelText('Vegan guests'), { target: { value: String(vegan) } });
  }

  const planButton = () => screen.getByRole('button', { name: /plan event shopping list/i });

  it('explains "more vegetarians than guests" under the vegetarian field and blocks planning', async () => {
    const sent = await renderWithOneRecipeChecked();
    setGuests(4, 6, 0);

    const vegetarian = screen.getByLabelText('Vegetarian guests (including vegan)');
    expect(vegetarian).toHaveAttribute('aria-invalid', 'true');
    expect(vegetarian).toHaveAccessibleDescription(
      "Vegetarian guests can't be more than the 4 total guests."
    );
    expect(planButton()).toBeDisabled();

    fireEvent.submit(planButton().closest('form')!);
    expect(sent).toHaveLength(0);
    expect(screen.queryByText(/vegetarianCount|totalGuests/)).not.toBeInTheDocument();
  });

  it('explains "more vegans than vegetarians" under the vegan field', async () => {
    await renderWithOneRecipeChecked();
    setGuests(10, 2, 3);

    const vegan = screen.getByLabelText('Vegan guests');
    expect(vegan).toHaveAttribute('aria-invalid', 'true');
    expect(vegan).toHaveAccessibleDescription(
      "Vegan guests count as vegetarian too, so there can't be more than the 2 vegetarian guests."
    );
    expect(screen.getByLabelText('Vegetarian guests (including vegan)')).not.toHaveAttribute(
      'aria-invalid'
    );
    expect(planButton()).toBeDisabled();
  });

  it('clears the message and allows planning once the numbers are fixed', async () => {
    const sent = await renderWithOneRecipeChecked();
    setGuests(4, 6, 0);
    expect(planButton()).toBeDisabled();

    setGuests(8, 6, 0);
    const vegetarian = screen.getByLabelText('Vegetarian guests (including vegan)');
    expect(vegetarian).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText(/can't be more than/)).not.toBeInTheDocument();
    expect(planButton()).toBeEnabled();

    fireEvent.click(planButton());
    await waitFor(() => expect(sent).toHaveLength(1));
  });
});
