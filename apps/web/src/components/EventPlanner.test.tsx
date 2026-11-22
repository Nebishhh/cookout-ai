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

type SentDish = { recipeId: string; course: string | null; servingsOverride: number | null };

/** The recipe ids in a plan/create/update body; the planner sends `dishes`, never `recipeIds`. */
function recipeIdsOf(body: string): string[] {
  const parsed = JSON.parse(body) as { dishes: SentDish[]; recipeIds?: unknown };
  expect(parsed.recipeIds).toBeUndefined();
  return parsed.dishes.map((dish) => dish.recipeId);
}

function savedEventDetail(
  recipeIds: string[],
  droppedRecipeIds: string[] = [],
  dishes: SentDish[] = recipeIds.map((recipeId) => ({
    recipeId,
    course: null,
    servingsOverride: null,
  }))
) {
  return {
    id: 'event-1',
    name: 'Big Dinner',
    guestGroup: { totalGuests: 10, vegetarianCount: 0, veganCount: 0, omnivoreCount: 10 },
    dishes,
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

/**
 * The checkbox whose accessible name (aria-label) is "Select recipe Recipe <n>".
 *
 * Found by that attribute rather than getByLabelText. jsdom recomputes every labelable element's
 * `labels` after each DOM change, so the first label lookup after a click costs time proportional
 * to (labelled controls x DOM size). With 50 checked cards, each carrying its own labelled course
 * picker and servings override, that was ~5s per lookup (measured), and these tests look one up
 * after nearly every click. The browser has no such cost: rendering 52 checked cards took 0.35s
 * and a click 0.02s in the same measurement.
 */
function recipeCheckbox(n: number) {
  const box = document.querySelector<HTMLInputElement>(
    `input[type="checkbox"][aria-label="Select recipe Recipe ${n}"]`
  );
  if (!box) throw new Error(`No checkbox named "Select recipe Recipe ${n}"`);
  return box;
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
      const recipeIds = recipeIdsOf(options.body as string);
      sentRecipeIds.push(recipeIds);
      return overCap(recipeIds) ?? jsonResponse(emptyPlanResult(recipeIds));
    }
    if (eventRecipeIds && u.endsWith('/api/events/event-1')) {
      if (options?.method === 'PUT') {
        const recipeIds = recipeIdsOf(options.body as string);
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
        const body = { recipeIds: recipeIdsOf(options.body as string) };
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

describe('EventPlanner: courses and servings overrides', () => {
  const HINT = 'Put alternatives in the same course to split servings.';
  const twelve = { totalGuests: 12, vegetarianCount: 3, veganCount: 1, omnivoreCount: 9 };
  const recipes = [
    { id: 'pork', name: 'Pulled Pork', baseServings: 4, dietaryTags: [], ingredients: [] },
    {
      id: 'tagine',
      name: 'Chickpea Tagine',
      baseServings: 4,
      dietaryTags: ['Vegan'],
      ingredients: [],
    },
    {
      id: 'potatoes',
      name: 'Scalloped Potatoes',
      baseServings: 6,
      dietaryTags: ['Vegetarian'],
      ingredients: [],
    },
    {
      id: 'sorbet',
      name: 'Coconut Sorbet',
      baseServings: 6,
      dietaryTags: ['Vegan'],
      ingredients: [],
    },
  ];
  const dish = (
    recipeId: string,
    recipeName: string,
    course: string | null,
    servings: number,
    eligibleServings: number,
    servingsWereOverridden = false
  ) => ({
    recipeId,
    recipeName,
    eligibleServings,
    servings,
    course,
    servingsWereOverridden,
    scaledIngredients: [],
  });

  /** The 12-guest example as the server returns it: 4.5 / 7.5 / 11 / 12, vegan has no Side. */
  function twelveGuestPlan(overrides: { porkServings?: number; mainTotal?: number } = {}) {
    const porkServings = overrides.porkServings ?? 4.5;
    return {
      guestGroup: twelve,
      includedRecipes: [
        dish('pork', 'Pulled Pork', 'Main', porkServings, 9, overrides.porkServings !== undefined),
        dish('tagine', 'Chickpea Tagine', 'Main', 7.5, 12),
        dish('potatoes', 'Scalloped Potatoes', 'Side', 11, 11),
        dish('sorbet', 'Coconut Sorbet', 'Dessert', 12, 12),
      ],
      excludedRecipes: [],
      shoppingList: [],
      schedule: null,
      warnings: [
        { course: 'Side', cohort: 'vegan', guestCount: 1, message: '1 vegan guest has no Side' },
      ],
      courseSummaries: [
        {
          course: 'Main',
          servings: overrides.mainTotal ?? 12,
          guestCount: 12,
          coveredGuestCount: 12,
        },
        { course: 'Side', servings: 11, guestCount: 12, coveredGuestCount: 11 },
        { course: 'Dessert', servings: 12, guestCount: 12, coveredGuestCount: 12 },
      ],
    };
  }

  /** Serves the four recipes and answers every plan with `plan`, recording each plan body. */
  function mockCourseApi(plan: unknown = twelveGuestPlan()) {
    const bodies: Array<{ dishes: SentDish[] }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      const u = url.toString();
      if (u.includes('/api/recipes')) return jsonResponse(recipes);
      if (u.endsWith('/api/events/plan') && options?.method === 'POST') {
        recipeIdsOf(options.body as string);
        bodies.push(JSON.parse(options.body as string));
        return jsonResponse(plan);
      }
      return jsonResponse({ error: 'NotFound', message: 'not mocked' }, 404);
    });
    return bodies;
  }

  const planButton = () => screen.getByRole('button', { name: /plan event shopping list/i });
  const check = (name: string) => fireEvent.click(screen.getByLabelText(`Select recipe ${name}`));

  async function renderAndCheckAll() {
    renderPlanner();
    await screen.findByLabelText('Select recipe Pulled Pork');
    for (const r of recipes) check(r.name);
  }

  it('shows the course hint, and a course picker and servings override on each checked dish', async () => {
    mockCourseApi();
    renderPlanner();
    await screen.findByLabelText('Select recipe Pulled Pork');

    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(screen.queryByLabelText('Course for Pulled Pork')).not.toBeInTheDocument();

    check('Pulled Pork');
    const course = screen.getByLabelText('Course for Pulled Pork');
    expect(course).toHaveValue('');
    expect(course).toHaveAccessibleDescription(HINT);
    expect(Array.from((course as HTMLSelectElement).options).map((o) => o.textContent)).toEqual([
      'No course',
      'Main',
      'Side',
      'Dessert',
      'Drink',
      'Other',
    ]);
    expect(screen.getByLabelText('Servings override for Pulled Pork')).toHaveValue(null);
    expect(screen.queryByLabelText('Course for Chickpea Tagine')).not.toBeInTheDocument();
  });

  it('sends each checked dish with its course and servings override', async () => {
    const bodies = mockCourseApi();
    await renderAndCheckAll();

    fireEvent.change(screen.getByLabelText('Course for Pulled Pork'), {
      target: { value: 'Main' },
    });
    fireEvent.change(screen.getByLabelText('Course for Chickpea Tagine'), {
      target: { value: 'Main' },
    });
    fireEvent.change(screen.getByLabelText('Servings override for Scalloped Potatoes'), {
      target: { value: '6' },
    });
    fireEvent.click(planButton());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].dishes).toEqual([
      { recipeId: 'pork', course: 'Main', servingsOverride: null },
      { recipeId: 'tagine', course: 'Main', servingsOverride: null },
      { recipeId: 'potatoes', course: null, servingsOverride: 6 },
      { recipeId: 'sorbet', course: null, servingsOverride: null },
    ]);
  });

  it('explains a bad servings override next to the field and blocks planning', async () => {
    const bodies = mockCourseApi();
    await renderAndCheckAll();

    const override = screen.getByLabelText('Servings override for Pulled Pork');
    fireEvent.change(override, { target: { value: '2.5' } });

    expect(override).toHaveAttribute('aria-invalid', 'true');
    expect(override).toHaveAccessibleDescription('Enter a whole number of servings, 1 or more.');
    expect(planButton()).toBeDisabled();
    fireEvent.submit(planButton().closest('form')!);
    expect(bodies).toHaveLength(0);

    fireEvent.change(override, { target: { value: '' } });
    expect(override).not.toHaveAttribute('aria-invalid');
    expect(planButton()).toBeEnabled();
  });

  it('groups the plan by course with each course total and the shortfall warning', async () => {
    mockCourseApi();
    await renderAndCheckAll();
    fireEvent.click(planButton());

    expect(await screen.findByText('Main: 12 servings for 12 guests')).toBeInTheDocument();
    expect(screen.getByText('Side: 11 servings for 12 guests')).toBeInTheDocument();
    expect(screen.getByText('Dessert: 12 servings for 12 guests')).toBeInTheDocument();
    expect(screen.queryByText(/over by|under by/)).not.toBeInTheDocument();

    const card = (name: string) => screen.getByRole('article', { name });
    expect(card('Pulled Pork')).toHaveTextContent('Cook 4 1/2 servings');
    expect(card('Pulled Pork')).toHaveTextContent('9 guests can eat it');
    expect(card('Chickpea Tagine')).toHaveTextContent('Cook 7 1/2 servings');
    expect(card('Scalloped Potatoes')).toHaveTextContent('Cook 11 servings');
    expect(card('Coconut Sorbet')).toHaveTextContent('Cook 12 servings');

    const warning = screen
      .getAllByRole('alert')
      .find((el) => el.textContent?.includes('1 vegan guest has no Side'));
    expect(warning).toBeDefined();
  });

  it('marks a course an override pushes over, and the overridden dish', async () => {
    mockCourseApi(twelveGuestPlan({ porkServings: 6, mainTotal: 13.5 }));
    await renderAndCheckAll();
    fireEvent.click(planButton());

    expect(await screen.findByText('Main: 13 1/2 servings for 12 guests')).toBeInTheDocument();
    expect(screen.getByText('over by 1 1/2')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Pulled Pork' })).toHaveTextContent('Your override');
    expect(screen.getByRole('article', { name: 'Chickpea Tagine' })).not.toHaveTextContent(
      'Your override'
    );
  });

  it('marks a course an override pulls under', async () => {
    mockCourseApi(twelveGuestPlan({ porkServings: 2, mainTotal: 9.5 }));
    await renderAndCheckAll();
    fireEvent.click(planButton());

    expect(await screen.findByText('under by 2 1/2')).toBeInTheDocument();
  });

  it('pre-fills courses and overrides from a saved event and sends them back on update', async () => {
    const put: Array<{ dishes: SentDish[] }> = [];
    const saved = savedEventDetail(
      ['pork', 'tagine'],
      [],
      [
        { recipeId: 'pork', course: 'Main', servingsOverride: null },
        { recipeId: 'tagine', course: 'Main', servingsOverride: 5 },
      ]
    );
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      const u = url.toString();
      if (u.includes('/api/recipes')) return jsonResponse(recipes);
      if (u.endsWith('/api/events/event-1') && options?.method === 'PUT') {
        recipeIdsOf(options.body as string);
        put.push(JSON.parse(options.body as string));
        return jsonResponse(saved);
      }
      if (u.endsWith('/api/events/event-1')) return jsonResponse(saved);
      return jsonResponse({ error: 'NotFound', message: 'not mocked' }, 404);
    });

    renderPlanner({ selectedEventId: 'event-1' });

    await waitFor(() =>
      expect(screen.getByLabelText('Course for Pulled Pork')).toHaveValue('Main')
    );
    expect(screen.getByLabelText('Course for Chickpea Tagine')).toHaveValue('Main');
    expect(screen.getByLabelText('Servings override for Chickpea Tagine')).toHaveValue(5);

    fireEvent.change(screen.getByLabelText('Course for Pulled Pork'), {
      target: { value: 'Side' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^update event$/i }));

    await waitFor(() => expect(put).toHaveLength(1));
    expect(put[0].dishes).toEqual([
      { recipeId: 'pork', course: 'Side', servingsOverride: null },
      { recipeId: 'tagine', course: 'Main', servingsOverride: 5 },
    ]);
  });
});
