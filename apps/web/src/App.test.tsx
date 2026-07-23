import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import App from './App';

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
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockRecipes,
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<App />);

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
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [],
      } as Response;
    });

    render(<App />);

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
      });
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
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [],
      } as Response;
    });

    render(<App />);

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
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockRecipes,
        } as Response;
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

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /shopping list/i }));

    expect(await screen.findByText('Shopping List Builder')).toBeInTheDocument();
    expect(await screen.findByText('Pancakes')).toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox', { name: /select recipe pancakes/i });
    fireEvent.click(checkbox);

    fireEvent.click(screen.getByRole('button', { name: /build shopping list/i }));

    expect(await screen.findByText('Consolidated Shopping List')).toBeInTheDocument();
    expect(screen.getByText('473.176 ml')).toBeInTheDocument();
    expect(screen.getByText('Per-Recipe Scaled Breakdown')).toBeInTheDocument();
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
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockRecipes,
        } as Response;
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

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /shopping list/i }));

    expect(await screen.findByText('Pancakes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /select recipe pancakes/i }));
    fireEvent.click(screen.getByRole('button', { name: /build shopping list/i }));

    expect(await screen.findByText('Recipe not found: r1')).toBeInTheDocument();
  });

  it('does NOT trigger a duplicate fetch of GET /api/recipes when switching between views with cached data', async () => {
    let fetchCount = 0;
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
        fetchCount++;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockRecipes,
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<App />);

    // 1. Initial load on /recipes tab -> triggers 1st fetch
    expect(await screen.findByText('Shared Pancakes')).toBeInTheDocument();
    expect(fetchCount).toBe(1);

    // 2. Switch to /shopping-list tab -> uses shared cached query, 0 additional fetches!
    fireEvent.click(screen.getByRole('button', { name: /shopping list/i }));
    expect(await screen.findByText('Shopping List Builder')).toBeInTheDocument();
    expect(screen.getByText('Shared Pancakes')).toBeInTheDocument();
    expect(fetchCount).toBe(1);

    // 3. Switch back to /recipes tab -> still uses cached query, 0 additional fetches!
    fireEvent.click(screen.getByRole('button', { name: 'Recipes' }));
    expect(await screen.findByText('Create New Recipe')).toBeInTheDocument();
    expect(fetchCount).toBe(1);
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
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url.toString().includes('/api/recipes')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockRecipes,
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<App />);

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
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockRecipes,
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<App />);

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
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockRecipes,
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<App />);

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
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => (deleteCalled ? [] : mockRecipes),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<App />);

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
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.toString().includes('/api/recipes')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => mockRecipes,
          } as Response;
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

      render(<App />);

      // Switch to Event Planner tab
      fireEvent.click(screen.getByRole('button', { name: /event planner/i }));

      expect(await screen.findByText('1. Guest Breakdown & Recipe Selection')).toBeInTheDocument();
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
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => mockRecipes,
          } as Response;
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

      render(<App />);

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
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => mockRecipes,
          } as Response;
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

      render(<App />);

      fireEvent.click(screen.getByRole('button', { name: /event planner/i }));

      expect(await screen.findByText('Pancakes')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('checkbox', { name: /select recipe pancakes/i }));
      fireEvent.click(screen.getByRole('button', { name: /plan event shopping list/i }));

      expect(
        await screen.findByText('Recipe with id "missing-id-999" not found.')
      ).toBeInTheDocument();
    });
  });
});
