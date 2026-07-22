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
});
