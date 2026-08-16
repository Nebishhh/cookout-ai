import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import App from './App';
import { RecipeForm } from './components/RecipeForm';

/**
 * Shared fetch-mock response builder for GET /api/recipes. RecipeList now calls the paginated
 * shape (?limit=... -> {items, nextCursor}) while ShoppingListBuilder/EventPlanner still call
 * the original unpaginated shape (bare array) — the same test double needs to answer both
 * correctly based on the request URL, matching apps/api/src/app.ts's actual dual-shape route.
 */
function recipesGetResponse(url: string, recipes: unknown[]): Response {
  const body = url.includes('limit=') ? { items: recipes, nextCursor: null } : recipes;
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  } as Response;
}

/**
 * Passed as `initialUser` to every `<App/>` render below — the AuthProvider test seam that
 * skips the real `GET /api/auth/me` call, so each test's own fetch mock only needs to answer
 * the feature routes it cares about, not the auth check on top of it.
 */
const TEST_USER = { id: 'test-user-1', email: 'test@example.com' };

describe('Web UI (TanStack Query & App Integration Tests)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = '';
  });

  it('renders recipe list returned from mocked GET /api/recipes', async () => {
    const mockRecipes = [
      {
        id: 'r1',
        name: 'Classic Pancakes',
        baseServings: 4,
        dietaryTags: ['Vegetarian'],
        ingredients: [
          {
            ingredientId: 'flour',
            displayName: 'All-Purpose Flour',
            amount: 2,
            unit: 'cup',
            category: 'Volume',
          },
        ],
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url.toString().includes('/api/recipes')) {
        return recipesGetResponse(url.toString(), mockRecipes);
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<App initialUser={TEST_USER} />);

    expect(await screen.findByText('Classic Pancakes')).toBeInTheDocument();
    expect(screen.getByText('4 servings')).toBeInTheDocument();
    expect(screen.getAllByText('Vegetarian').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('All-Purpose Flour')).toBeInTheDocument();
  });

  it('submits expected payload shape to POST /api/recipes on form submit', async () => {
    let capturedBody: unknown = null;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (url.toString().endsWith('/api/recipes') && options?.method === 'POST') {
        capturedBody = JSON.parse(options.body as string);
        return {
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            id: 'new-r1',
            name: 'Waffles',
            baseServings: 2,
            dietaryTags: ['Vegan'],
            ingredients: [
              {
                ingredientId: 'flour',
                displayName: 'Flour',
                amount: 1,
                unit: 'cup',
                category: 'Volume',
              },
            ],
          }),
        } as Response;
      }
      return recipesGetResponse(url.toString(), []);
    });

    render(<App initialUser={TEST_USER} />);

    fireEvent.change(screen.getByLabelText(/recipe name/i), {
      target: { value: 'Waffles' },
    });
    fireEvent.change(screen.getByLabelText(/base servings/i), {
      target: { value: '2' },
    });

    fireEvent.click(screen.getByLabelText('Vegan'));

    fireEvent.change(screen.getByLabelText(/id \(e.g. flour\)/i), {
      target: { value: 'flour' },
    });
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: 'Flour' },
    });
    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: '1' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create recipe/i }));

    await waitFor(() => {
      expect(capturedBody).toEqual({
        name: 'Waffles',
        baseServings: 2,
        dietaryTags: ['Vegan'],
        ingredients: [{ ingredientId: 'flour', displayName: 'Flour', amount: 1, unit: 'g' }],
        steps: [],
      });
    });
  });

  it('adding, reordering, and removing steps produces the correctly ordered payload on submit', async () => {
    let capturedBody: unknown = null;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (url.toString().endsWith('/api/recipes') && options?.method === 'POST') {
        capturedBody = JSON.parse(options.body as string);
        return {
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ id: 'new-r2', ...(capturedBody as object), dietaryTags: [] }),
        } as Response;
      }
      return recipesGetResponse(url.toString(), []);
    });

    render(<App initialUser={TEST_USER} />);

    fireEvent.change(screen.getByLabelText(/recipe name/i), {
      target: { value: 'Waffles' },
    });
    fireEvent.change(screen.getByLabelText(/id \(e.g. flour\)/i), {
      target: { value: 'flour' },
    });
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: 'Flour' },
    });

    // First step comes pre-existing (blank); fill it, then add a second and third.
    fireEvent.change(screen.getByLabelText('Step 1'), { target: { value: 'First step.' } });
    fireEvent.click(screen.getByRole('button', { name: /add step/i }));
    fireEvent.change(screen.getByLabelText('Step 2'), { target: { value: 'Second step.' } });
    fireEvent.click(screen.getByRole('button', { name: /add step/i }));
    fireEvent.change(screen.getByLabelText('Step 3'), { target: { value: 'Third step.' } });

    // Move the third step up once, so order becomes: First, Third, Second.
    fireEvent.click(screen.getByLabelText('Move step 3 up'));

    // Remove what is now the last step ("Second step.").
    fireEvent.click(screen.getByLabelText('Remove step 3'));

    fireEvent.click(screen.getByRole('button', { name: /create recipe/i }));

    await waitFor(() => {
      expect((capturedBody as { steps: unknown }).steps).toEqual([
        { instruction: 'First step.' },
        { instruction: 'Third step.' },
      ]);
    });
  });

  it("setting a step's duration/temperature amount without touching the unit dropdown still submits both fields", async () => {
    // Regression test: the unit <select> shows a fallback default ('minutes'/'F') via its
    // value prop even before the user interacts with it — setting only the amount must still
    // write that default into state, or the submit payload silently drops the value (the
    // "both durationAmount and durationUnit present" check on the write side would fail).
    let capturedBody: unknown = null;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (url.toString().endsWith('/api/recipes') && options?.method === 'POST') {
        capturedBody = JSON.parse(options.body as string);
        return {
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ id: 'new-r3', ...(capturedBody as object), dietaryTags: [] }),
        } as Response;
      }
      return recipesGetResponse(url.toString(), []);
    });

    render(<App initialUser={TEST_USER} />);

    fireEvent.change(screen.getByLabelText(/recipe name/i), { target: { value: 'Baked Chicken' } });
    fireEvent.change(screen.getByLabelText(/id \(e.g. flour\)/i), { target: { value: 'chicken' } });
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Chicken' } });
    fireEvent.change(screen.getByLabelText('Step 1'), { target: { value: 'Bake until done.' } });

    fireEvent.click(screen.getByRole('button', { name: /add timing/i }));
    fireEvent.change(screen.getByLabelText('Duration amount for step 1'), {
      target: { value: '25' },
    });
    fireEvent.change(screen.getByLabelText('Temperature amount for step 1'), {
      target: { value: '350' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create recipe/i }));

    await waitFor(() => {
      expect((capturedBody as { steps: unknown }).steps).toEqual([
        {
          instruction: 'Bake until done.',
          durationAmount: 25,
          durationUnit: 'minutes',
          temperatureAmount: 350,
          temperatureUnit: 'F',
        },
      ]);
    });
  });

  it('adds a per-step note via the "Add note" toggle and includes it, trimmed, in the submit payload', async () => {
    let capturedBody: unknown = null;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (url.toString().endsWith('/api/recipes') && options?.method === 'POST') {
        capturedBody = JSON.parse(options.body as string);
        return {
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ id: 'new-r4', ...(capturedBody as object), dietaryTags: [] }),
        } as Response;
      }
      return recipesGetResponse(url.toString(), []);
    });

    render(<App initialUser={TEST_USER} />);

    fireEvent.change(screen.getByLabelText(/recipe name/i), { target: { value: 'Baked Chicken' } });
    fireEvent.change(screen.getByLabelText(/id \(e.g. flour\)/i), { target: { value: 'chicken' } });
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Chicken' } });
    fireEvent.change(screen.getByLabelText('Step 1'), { target: { value: 'Bake until done.' } });

    fireEvent.click(screen.getByRole('button', { name: /add note/i }));
    fireEvent.change(screen.getByLabelText('Notes for step 1'), {
      target: { value: '  Tent with foil if browning too quickly.  ' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create recipe/i }));

    await waitFor(() => {
      expect((capturedBody as { steps: unknown }).steps).toEqual([
        {
          instruction: 'Bake until done.',
          notes: 'Tent with foil if browning too quickly.',
        },
      ]);
    });
  });

  it('displays 400 error response message from API when creation fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (url.toString().endsWith('/api/recipes') && options?.method === 'POST') {
        return {
          ok: false,
          status: 400,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            error: 'InvalidQuantityError',
            message: 'Quantity amount must be positive.',
          }),
        } as Response;
      }
      return recipesGetResponse(url.toString(), []);
    });

    render(<App initialUser={TEST_USER} />);

    fireEvent.change(screen.getByLabelText(/recipe name/i), {
      target: { value: 'Bad Recipe' },
    });
    fireEvent.change(screen.getByLabelText(/id \(e.g. flour\)/i), {
      target: { value: 'flour' },
    });
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: 'Flour' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create recipe/i }));

    expect(await screen.findByText('Quantity amount must be positive.')).toBeInTheDocument();
  });

  it('shopping list route renders consolidated list and per-recipe breakdown from mocked POST /api/shopping-list', async () => {
    const mockRecipes = [
      {
        id: 'r1',
        name: 'Pancakes',
        baseServings: 4,
        dietaryTags: [],
        ingredients: [
          {
            ingredientId: 'milk',
            displayName: 'Whole Milk',
            amount: 2,
            unit: 'cup',
            category: 'Volume',
          },
        ],
      },
    ];

    const mockShoppingResponse = {
      shoppingList: [
        {
          ingredientId: 'milk',
          displayName: 'Whole Milk',
          quantity: { amount: 473.176, unit: 'ml', category: 'Volume' },
          sourceRecipeIds: ['r1'],
          category: 'Dairy',
        },
      ],
      scaledRecipes: [
        {
          sourceRecipeId: 'r1',
          sourceRecipeName: 'Pancakes',
          targetServings: 4,
          scaleFactor: 1,
          ingredients: [
            {
              ingredientId: 'milk',
              displayName: 'Whole Milk',
              quantity: { amount: 2, unit: 'cup', category: 'Volume' },
            },
          ],
          dietaryTags: [],
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (url.toString().includes('/api/recipes')) {
        return recipesGetResponse(url.toString(), mockRecipes);
      }
      if (url.toString().endsWith('/api/shopping-list') && options?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockShoppingResponse,
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<App initialUser={TEST_USER} />);

    fireEvent.click(screen.getByRole('button', { name: /shopping list/i }));

    expect(await screen.findByText('Shopping List Builder')).toBeInTheDocument();
    expect(await screen.findByText('Pancakes')).toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox', { name: /select recipe pancakes/i });
    fireEvent.click(checkbox);

    fireEvent.click(screen.getByRole('button', { name: /build shopping list/i }));

    expect(await screen.findByText('Consolidated Shopping List')).toBeInTheDocument();
    expect(screen.getByText('473.18 ml')).toBeInTheDocument();
    expect(screen.getByText('Per-Recipe Scaled Breakdown')).toBeInTheDocument();
  });

  it('recategorizing an item in the build-mode shopping-list preview PUTs the override and re-builds the preview', async () => {
    const mockRecipes = [
      {
        id: 'r1',
        name: 'Pancakes',
        baseServings: 4,
        dietaryTags: [],
        ingredients: [
          {
            ingredientId: 'milk',
            displayName: 'Whole Milk',
            amount: 2,
            unit: 'cup',
            category: 'Volume',
          },
        ],
      },
    ];

    const buildResponse = (category: string, categoryIsOverridden: boolean) => ({
      shoppingList: [
        {
          ingredientId: 'milk',
          displayName: 'Whole Milk',
          quantity: { amount: 473.176, unit: 'ml', category: 'Volume' },
          sourceRecipeIds: ['r1'],
          category,
          categoryIsOverridden,
        },
      ],
      scaledRecipes: [
        {
          sourceRecipeId: 'r1',
          sourceRecipeName: 'Pancakes',
          targetServings: 4,
          scaleFactor: 1,
          ingredients: [
            {
              ingredientId: 'milk',
              displayName: 'Whole Milk',
              quantity: { amount: 2, unit: 'cup', category: 'Volume' },
            },
          ],
          dietaryTags: [],
        },
      ],
    });

    let buildCallCount = 0;
    let putBody: unknown = null;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (url.toString().includes('/api/recipes')) {
        return recipesGetResponse(url.toString(), mockRecipes);
      }
      if (url.toString().endsWith('/api/shopping-list') && options?.method === 'POST') {
        buildCallCount += 1;
        const response =
          buildCallCount === 1
            ? buildResponse('Dairy', false)
            : buildResponse('Pantry Staples', true);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => response,
        } as Response;
      }
      if (url.toString().endsWith('/api/ingredient-categories/milk') && options?.method === 'PUT') {
        putBody = JSON.parse(options.body as string);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ingredientId: 'milk', category: 'Pantry Staples' }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<App initialUser={TEST_USER} />);

    fireEvent.click(screen.getByRole('button', { name: /shopping list/i }));
    expect(await screen.findByText('Pancakes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /select recipe pancakes/i }));
    fireEvent.click(screen.getByRole('button', { name: /build shopping list/i }));

    expect(await screen.findByText('Consolidated Shopping List')).toBeInTheDocument();
    const categorySelect = screen.getByLabelText('Grocery category for Whole Milk');
    expect(categorySelect).toHaveValue('Dairy');

    fireEvent.change(categorySelect, { target: { value: 'Pantry Staples' } });

    await waitFor(() => {
      expect(putBody).toEqual({ category: 'Pantry Staples' });
    });

    // The preview re-built itself with the same recipe/servings selection after the
    // override succeeded, so the reset control (only shown once categoryIsOverridden) appears.
    await waitFor(() => {
      expect(buildCallCount).toBe(2);
    });
    expect(
      await screen.findByLabelText('Reset Whole Milk to its default category')
    ).toBeInTheDocument();
  });

  it('displays 404/400 error message from POST /api/shopping-list when request fails', async () => {
    const mockRecipes = [
      {
        id: 'r1',
        name: 'Pancakes',
        baseServings: 4,
        dietaryTags: [],
        ingredients: [
          {
            ingredientId: 'milk',
            displayName: 'Whole Milk',
            amount: 2,
            unit: 'cup',
            category: 'Volume',
          },
        ],
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (url.toString().includes('/api/recipes')) {
        return recipesGetResponse(url.toString(), mockRecipes);
      }
      if (url.toString().endsWith('/api/shopping-list') && options?.method === 'POST') {
        return {
          ok: false,
          status: 404,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            error: 'NotFound',
            message: 'Recipe not found: r1',
          }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<App initialUser={TEST_USER} />);

    fireEvent.click(screen.getByRole('button', { name: /shopping list/i }));

    expect(await screen.findByText('Pancakes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /select recipe pancakes/i }));
    fireEvent.click(screen.getByRole('button', { name: /build shopping list/i }));

    expect(await screen.findByText('Recipe not found: r1')).toBeInTheDocument();
  });

  it('saves a built shopping list (POST /api/shopping-lists), lists it, and toggling a checkbox calls PATCH', async () => {
    const mockRecipes = [
      {
        id: 'r1',
        name: 'Pancakes',
        baseServings: 4,
        dietaryTags: [],
        ingredients: [
          {
            ingredientId: 'milk',
            displayName: 'Whole Milk',
            amount: 2,
            unit: 'cup',
            category: 'Volume',
          },
        ],
      },
    ];

    const mockPreviewResponse = {
      shoppingList: [
        {
          ingredientId: 'milk',
          displayName: 'Whole Milk',
          quantity: { amount: 473.176, unit: 'ml', category: 'Volume' },
          sourceRecipeIds: ['r1'],
          category: 'Dairy',
        },
      ],
      scaledRecipes: [
        {
          sourceRecipeId: 'r1',
          sourceRecipeName: 'Pancakes',
          targetServings: 4,
          scaleFactor: 1,
          ingredients: [
            {
              ingredientId: 'milk',
              displayName: 'Whole Milk',
              quantity: { amount: 2, unit: 'cup', category: 'Volume' },
            },
          ],
          dietaryTags: [],
        },
      ],
    };

    const savedList = {
      id: 'list-1',
      name: 'Weekly Groceries',
      eventId: null,
      items: [
        {
          id: 'item-1',
          ingredientId: 'milk',
          displayName: 'Whole Milk',
          quantity: { amount: 473.176, unit: 'ml', category: 'Volume' },
          sourceRecipeIds: ['r1'],
          checked: false,
          category: 'Dairy',
        },
      ],
    };

    let postListsCalled = false;
    let patchCalled = false;
    let listSaved = false;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      const u = url.toString();
      if (u.includes('/api/recipes')) {
        return recipesGetResponse(u, mockRecipes);
      }
      if (u.endsWith('/api/shopping-list') && options?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockPreviewResponse,
        } as Response;
      }
      if (u.endsWith('/api/shopping-lists') && options?.method === 'POST') {
        postListsCalled = true;
        listSaved = true;
        return {
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => savedList,
        } as Response;
      }
      if (u.endsWith('/api/shopping-lists') && (!options?.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => (listSaved ? [savedList] : []),
        } as Response;
      }
      if (u.endsWith('/api/shopping-lists/list-1/items/item-1') && options?.method === 'PATCH') {
        patchCalled = true;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ id: 'item-1', checked: true }),
        } as Response;
      }
      if (u.endsWith('/api/shopping-lists/list-1')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            ...savedList,
            items: [{ ...savedList.items[0], checked: patchCalled }],
          }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<App initialUser={TEST_USER} />);

    fireEvent.click(screen.getByRole('button', { name: /shopping list/i }));

    expect(await screen.findByText('Pancakes')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/list name/i), {
      target: { value: 'Weekly Groceries' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /select recipe pancakes/i }));
    fireEvent.click(screen.getByRole('button', { name: /build shopping list/i }));

    const saveButton = await screen.findByRole('button', { name: /save shopping list/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(postListsCalled).toBe(true);
    });

    // Saving flips into view mode
    expect(await screen.findByText('Viewing: Weekly Groceries')).toBeInTheDocument();
    expect(await screen.findByText('Saved Shopping Lists (1)')).toBeInTheDocument();

    const itemCheckbox = await screen.findByRole('checkbox', {
      name: /mark whole milk as purchased/i,
    });
    fireEvent.click(itemCheckbox);

    await waitFor(() => {
      expect(patchCalled).toBe(true);
    });
  });

  it('checkbox toggle survives a transient PATCH failure via retry, without rolling back the optimistic check', async () => {
    const savedList = {
      id: 'list-1',
      name: 'Weekly Groceries',
      eventId: null,
      items: [
        {
          id: 'item-1',
          ingredientId: 'milk',
          displayName: 'Whole Milk',
          quantity: { amount: 473.176, unit: 'ml', category: 'Volume' },
          sourceRecipeIds: ['r1'],
          checked: false,
          category: 'Dairy',
        },
      ],
    };

    let patchAttempts = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      const u = url.toString();
      if (u.includes('/api/recipes')) {
        return recipesGetResponse(u, []);
      }
      if (u.endsWith('/api/shopping-lists') && (!options?.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => [savedList],
        } as Response;
      }
      if (u.endsWith('/api/shopping-lists/list-1/items/item-1') && options?.method === 'PATCH') {
        patchAttempts++;
        if (patchAttempts === 1) {
          // First attempt fails — simulates a spotty-connection fetch failure (browser still
          // reports itself online; this is a real fetch rejection, not an offline pause).
          throw new Error('Network request failed');
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ id: 'item-1', checked: true }),
        } as Response;
      }
      if (u.endsWith('/api/shopping-lists/list-1')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            ...savedList,
            items: [{ ...savedList.items[0], checked: patchAttempts > 1 }],
          }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<App initialUser={TEST_USER} />);

    fireEvent.click(screen.getByRole('button', { name: /shopping list/i }));
    fireEvent.click(await screen.findByText('Weekly Groceries'));

    const itemCheckbox = await screen.findByRole('checkbox', {
      name: /mark whole milk as purchased/i,
    });
    fireEvent.click(itemCheckbox);

    // Optimistic update flushes immediately (before either PATCH attempt resolves).
    await waitFor(() => {
      expect(itemCheckbox).toBeChecked();
    });

    // Retry succeeds; checkbox ends up checked — onError's rollback never fires, since it
    // only runs once retries are exhausted, not on an individual failed attempt.
    await waitFor(
      () => {
        expect(patchAttempts).toBeGreaterThanOrEqual(2);
      },
      { timeout: 5000 }
    );
    expect(itemCheckbox).toBeChecked();
  });

  it('checkbox toggle paused by a full offline state survives a simulated page reload and fires once back online', async () => {
    // Distinct from the transient-failure retry test above: this simulates the browser
    // genuinely reporting itself offline (onlineManager.setOnline(false)), which makes
    // TanStack Query pause the mutation entirely rather than attempt-and-fail it, PLUS a full
    // unmount/remount of <App /> (a real page reload would tear down all in-memory React/query
    // state) — proving the paused mutation survives via the localStorage persister + resumed
    // via queryClient.resumePausedMutations(), not just via in-memory pause/resume.
    const savedList = {
      id: 'list-1',
      name: 'Weekly Groceries',
      eventId: null,
      items: [
        {
          id: 'item-1',
          ingredientId: 'milk',
          displayName: 'Whole Milk',
          quantity: { amount: 473.176, unit: 'ml', category: 'Volume' },
          sourceRecipeIds: ['r1'],
          checked: false,
          category: 'Dairy',
        },
      ],
    };

    const patchCalls: Array<{ checked: boolean }> = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      const u = url.toString();
      if (u.includes('/api/recipes')) {
        return recipesGetResponse(u, []);
      }
      if (u.endsWith('/api/shopping-lists') && (!options?.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => [savedList],
        } as Response;
      }
      if (u.endsWith('/api/shopping-lists/list-1/items/item-1') && options?.method === 'PATCH') {
        const body = JSON.parse(options?.body as string) as { checked: boolean };
        patchCalls.push(body);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ id: 'item-1', checked: body.checked }),
        } as Response;
      }
      if (u.endsWith('/api/shopping-lists/list-1')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            ...savedList,
            items: [{ ...savedList.items[0], checked: patchCalls.length > 0 }],
          }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const firstRender = render(<App initialUser={TEST_USER} />);

    // Load the saved list while still online — a real user opens their list before losing
    // connectivity, not the other way around; the initial GET itself would also pause under
    // networkMode: 'online' if issued while offline.
    fireEvent.click(screen.getByRole('button', { name: /shopping list/i }));
    fireEvent.click(await screen.findByText('Weekly Groceries'));

    const itemCheckbox = await screen.findByRole('checkbox', {
      name: /mark whole milk as purchased/i,
    });

    onlineManager.setOnline(false);
    try {
      fireEvent.click(itemCheckbox);

      // Optimistic update flushes even while paused/offline.
      await waitFor(() => {
        expect(itemCheckbox).toBeChecked();
      });

      // Mutation is paused, not failed — no PATCH attempt yet.
      expect(patchCalls).toHaveLength(0);

      // Wait for the throttled persister write to flush the paused mutation to localStorage.
      await waitFor(
        () => {
          const persisted = Object.keys(window.localStorage).some((key) =>
            (window.localStorage.getItem(key) || '').includes('toggleShoppingListItemChecked')
          );
          expect(persisted).toBe(true);
        },
        { timeout: 3000 }
      );

      // Simulate a page reload: tear down all in-memory React/query state.
      firstRender.unmount();
    } finally {
      onlineManager.setOnline(true);
    }

    // Fresh mount == fresh QueryClient, rehydrated only from localStorage.
    render(<App initialUser={TEST_USER} />);

    await waitFor(
      () => {
        expect(patchCalls).toHaveLength(1);
      },
      { timeout: 5000 }
    );
    expect(patchCalls[0]).toEqual({ checked: true });
  });

  it("RecipeList's paginated fetch and the shared full-list fetch (ShoppingListBuilder/EventPlanner) are each cached independently across tab switches", async () => {
    // Two genuinely separate caches by design: RecipeList uses useRecipesPage() (paginated,
    // ?limit=... in the URL), while ShoppingListBuilder/EventPlanner still share the original
    // unpaginated useRecipes() — they need the FULL catalog as a selector, not a page of it.
    let paginatedFetchCount = 0;
    let sharedFetchCount = 0;
    const mockRecipes = [
      {
        id: 'r1',
        name: 'Shared Pancakes',
        baseServings: 4,
        dietaryTags: [],
        ingredients: [],
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url.toString().includes('/api/recipes')) {
        if (url.toString().includes('limit=')) {
          paginatedFetchCount++;
        } else {
          sharedFetchCount++;
        }
        return recipesGetResponse(url.toString(), mockRecipes);
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<App initialUser={TEST_USER} />);

    // 1. Initial load on /recipes tab -> RecipeList's paginated query fetches once.
    expect(await screen.findByText('Shared Pancakes')).toBeInTheDocument();
    expect(paginatedFetchCount).toBe(1);
    expect(sharedFetchCount).toBe(0);

    // 2. Switch to /shopping-list tab -> ShoppingListBuilder's first-ever call to the shared,
    // unpaginated query — a genuinely new fetch (it was never called in step 1).
    fireEvent.click(screen.getByRole('button', { name: /shopping list/i }));
    expect(await screen.findByText('Shopping List Builder')).toBeInTheDocument();
    expect(await screen.findByText('Shared Pancakes')).toBeInTheDocument();
    expect(paginatedFetchCount).toBe(1);
    expect(sharedFetchCount).toBe(1);

    // 3. Switch to /event-planner tab -> EventPlanner shares the same unpaginated query as
    // ShoppingListBuilder, so this reuses the cache with 0 additional fetches.
    fireEvent.click(screen.getByRole('button', { name: /event planner/i }));
    expect(await screen.findByText('Shared Pancakes')).toBeInTheDocument();
    expect(paginatedFetchCount).toBe(1);
    expect(sharedFetchCount).toBe(1);

    // 4. Switch back to /recipes tab -> RecipeList's own paginated cache is reused too, 0
    // additional fetches.
    fireEvent.click(screen.getByRole('button', { name: 'Recipes' }));
    expect(await screen.findByText('Create New Recipe')).toBeInTheDocument();
    expect(paginatedFetchCount).toBe(1);
    expect(sharedFetchCount).toBe(1);
  });

  it('clicking Edit on a recipe card pre-fills RecipeForm with existing data', async () => {
    const mockRecipes = [
      {
        id: 'r1',
        name: 'Pre-filled Pancake',
        baseServings: 4,
        dietaryTags: ['Vegan'],
        ingredients: [
          {
            ingredientId: 'flour',
            displayName: 'Flour',
            amount: 2,
            unit: 'cup',
            category: 'Volume',
          },
        ],
        steps: [],
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url.toString().includes('/api/recipes')) {
        return recipesGetResponse(url.toString(), mockRecipes);
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<App initialUser={TEST_USER} />);

    expect(await screen.findByText('Pre-filled Pancake')).toBeInTheDocument();

    const editBtn = screen.getByRole('button', { name: /edit recipe pre-filled pancake/i });
    fireEvent.click(editBtn);

    expect(await screen.findByText('Edit Recipe: Pre-filled Pancake')).toBeInTheDocument();
    expect(screen.getByLabelText(/recipe name/i)).toHaveValue('Pre-filled Pancake');
    expect(screen.getByLabelText(/base servings/i)).toHaveValue(4);
  });

  it('submitting an edit calls PUT (not POST) and updates recipe on success', async () => {
    let putCalled = false;
    let capturedMethod = '';
    let capturedBody: unknown = null;

    const mockRecipes = [
      {
        id: 'r1',
        name: 'Old Pancake Name',
        baseServings: 2,
        dietaryTags: [],
        ingredients: [
          { ingredientId: 'milk', displayName: 'Milk', amount: 1, unit: 'cup', category: 'Volume' },
        ],
        steps: [],
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (url.toString().endsWith('/api/recipes/r1') && options?.method === 'PUT') {
        putCalled = true;
        capturedMethod = options.method;
        capturedBody = JSON.parse(options.body as string);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            id: 'r1',
            name: 'Updated Pancake Name',
            baseServings: 6,
            dietaryTags: [],
            ingredients: [
              {
                ingredientId: 'milk',
                displayName: 'Milk',
                amount: 3,
                unit: 'cup',
                category: 'Volume',
              },
            ],
          }),
        } as Response;
      }
      if (url.toString().includes('/api/recipes')) {
        return recipesGetResponse(url.toString(), mockRecipes);
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<App initialUser={TEST_USER} />);

    expect(await screen.findByText('Old Pancake Name')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /edit recipe old pancake name/i }));
    expect(await screen.findByText('Edit Recipe: Old Pancake Name')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/recipe name/i), {
      target: { value: 'Updated Pancake Name' },
    });
    fireEvent.change(screen.getByLabelText(/base servings/i), {
      target: { value: '6' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(putCalled).toBe(true);
      expect(capturedMethod).toBe('PUT');
      expect(capturedBody).toEqual({
        name: 'Updated Pancake Name',
        baseServings: 6,
        dietaryTags: [],
        ingredients: [{ ingredientId: 'milk', displayName: 'Milk', amount: 1, unit: 'cup' }],
        steps: [],
      });
    });
  });

  it('clicking Delete requires confirmation before firing DELETE request', async () => {
    let deleteCalled = false;
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false); // User cancels confirm!

    const mockRecipes = [
      {
        id: 'r1',
        name: 'Safe Recipe',
        baseServings: 2,
        dietaryTags: [],
        ingredients: [],
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (url.toString().endsWith('/api/recipes/r1') && options?.method === 'DELETE') {
        deleteCalled = true;
        return { ok: true, status: 204 } as Response;
      }
      if (url.toString().includes('/api/recipes')) {
        return recipesGetResponse(url.toString(), mockRecipes);
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<App initialUser={TEST_USER} />);

    expect(await screen.findByText('Safe Recipe')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /delete recipe safe recipe/i }));

    expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete "Safe Recipe"?');
    expect(deleteCalled).toBe(false); // API call was NOT made because confirm was cancelled!
  });

  it('confirming Delete fires DELETE request and removes recipe from list', async () => {
    let deleteCalled = false;
    vi.spyOn(window, 'confirm').mockReturnValue(true); // User approves confirm!

    const mockRecipes = [
      {
        id: 'r1',
        name: 'Doomed Recipe',
        baseServings: 2,
        dietaryTags: [],
        ingredients: [],
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (url.toString().endsWith('/api/recipes/r1') && options?.method === 'DELETE') {
        deleteCalled = true;
        return { ok: true, status: 204 } as Response;
      }
      if (url.toString().includes('/api/recipes')) {
        return recipesGetResponse(url.toString(), deleteCalled ? [] : mockRecipes);
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<App initialUser={TEST_USER} />);

    expect(await screen.findByText('Doomed Recipe')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /delete recipe doomed recipe/i }));

    await waitFor(() => {
      expect(deleteCalled).toBe(true);
    });
  });

  describe('Event Planner UI Tests', () => {
    it('submitting the event planner form calls POST /api/events/plan with expected payload shape and renders included, excluded, and shopping list results', async () => {
      let capturedBody: unknown = null;
      const mockRecipes = [
        {
          id: 'r-meat',
          name: 'Beef Roast',
          baseServings: 6,
          dietaryTags: [],
          ingredients: [
            {
              ingredientId: 'beef',
              displayName: 'Beef',
              amount: 1,
              unit: 'kg',
              category: 'Mass',
            },
          ],
        },
        {
          id: 'r-steak',
          name: 'Steak Dinner',
          baseServings: 2,
          dietaryTags: [],
          ingredients: [
            {
              ingredientId: 'beef',
              displayName: 'Steak',
              amount: 2,
              unit: 'lb',
              category: 'Mass',
            },
          ],
        },
      ];

      const mockEventPlanResponse = {
        guestGroup: {
          totalGuests: 12,
          vegetarianCount: 3,
          veganCount: 1,
          omnivoreCount: 9,
        },
        includedRecipes: [
          {
            recipeId: 'r-meat',
            recipeName: 'Beef Roast',
            eligibleServings: 9,
            scaledIngredients: [
              {
                ingredientId: 'beef',
                displayName: 'Beef',
                quantity: { amount: 1.5, unit: 'kg', category: 'Mass' },
              },
            ],
          },
        ],
        excludedRecipes: [
          {
            recipeId: 'r-steak',
            recipeName: 'Steak Dinner',
            reason:
              'No eligible guests: recipe has no vegetarian/vegan tags and all guests have dietary restrictions.',
          },
        ],
        shoppingList: [
          {
            ingredientId: 'beef',
            displayName: 'Beef',
            quantity: { amount: 1.5, unit: 'kg', category: 'Mass' },
            sourceRecipeIds: ['r-meat'],
            category: 'Meat',
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), mockRecipes);
        }
        if (url.toString().endsWith('/api/events/plan') && options?.method === 'POST') {
          capturedBody = JSON.parse(options.body as string);
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => mockEventPlanResponse,
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      // Switch to Event Planner tab
      fireEvent.click(screen.getByRole('button', { name: /event planner/i }));

      expect(
        await screen.findByText('1. Event Name, Guest Breakdown & Recipe Selection')
      ).toBeInTheDocument();
      expect(await screen.findByText('Beef Roast')).toBeInTheDocument();

      // Change guest group inputs
      fireEvent.change(screen.getByLabelText(/total guests/i), {
        target: { value: '12' },
      });
      fireEvent.change(screen.getByLabelText(/vegetarian guests/i), {
        target: { value: '3' },
      });
      fireEvent.change(screen.getByLabelText(/vegan guests/i), {
        target: { value: '1' },
      });

      // Select both recipes
      fireEvent.click(screen.getByRole('checkbox', { name: /select recipe beef roast/i }));
      fireEvent.click(screen.getByRole('checkbox', { name: /select recipe steak dinner/i }));

      // Submit form
      fireEvent.click(screen.getByRole('button', { name: /plan event shopping list/i }));

      await waitFor(() => {
        expect(capturedBody).toEqual({
          recipeIds: ['r-meat', 'r-steak'],
          guestGroup: {
            totalGuests: 12,
            vegetarianCount: 3,
            veganCount: 1,
          },
        });
      });

      // Verify Included Recipes section
      expect(await screen.findByText('Included Recipes')).toBeInTheDocument();
      expect(screen.getByText('serves 9 guests')).toBeInTheDocument();

      // Verify Excluded Recipes section with reason text
      expect(screen.getByText('Excluded Recipes')).toBeInTheDocument();
      expect(
        screen.getByText(
          'No eligible guests: recipe has no vegetarian/vegan tags and all guests have dietary restrictions.'
        )
      ).toBeInTheDocument();

      // Verify Consolidated Event Shopping List section
      expect(screen.getByText('Consolidated Event Shopping List')).toBeInTheDocument();
      expect(screen.getByText('1.5 kg')).toBeInTheDocument();
    });

    it('recategorizing an item in the event-plan preview PUTs the override and re-plans with the same inputs', async () => {
      const mockRecipes = [
        {
          id: 'r-meat',
          name: 'Beef Roast',
          baseServings: 6,
          dietaryTags: [],
          ingredients: [
            { ingredientId: 'beef', displayName: 'Beef', amount: 1, unit: 'kg', category: 'Mass' },
          ],
        },
      ];

      const planResponse = (category: string, categoryIsOverridden: boolean) => ({
        guestGroup: { totalGuests: 10, vegetarianCount: 0, veganCount: 0, omnivoreCount: 10 },
        includedRecipes: [
          {
            recipeId: 'r-meat',
            recipeName: 'Beef Roast',
            eligibleServings: 10,
            scaledIngredients: [
              {
                ingredientId: 'beef',
                displayName: 'Beef',
                quantity: { amount: 1.67, unit: 'kg', category: 'Mass' },
              },
            ],
          },
        ],
        excludedRecipes: [],
        shoppingList: [
          {
            ingredientId: 'beef',
            displayName: 'Beef',
            quantity: { amount: 1.67, unit: 'kg', category: 'Mass' },
            sourceRecipeIds: ['r-meat'],
            category,
            categoryIsOverridden,
          },
        ],
      });

      let planCallCount = 0;
      let putBody: unknown = null;

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), mockRecipes);
        }
        if (url.toString().endsWith('/api/events/plan') && options?.method === 'POST') {
          planCallCount += 1;
          const response =
            planCallCount === 1 ? planResponse('Meat', false) : planResponse('Frozen', true);
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => response,
          } as Response;
        }
        if (
          url.toString().endsWith('/api/ingredient-categories/beef') &&
          options?.method === 'PUT'
        ) {
          putBody = JSON.parse(options.body as string);
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ ingredientId: 'beef', category: 'Frozen' }),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /event planner/i }));
      expect(await screen.findByText('Beef Roast')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('checkbox', { name: /select recipe beef roast/i }));
      fireEvent.click(screen.getByRole('button', { name: /plan event shopping list/i }));

      expect(await screen.findByText('Consolidated Event Shopping List')).toBeInTheDocument();
      const categorySelect = screen.getByLabelText('Grocery category for Beef');
      expect(categorySelect).toHaveValue('Meat');

      fireEvent.change(categorySelect, { target: { value: 'Frozen' } });

      await waitFor(() => {
        expect(putBody).toEqual({ category: 'Frozen' });
      });

      await waitFor(() => {
        expect(planCallCount).toBe(2);
      });
      expect(
        await screen.findByLabelText('Reset Beef to its default category')
      ).toBeInTheDocument();
    });

    it('displays 400 error message (invalid guest group) from POST /api/events/plan', async () => {
      const mockRecipes = [
        {
          id: 'r1',
          name: 'Pancakes',
          baseServings: 4,
          dietaryTags: [],
          ingredients: [],
        },
      ];

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), mockRecipes);
        }
        if (url.toString().endsWith('/api/events/plan') && options?.method === 'POST') {
          return {
            ok: false,
            status: 400,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              error: 'InvalidGuestGroupError',
              message: 'veganCount (5) cannot exceed vegetarianCount (2)',
            }),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /event planner/i }));

      expect(await screen.findByText('Pancakes')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('checkbox', { name: /select recipe pancakes/i }));
      fireEvent.click(screen.getByRole('button', { name: /plan event shopping list/i }));

      expect(
        await screen.findByText('veganCount (5) cannot exceed vegetarianCount (2)')
      ).toBeInTheDocument();
    });

    it('displays 404 error message (missing recipe) from POST /api/events/plan', async () => {
      const mockRecipes = [
        {
          id: 'r1',
          name: 'Pancakes',
          baseServings: 4,
          dietaryTags: [],
          ingredients: [],
        },
      ];

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), mockRecipes);
        }
        if (url.toString().endsWith('/api/events/plan') && options?.method === 'POST') {
          return {
            ok: false,
            status: 404,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              error: 'NotFound',
              message: 'Recipe with id "missing-id-999" not found.',
            }),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /event planner/i }));

      expect(await screen.findByText('Pancakes')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('checkbox', { name: /select recipe pancakes/i }));
      fireEvent.click(screen.getByRole('button', { name: /plan event shopping list/i }));

      expect(
        await screen.findByText('Recipe with id "missing-id-999" not found.')
      ).toBeInTheDocument();
    });

    it('saves a previewed event (POST /api/events), lists it, and viewing it fetches the recomputed detail (GET /api/events/:id)', async () => {
      const mockRecipes = [
        {
          id: 'r-meat',
          name: 'Beef Roast',
          baseServings: 6,
          dietaryTags: [],
          ingredients: [
            { ingredientId: 'beef', displayName: 'Beef', amount: 1, unit: 'kg', category: 'Mass' },
          ],
        },
      ];

      const mockPlanResponse = {
        guestGroup: { totalGuests: 10, vegetarianCount: 0, veganCount: 0, omnivoreCount: 10 },
        includedRecipes: [
          {
            recipeId: 'r-meat',
            recipeName: 'Beef Roast',
            eligibleServings: 10,
            scaledIngredients: [
              {
                ingredientId: 'beef',
                displayName: 'Beef',
                quantity: { amount: 1.67, unit: 'kg', category: 'Mass' },
              },
            ],
          },
        ],
        excludedRecipes: [],
        shoppingList: [
          {
            ingredientId: 'beef',
            displayName: 'Beef',
            quantity: { amount: 1.67, unit: 'kg', category: 'Mass' },
            sourceRecipeIds: ['r-meat'],
            category: 'Meat',
          },
        ],
      };

      const savedEventSummary = {
        id: 'event-1',
        name: 'Thanksgiving 2026',
        guestGroup: mockPlanResponse.guestGroup,
        recipeIds: ['r-meat'],
        shoppingListId: null,
      };

      let postEventsCalled = false;
      let getEventByIdCalled = false;

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        const u = url.toString();
        if (u.includes('/api/recipes') && !u.includes('events')) {
          return recipesGetResponse(u, mockRecipes);
        }
        if (u.endsWith('/api/events/plan') && options?.method === 'POST') {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => mockPlanResponse,
          } as Response;
        }
        if (u.endsWith('/api/events') && options?.method === 'POST') {
          postEventsCalled = true;
          return {
            ok: true,
            status: 201,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ ...savedEventSummary, ...mockPlanResponse, droppedRecipeIds: [] }),
          } as Response;
        }
        if (u.endsWith('/api/events') && (!options?.method || options.method === 'GET')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => [savedEventSummary],
          } as Response;
        }
        if (u.endsWith('/api/events/event-1')) {
          getEventByIdCalled = true;
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ ...savedEventSummary, ...mockPlanResponse, droppedRecipeIds: [] }),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /event planner/i }));

      expect(await screen.findByText('Beef Roast')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText(/event name/i), {
        target: { value: 'Thanksgiving 2026' },
      });
      fireEvent.change(screen.getByLabelText(/total guests/i), { target: { value: '10' } });
      fireEvent.click(screen.getByRole('checkbox', { name: /select recipe beef roast/i }));
      fireEvent.click(screen.getByRole('button', { name: /plan event shopping list/i }));

      // "Save Event" only appears once a preview exists
      const saveButton = await screen.findByRole('button', { name: /save event/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(postEventsCalled).toBe(true);
      });

      // Saving flips the planner into view mode, showing the saved event's title
      expect(await screen.findByText('Editing: Thanksgiving 2026')).toBeInTheDocument();

      // The saved event now appears in the EventList above
      expect(await screen.findByText('Saved Events (1)')).toBeInTheDocument();

      await waitFor(() => {
        expect(getEventByIdCalled).toBe(true);
      });
    });

    it('updating a saved event calls PUT /api/events/:id, and deleting it calls DELETE and exits view mode', async () => {
      const savedEvent = {
        id: 'event-1',
        name: 'Old Name',
        guestGroup: { totalGuests: 10, vegetarianCount: 0, veganCount: 0, omnivoreCount: 10 },
        recipeIds: [],
        shoppingListId: null,
        includedRecipes: [],
        excludedRecipes: [],
        shoppingList: [],
        droppedRecipeIds: [],
      };

      let putCalled = false;
      let deleteCalled = false;
      let eventDeleted = false;

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        const u = url.toString();
        if (u.includes('/api/recipes') && !u.includes('events')) {
          return recipesGetResponse(u, []);
        }
        if (u.endsWith('/api/events') && (!options?.method || options.method === 'GET')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => (eventDeleted ? [] : [savedEvent]),
          } as Response;
        }
        if (u.endsWith('/api/events/event-1') && options?.method === 'PUT') {
          putCalled = true;
          const updated = { ...savedEvent, name: 'New Name' };
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => updated,
          } as Response;
        }
        if (u.endsWith('/api/events/event-1') && options?.method === 'DELETE') {
          deleteCalled = true;
          eventDeleted = true;
          return { ok: true, status: 204, headers: new Headers() } as Response;
        }
        if (u.endsWith('/api/events/event-1')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => (putCalled ? { ...savedEvent, name: 'New Name' } : savedEvent),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });

      vi.spyOn(window, 'confirm').mockReturnValue(true);

      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /event planner/i }));

      const eventCard = await screen.findByText('Old Name');
      fireEvent.click(eventCard);

      expect(await screen.findByText('Editing: Old Name')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/event name/i), { target: { value: 'New Name' } });
      fireEvent.click(screen.getByRole('button', { name: /^update event$/i }));

      await waitFor(() => {
        expect(putCalled).toBe(true);
      });

      fireEvent.click(screen.getByRole('button', { name: /^delete event$/i }));

      await waitFor(() => {
        expect(deleteCalled).toBe(true);
      });

      // Deleting the currently-viewed event exits view mode (back to create-mode copy)
      expect(
        await screen.findByText(
          'Plan recipes and consolidated shopping lists tailored to guest counts and dietary restrictions.'
        )
      ).toBeInTheDocument();
    });
  });

  describe('AI Recipe Import UI Tests', () => {
    it('submits text to import UI (POST /api/recipes/import-text) and pre-fills form fields without auto-persisting', async () => {
      let importCallBody: unknown = null;
      let postRecipesCalled = false;

      const mockDraft = {
        name: "Grandma's Pancakes",
        baseServings: 4,
        dietaryTags: ['Vegetarian'],
        ingredients: [
          { ingredientId: 'flour', displayName: 'Flour', amount: 2, unit: 'cup' },
          { ingredientId: 'egg', displayName: 'Eggs', amount: 2, unit: 'egg' },
        ],
        instructions: [
          { instruction: 'Mix dry ingredients.', duration: null, temperature: null },
          {
            instruction: 'Whisk in eggs and cook on a griddle.',
            duration: { amount: 5, unit: 'minutes' },
            temperature: null,
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes/import-text') && options?.method === 'POST') {
          importCallBody = JSON.parse(options.body as string);
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => mockDraft,
          } as Response;
        }
        if (url.toString().endsWith('/api/recipes') && options?.method === 'POST') {
          postRecipesCalled = true;
          return {
            ok: true,
            status: 201,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ id: 'r-new', ...mockDraft }),
          } as Response;
        }
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), []);
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      // Open import section
      fireEvent.click(screen.getByRole('button', { name: /paste recipe text/i }));

      const textarea = screen.getByLabelText(/paste unformatted recipe text below/i);
      fireEvent.change(textarea, { target: { value: 'Grandma Pancakes text...' } });

      // Click "Import with AI"
      const importButton = screen.getByRole('button', { name: /import with ai/i });
      expect(importButton).toHaveAttribute('type', 'button');
      fireEvent.click(importButton);

      // Verify POST /api/recipes/import-text was called
      await waitFor(() => {
        expect(importCallBody).toEqual({ text: 'Grandma Pancakes text...' });
      });

      // Verify fields pre-filled using toHaveValue()
      const nameInput = screen.getByLabelText(/recipe name/i);
      const servingsInput = screen.getByLabelText(/base servings/i);
      expect(nameInput).toHaveValue("Grandma's Pancakes");
      expect(servingsInput).toHaveValue(4);

      // Verify AI-extracted instructions pre-filled the step editor
      expect(screen.getByLabelText('Step 1')).toHaveValue('Mix dry ingredients.');
      expect(screen.getByLabelText('Step 2')).toHaveValue('Whisk in eggs and cook on a griddle.');

      // Verify review notice displayed
      expect(screen.getByText(/imported via ai — please review all fields/i)).toBeInTheDocument();

      // Verify import textarea is cleared
      expect(textarea).toHaveValue('');

      // CRITICAL ASSERTION: POST /api/recipes was NOT called automatically
      expect(postRecipesCalled).toBe(false);

      // Now click "Create Recipe" explicitly
      const createButton = screen.getByRole('button', { name: /create recipe/i });
      expect(createButton).toHaveAttribute('type', 'submit');
      fireEvent.click(createButton);

      // Verify POST /api/recipes was only called AFTER clicking Create Recipe
      await waitFor(() => {
        expect(postRecipesCalled).toBe(true);
      });
    });

    it('displays real API error message for 400 (empty or invalid request body)', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes/import-text') && options?.method === 'POST') {
          return {
            ok: false,
            status: 400,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              error: 'BadRequest',
              message: 'Request body must contain a non-empty "text" string.',
            }),
          } as Response;
        }
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), []);
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /paste recipe text/i }));
      const textarea = screen.getByLabelText(/paste unformatted recipe text below/i);

      // Test client-side disabled state on whitespace
      fireEvent.change(textarea, { target: { value: '   ' } });
      const importButton = screen.getByRole('button', { name: /import with ai/i });
      expect(importButton).toBeDisabled();

      // Test API 400 error display
      fireEvent.change(textarea, { target: { value: 'Some recipe text' } });
      fireEvent.click(importButton);

      expect(
        await screen.findByText(/request body must contain a non-empty "text" string/i)
      ).toBeInTheDocument();
    });

    it('displays real API error message for 500 (server not configured)', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes/import-text') && options?.method === 'POST') {
          return {
            ok: false,
            status: 500,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              error: 'ServerConfigurationError',
              message: 'Server is not configured for AI recipe import: GEMINI_API_KEY is missing.',
            }),
          } as Response;
        }
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), []);
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /paste recipe text/i }));
      const textarea = screen.getByLabelText(/paste unformatted recipe text below/i);
      fireEvent.change(textarea, { target: { value: 'Pancakes text' } });
      fireEvent.click(screen.getByRole('button', { name: /import with ai/i }));

      expect(
        await screen.findByText(
          /server is not configured for ai recipe import: gemini_api_key is missing/i
        )
      ).toBeInTheDocument();
    });

    it('displays real API error message for 502 (malformed Gemini response)', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes/import-text') && options?.method === 'POST') {
          return {
            ok: false,
            status: 502,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              error: 'BadGateway',
              message: 'Upstream AI service returned invalid JSON response.',
            }),
          } as Response;
        }
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), []);
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /paste recipe text/i }));
      const textarea = screen.getByLabelText(/paste unformatted recipe text below/i);
      fireEvent.change(textarea, { target: { value: 'Bad text' } });
      fireEvent.click(screen.getByRole('button', { name: /import with ai/i }));

      expect(
        await screen.findByText(/upstream ai service returned invalid json response/i)
      ).toBeInTheDocument();
    });

    it('displays real API error message for 422 (domain validation error)', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes/import-text') && options?.method === 'POST') {
          return {
            ok: false,
            status: 422,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              error: 'InvalidUnitError',
              message:
                'Invalid unit: "pinch". Supported units are g, kg, oz, lb, ml, l, tsp, tbsp, cup, fl oz, count, clove, egg, onion.',
            }),
          } as Response;
        }
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), []);
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /paste recipe text/i }));
      const textarea = screen.getByLabelText(/paste unformatted recipe text below/i);
      fireEvent.change(textarea, { target: { value: 'Pinch of salt text' } });
      fireEvent.click(screen.getByRole('button', { name: /import with ai/i }));

      expect(await screen.findByText(/invalid unit: "pinch"/i)).toBeInTheDocument();
    });

    it('does NOT render import section when RecipeForm is in edit mode', () => {
      const queryClient = new QueryClient();
      const existingRecipe = {
        id: 'r100',
        name: 'Existing Dish',
        baseServings: 2,
        dietaryTags: [],
        ingredients: [
          { ingredientId: 'salt', displayName: 'Salt', amount: 1, unit: 'g', category: 'Mass' },
        ],
        steps: [],
      };

      render(
        <QueryClientProvider client={queryClient}>
          <RecipeForm recipe={existingRecipe} />
        </QueryClientProvider>
      );

      expect(screen.queryByText(/import recipe with ai/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /paste recipe text/i })).not.toBeInTheDocument();
    });
  });

  describe('AI Recipe URL Import UI Tests', () => {
    it('submits URL to import UI (POST /api/recipes/import-url) and pre-fills form fields without auto-persisting', async () => {
      let importUrlCalled = false;
      let capturedUrl = '';
      let postRecipesCalled = false;

      const mockDraft = {
        name: 'URL Pancakes',
        baseServings: 4,
        dietaryTags: ['Vegetarian'],
        ingredients: [
          { ingredientId: 'flour', displayName: 'Flour', amount: 2, unit: 'cup' },
          { ingredientId: 'milk', displayName: 'Milk', amount: 1, unit: 'cup' },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes/import-url') && options?.method === 'POST') {
          importUrlCalled = true;
          const body = JSON.parse(options.body as string);
          capturedUrl = body.url;
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => mockDraft,
          } as Response;
        }
        if (url.toString().includes('/api/recipes') && options?.method === 'POST') {
          postRecipesCalled = true;
          return { ok: false, status: 500 } as Response;
        }
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), []);
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /paste recipe text/i }));
      fireEvent.click(screen.getByRole('button', { name: /url link/i }));

      const urlInput = screen.getByLabelText(/enter recipe webpage url below/i);
      fireEvent.change(urlInput, { target: { value: 'https://example.com/pancakes' } });

      const importButton = screen.getByRole('button', { name: /import from url/i });
      expect(importButton).toHaveAttribute('type', 'button');

      fireEvent.click(importButton);

      await waitFor(() => {
        expect(importUrlCalled).toBe(true);
        expect(capturedUrl).toBe('https://example.com/pancakes');
      });

      expect(await screen.findByDisplayValue('URL Pancakes')).toBeInTheDocument();
      expect(screen.getByDisplayValue('4')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Flour')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Milk')).toBeInTheDocument();

      // CRITICAL: confirm POST /api/recipes was NOT called automatically
      expect(postRecipesCalled).toBe(false);

      expect(screen.getByText(/imported via ai — please review all fields/i)).toBeInTheDocument();
    });

    it('pressing Enter in the URL input triggers URL import and does NOT submit the RecipeForm', async () => {
      let importUrlCalled = false;
      let postRecipesCalled = false;

      const mockDraft = {
        name: 'Enter Key Waffles',
        baseServings: 2,
        dietaryTags: [],
        ingredients: [{ ingredientId: 'flour', displayName: 'Flour', amount: 1, unit: 'cup' }],
      };

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes/import-url') && options?.method === 'POST') {
          importUrlCalled = true;
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => mockDraft,
          } as Response;
        }
        if (url.toString().includes('/api/recipes') && options?.method === 'POST') {
          postRecipesCalled = true;
          return { ok: false, status: 500 } as Response;
        }
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), []);
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /paste recipe text/i }));
      fireEvent.click(screen.getByRole('button', { name: /url link/i }));

      const urlInput = screen.getByLabelText(/enter recipe webpage url below/i);
      fireEvent.change(urlInput, { target: { value: 'https://example.com/waffles' } });

      // Press Enter inside URL input
      fireEvent.keyDown(urlInput, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(importUrlCalled).toBe(true);
      });

      // Confirm form creation endpoint was NOT triggered by Enter key
      expect(postRecipesCalled).toBe(false);
      expect(await screen.findByDisplayValue('Enter Key Waffles')).toBeInTheDocument();
    });

    it('displays error message when URL import returns 502 (NoRecipeFound / extraction failure)', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes/import-url') && options?.method === 'POST') {
          return {
            ok: false,
            status: 502,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              error: 'ExtractionError',
              message:
                'The provided text does not contain explicit recipe ingredients or quantities.',
            }),
          } as Response;
        }
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), []);
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /paste recipe text/i }));
      fireEvent.click(screen.getByRole('button', { name: /url link/i }));

      const urlInput = screen.getByLabelText(/enter recipe webpage url below/i);
      fireEvent.change(urlInput, { target: { value: 'https://en.wikipedia.org/wiki/Pancake' } });

      const importButton = screen.getByRole('button', { name: /import from url/i });
      fireEvent.click(importButton);

      expect(
        await screen.findByText(
          /the provided text does not contain explicit recipe ingredients or quantities/i
        )
      ).toBeInTheDocument();
    });

    it('displays error message when URL import returns 400 (SSRF / invalid URL) without leaking internal IP or hop count details', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes/import-url') && options?.method === 'POST') {
          return {
            ok: false,
            status: 400,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              error: 'SsrfValidationError',
              message: 'Access to hostname "localhost" is forbidden.',
            }),
          } as Response;
        }
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), []);
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /paste recipe text/i }));
      fireEvent.click(screen.getByRole('button', { name: /url link/i }));

      const urlInput = screen.getByLabelText(/enter recipe webpage url below/i);
      fireEvent.change(urlInput, { target: { value: 'http://localhost:3001' } });

      const importButton = screen.getByRole('button', { name: /import from url/i });
      fireEvent.click(importButton);

      expect(
        await screen.findByText(/access to hostname "localhost" is forbidden/i)
      ).toBeInTheDocument();
    });

    it('displays clean generic error message when URL import returns 500 (Internal Server Error)', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes/import-url') && options?.method === 'POST') {
          return {
            ok: false,
            status: 500,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              error: 'InternalServerError',
              message: 'Server error: GEMINI_API_KEY is missing or invalid.',
            }),
          } as Response;
        }
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), []);
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /paste recipe text/i }));
      fireEvent.click(screen.getByRole('button', { name: /url link/i }));

      const urlInput = screen.getByLabelText(/enter recipe webpage url below/i);
      fireEvent.change(urlInput, { target: { value: 'https://example.com/recipe' } });

      const importButton = screen.getByRole('button', { name: /import from url/i });
      fireEvent.click(importButton);

      expect(
        await screen.findByText(/server error: gemini_api_key is missing or invalid/i)
      ).toBeInTheDocument();
    });
  });

  describe('AI Recipe Image Import UI Tests', () => {
    beforeEach(() => {
      if (!globalThis.URL.createObjectURL) {
        globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-image-url');
      }
      if (!globalThis.URL.revokeObjectURL) {
        globalThis.URL.revokeObjectURL = vi.fn();
      }
    });

    it('submits image file to import UI (POST /api/recipes/import-image) and pre-fills form fields without auto-persisting', async () => {
      let importImageCalled = false;
      let postRecipesCalled = false;

      const mockDraft = {
        name: 'Shortcake Recipe',
        baseServings: 6,
        dietaryTags: ['Vegetarian'],
        ingredients: [
          { ingredientId: 'flour', displayName: 'Flour', amount: 3, unit: 'cup' },
          { ingredientId: 'sugar', displayName: 'Sugar', amount: 1, unit: 'cup' },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes/import-image') && options?.method === 'POST') {
          importImageCalled = true;
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => mockDraft,
          } as Response;
        }
        if (url.toString().includes('/api/recipes') && options?.method === 'POST') {
          postRecipesCalled = true;
          return { ok: false, status: 500 } as Response;
        }
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), []);
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /paste recipe text/i }));
      fireEvent.click(screen.getByRole('button', { name: /upload image/i }));

      const file = new File(['dummy content'], 'shortcake.png', { type: 'image/png' });
      const fileInput = document.getElementById('import-image-input') as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files: [file] } });

      const importButton = screen.getByRole('button', { name: /import from image/i });
      expect(importButton).toHaveAttribute('type', 'button');

      fireEvent.click(importButton);

      await waitFor(() => {
        expect(importImageCalled).toBe(true);
      });

      expect(await screen.findByDisplayValue('Shortcake Recipe')).toBeInTheDocument();
      expect(screen.getByDisplayValue('6')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Flour')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Sugar')).toBeInTheDocument();

      // CRITICAL: confirm POST /api/recipes was NOT called automatically
      expect(postRecipesCalled).toBe(false);
      expect(screen.getByText(/imported via ai — please review all fields/i)).toBeInTheDocument();
    });

    it('rejects file > 8MB client-side with instant error message without making network call', async () => {
      let importImageCalled = false;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes/import-image') && options?.method === 'POST') {
          importImageCalled = true;
          return { ok: false, status: 500 } as Response;
        }
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), []);
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /paste recipe text/i }));
      fireEvent.click(screen.getByRole('button', { name: /upload image/i }));

      // Create fake 9MB file
      const giantBuffer = new Uint8Array(9 * 1024 * 1024);
      const giantFile = new File([giantBuffer], 'giant.jpg', { type: 'image/jpeg' });

      const fileInput = document.getElementById('import-image-input') as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files: [giantFile] } });

      expect(await screen.findByText(/selected file exceeds 8mb size limit/i)).toBeInTheDocument();
      expect(importImageCalled).toBe(false);
    });

    it('rejects file with unsupported MIME type client-side with instant error message without making network call', async () => {
      let importImageCalled = false;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes/import-image') && options?.method === 'POST') {
          importImageCalled = true;
          return { ok: false, status: 500 } as Response;
        }
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), []);
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /paste recipe text/i }));
      fireEvent.click(screen.getByRole('button', { name: /upload image/i }));

      const textFile = new File(['text content'], 'recipe.txt', { type: 'text/plain' });
      const fileInput = document.getElementById('import-image-input') as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files: [textFile] } });

      expect(
        await screen.findByText(/invalid file type\. please select a jpeg, png, or webp image/i)
      ).toBeInTheDocument();
      expect(importImageCalled).toBe(false);
    });

    it('displays error message when image import returns 502 (NoRecipeFound / extraction failure)', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes/import-image') && options?.method === 'POST') {
          return {
            ok: false,
            status: 502,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              error: 'ExtractionError',
              message:
                'The provided image or text does not contain explicit recipe ingredients or quantities.',
            }),
          } as Response;
        }
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), []);
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /paste recipe text/i }));
      fireEvent.click(screen.getByRole('button', { name: /upload image/i }));

      const file = new File(['dummy content'], 'landscape.png', { type: 'image/png' });
      const fileInput = document.getElementById('import-image-input') as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files: [file] } });

      const importButton = screen.getByRole('button', { name: /import from image/i });
      fireEvent.click(importButton);

      expect(
        await screen.findByText(
          /the provided image or text does not contain explicit recipe ingredients or quantities/i
        )
      ).toBeInTheDocument();
    });

    it('displays error message when image import returns 500 (Internal Server Error)', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes/import-image') && options?.method === 'POST') {
          return {
            ok: false,
            status: 500,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              error: 'InternalServerError',
              message: 'GEMINI_API_KEY is not configured on the server.',
            }),
          } as Response;
        }
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), []);
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /paste recipe text/i }));
      fireEvent.click(screen.getByRole('button', { name: /upload image/i }));

      const file = new File(['dummy content'], 'card.jpg', { type: 'image/jpeg' });
      const fileInput = document.getElementById('import-image-input') as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files: [file] } });

      const importButton = screen.getByRole('button', { name: /import from image/i });
      fireEvent.click(importButton);

      expect(
        await screen.findByText(/gemini_api_key is not configured on the server/i)
      ).toBeInTheDocument();
    });

    it('renders Take Picture tab with capture="environment" file input', async () => {
      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /paste recipe text/i }));
      fireEvent.click(screen.getByRole('button', { name: /take picture/i }));

      const cameraInput = document.getElementById('import-camera-input') as HTMLInputElement;
      expect(cameraInput).toBeInTheDocument();
      expect(cameraInput.getAttribute('type')).toBe('file');
      expect(cameraInput.getAttribute('accept')).toBe('image/jpeg,image/png,image/webp');
      expect(cameraInput.getAttribute('capture')).toBe('environment');
    });

    it('submits photo taken via Take Picture tab to POST /api/recipes/import-image hitting the shared downstream handler', async () => {
      let importImageCalled = false;

      const mockDraft = {
        name: 'Camera Recipe Card',
        baseServings: 2,
        dietaryTags: ['Vegan'],
        ingredients: [{ ingredientId: 'oats', displayName: 'Oats', amount: 1, unit: 'cup' }],
      };

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes/import-image') && options?.method === 'POST') {
          importImageCalled = true;
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => mockDraft,
          } as Response;
        }
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), []);
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      fireEvent.click(screen.getByRole('button', { name: /paste recipe text/i }));
      fireEvent.click(screen.getByRole('button', { name: /take picture/i }));

      const photoFile = new File(['camera photo buffer'], 'photo.jpg', { type: 'image/jpeg' });
      const cameraInput = document.getElementById('import-camera-input') as HTMLInputElement;

      fireEvent.change(cameraInput, { target: { files: [photoFile] } });

      const importButton = screen.getByRole('button', { name: /import from picture/i });
      fireEvent.click(importButton);

      await waitFor(() => {
        expect(importImageCalled).toBe(true);
      });

      expect(await screen.findByDisplayValue('Camera Recipe Card')).toBeInTheDocument();
      expect(screen.getByText(/imported via ai — please review all fields/i)).toBeInTheDocument();
    });
  });

  describe('Bulk Recipe Operations UI Tests', () => {
    it('executes bulk delete concurrently, resets selectedRecipeIds to empty on full success, and removes deleted items', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const deletedIds: string[] = [];

      const mockRecipes = [
        { id: 'r1', name: 'Recipe One', baseServings: 2, dietaryTags: [], ingredients: [] },
        { id: 'r2', name: 'Recipe Two', baseServings: 4, dietaryTags: [], ingredients: [] },
        { id: 'r3', name: 'Recipe Three', baseServings: 6, dietaryTags: [], ingredients: [] },
      ];

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (options?.method === 'DELETE') {
          const id = url.toString().split('/').pop();
          if (id) deletedIds.push(id);
          return {
            ok: true,
            status: 204,
            headers: new Headers(),
            json: async () => null,
          } as Response;
        }
        return recipesGetResponse(
          url.toString(),
          mockRecipes.filter((r) => !deletedIds.includes(r.id))
        );
      });

      render(<App initialUser={TEST_USER} />);

      expect(await screen.findByText('Recipe One')).toBeInTheDocument();
      expect(screen.getByText('Recipe Two')).toBeInTheDocument();
      expect(screen.getByText('Recipe Three')).toBeInTheDocument();

      // Select r1 and r2 using checkboxes
      fireEvent.click(screen.getByRole('checkbox', { name: /select recipe recipe one/i }));
      fireEvent.click(screen.getByRole('checkbox', { name: /select recipe recipe two/i }));

      // Floating bulk bar should show "2 Selected"
      expect(screen.getByText('2 Selected')).toBeInTheDocument();

      // Click "Delete Selected"
      fireEvent.click(screen.getByRole('button', { name: /delete selected/i }));

      await waitFor(() => {
        expect(deletedIds).toContain('r1');
        expect(deletedIds).toContain('r2');
      });

      // Confirm selectedRecipeIds reset to empty (floating bulk bar disappears)
      await waitFor(() => {
        expect(screen.queryByText('2 Selected')).not.toBeInTheDocument();
      });

      // Recipe Three remains in list
      expect(screen.getByText('Recipe Three')).toBeInTheDocument();
    });

    it('surfaces partial failure during bulk delete without silencing errors and keeps failed recipe IDs selected', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const deletedIds: string[] = [];

      const mockRecipes = [
        { id: 'r1', name: 'Recipe One', baseServings: 2, dietaryTags: [], ingredients: [] },
        { id: 'r2', name: 'Recipe Two (Fails)', baseServings: 4, dietaryTags: [], ingredients: [] },
      ];

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (options?.method === 'DELETE') {
          const id = url.toString().split('/').pop();
          if (id === 'r1') {
            deletedIds.push('r1');
            return {
              ok: true,
              status: 204,
              headers: new Headers(),
              json: async () => null,
            } as Response;
          }
          return {
            ok: false,
            status: 500,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ error: 'InternalServerError', message: 'Database failure on r2' }),
          } as Response;
        }
        return recipesGetResponse(
          url.toString(),
          mockRecipes.filter((r) => !deletedIds.includes(r.id))
        );
      });

      render(<App initialUser={TEST_USER} />);

      expect(await screen.findByText('Recipe One')).toBeInTheDocument();
      expect(screen.getByText('Recipe Two (Fails)')).toBeInTheDocument();

      // Select both recipes
      fireEvent.click(screen.getByRole('checkbox', { name: /select recipe recipe one/i }));
      fireEvent.click(
        screen.getByRole('checkbox', { name: /select recipe recipe two \(fails\)/i })
      );

      expect(screen.getByText('2 Selected')).toBeInTheDocument();

      // Click "Delete Selected"
      fireEvent.click(screen.getByRole('button', { name: /delete selected/i }));

      // Error banner should be surfaced reporting partial failure details
      await waitFor(() => {
        expect(screen.getByText(/bulk action error:/i)).toBeInTheDocument();
        expect(
          screen.getByText(/successfully deleted 1 recipe\(s\)\. failed to delete 1 recipe\(s\)/i)
        ).toBeInTheDocument();
      });

      // Succeeded recipe r1 removed, failed recipe r2 remains selected
      expect(screen.getByText('1 Selected')).toBeInTheDocument();
    });

    it('resets selectedRecipeIds to empty after clicking Build Shopping List from bulk bar', async () => {
      const mockRecipes = [
        { id: 'r1', name: 'Recipe One', baseServings: 2, dietaryTags: [], ingredients: [] },
        { id: 'r2', name: 'Recipe Two', baseServings: 4, dietaryTags: [], ingredients: [] },
      ];

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (url.toString().includes('/api/recipes')) {
          return recipesGetResponse(url.toString(), mockRecipes);
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      expect(await screen.findByText('Recipe One')).toBeInTheDocument();

      // Select recipes
      fireEvent.click(screen.getByRole('checkbox', { name: /select recipe recipe one/i }));
      expect(screen.getByText('1 Selected')).toBeInTheDocument();

      // Click "Build Shopping List" button in floating bulk bar
      fireEvent.click(screen.getByRole('button', { name: /build shopping list/i }));

      // Navigates to Shopping List Builder tab
      expect(await screen.findByText('Shopping List Builder')).toBeInTheDocument();

      // Switch back to Recipes tab
      fireEvent.click(screen.getByRole('button', { name: 'Recipes' }));
      expect(await screen.findByText('Create New Recipe')).toBeInTheDocument();

      // Verify selectedRecipeIds was reset (floating bulk bar is gone)
      expect(screen.queryByText('1 Selected')).not.toBeInTheDocument();
    });
  });

  describe('Search & Dietary Filter UI Tests', () => {
    it('filters recipe list by search query name in real time', async () => {
      const mockRecipes = [
        { id: 'r1', name: 'Classic Pancakes', baseServings: 4, dietaryTags: [], ingredients: [] },
        { id: 'r2', name: 'Steak Dinner', baseServings: 2, dietaryTags: [], ingredients: [] },
      ];

      // Search moved server-side (RecipeList's useRecipesPage), so the mock must actually
      // filter by the request's `search` query param, same as the real API does.
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (url.toString().includes('/api/recipes')) {
          const query = new URLSearchParams(url.toString().split('?')[1] ?? '');
          const search = query.get('search');
          const filtered = search
            ? mockRecipes.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
            : mockRecipes;
          return recipesGetResponse(url.toString(), filtered);
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      expect(await screen.findByText('Classic Pancakes')).toBeInTheDocument();
      expect(screen.getByText('Steak Dinner')).toBeInTheDocument();

      // Search for "Pancake" — debounced (~300ms) before it fires a request
      const searchInput = screen.getByPlaceholderText(/search recipes by name/i);
      fireEvent.change(searchInput, { target: { value: 'Pancake' } });

      // Classic Pancakes remains, Steak Dinner is excluded once the debounced
      // server-side search request resolves
      await waitFor(() => {
        expect(screen.queryByText('Steak Dinner')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Classic Pancakes')).toBeInTheDocument();
    });

    it('filters recipe list by active dietary tag toggle', async () => {
      const mockRecipes = [
        { id: 'r1', name: 'Vegan Bowl', baseServings: 2, dietaryTags: ['Vegan'], ingredients: [] },
        { id: 'r2', name: 'Beef Stew', baseServings: 4, dietaryTags: [], ingredients: [] },
      ];

      // Dietary-tag filtering also moved server-side — the mock filters by the request's
      // `tags` query param.
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (url.toString().includes('/api/recipes')) {
          const query = new URLSearchParams(url.toString().split('?')[1] ?? '');
          const tags = query.get('tags')?.split(',').filter(Boolean) ?? [];
          const filtered =
            tags.length === 0
              ? mockRecipes
              : mockRecipes.filter((r) => tags.some((t) => r.dietaryTags.includes(t)));
          return recipesGetResponse(url.toString(), filtered);
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      expect(await screen.findByText('Vegan Bowl')).toBeInTheDocument();
      expect(screen.getByText('Beef Stew')).toBeInTheDocument();

      // Click "Filter by Vegan" toggle button
      const veganToggle = screen.getByRole('button', { name: /filter by vegan/i });
      fireEvent.click(veganToggle);

      // Vegan Bowl remains, non-vegan Beef Stew is excluded once the request resolves
      await waitFor(() => {
        expect(screen.queryByText('Beef Stew')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Vegan Bowl')).toBeInTheDocument();

      // Click toggle button again to deactivate filter
      fireEvent.click(veganToggle);
      await waitFor(() => {
        expect(screen.getByText('Beef Stew')).toBeInTheDocument();
      });
    });

    it('renders zero-results empty state when search query matches no recipes and allows clearing filters', async () => {
      const mockRecipes = [
        { id: 'r1', name: 'Oatmeal', baseServings: 1, dietaryTags: [], ingredients: [] },
      ];

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (url.toString().includes('/api/recipes')) {
          const query = new URLSearchParams(url.toString().split('?')[1] ?? '');
          const search = query.get('search');
          const filtered = search
            ? mockRecipes.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
            : mockRecipes;
          return recipesGetResponse(url.toString(), filtered);
        }
        return { ok: false, status: 404 } as Response;
      });

      render(<App initialUser={TEST_USER} />);

      expect(await screen.findByText('Oatmeal')).toBeInTheDocument();

      // Search for a non-matching string
      const searchInput = screen.getByPlaceholderText(/search recipes by name/i);
      fireEvent.change(searchInput, { target: { value: 'NonExistentRecipe' } });

      // Zero results card displayed once the debounced server-side search request resolves
      expect(await screen.findByText('No recipes match your search/filter')).toBeInTheDocument();
      expect(screen.queryByText('Oatmeal')).not.toBeInTheDocument();

      // Click "Clear Filters" button
      const clearButtons = screen.getAllByRole('button', { name: /clear filters/i });
      fireEvent.click(clearButtons[0]);

      // Oatmeal is restored (search cleared -> unfiltered request) and search input is cleared
      expect(await screen.findByText('Oatmeal')).toBeInTheDocument();
      expect(searchInput).toHaveValue('');
    });
  });
});
