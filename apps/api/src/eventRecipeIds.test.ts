import { describe, expect, it, beforeEach, vi } from 'vitest';
import { prisma } from './prisma.js';
import { createAuthenticatedAgent, type TestAgent } from './__testHelpers__/testAuth.js';

const { recipeQueries } = vi.hoisted(() => ({ recipeQueries: { findFirst: 0, findMany: 0 } }));

// Counts prisma.recipe.findFirst/findMany calls by wrapping the shared client, rather than
// vi.spyOn on the model delegate: Prisma's delegate methods don't call through under a spy,
// and restoring one leaves the method undefined for the rest of the file.
vi.mock('./prisma.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./prisma.js')>();
  const realRecipe = actual.prisma.recipe;
  const countedRecipe = new Proxy(realRecipe, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if ((prop === 'findFirst' || prop === 'findMany') && typeof value === 'function') {
        return (...args: unknown[]) => {
          recipeQueries[prop] += 1;
          return value.apply(target, args);
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const countedPrisma = new Proxy(actual.prisma, {
    get(target, prop) {
      if (prop === 'recipe') return countedRecipe;
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { ...actual, prisma: countedPrisma };
});

/** Mirrors MAX_RECIPES_PER_EVENT in packages/domain (kept literal so the cap itself is pinned). */
const CAP = 50;
const validGuestGroup = { totalGuests: 10, vegetarianCount: 2, veganCount: 0 };
const recipeBody = {
  baseServings: 4,
  ingredients: [{ ingredientId: 'rice', displayName: 'Rice', amount: 500, unit: 'g' }],
};

function uniqueIds(count: number) {
  return Array.from({ length: count }, (_, i) => `missing-recipe-${i}`);
}

/** Call counts for the two recipe lookups the routes could use, reset before each test. */
function recipeQueryCounts() {
  return { findFirst: recipeQueries.findFirst, findMany: recipeQueries.findMany };
}

describe('Event routes: recipeIds handling', () => {
  let agent: TestAgent;
  let ownId: string;
  let ownId2: string;
  let foreignId: string;

  beforeEach(async () => {
    // Same cleanup as app.test.ts — all API test files share one SQLite file (see CLAUDE.md).
    await prisma.shoppingListItem.deleteMany();
    await prisma.shoppingList.deleteMany();
    await prisma.ingredientLine.deleteMany();
    await prisma.recipeStep.deleteMany();
    await prisma.recipe.deleteMany();
    await prisma.event.deleteMany();
    await prisma.ingredientCategoryOverride.deleteMany();
    await prisma.pantryItem.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();

    const { agent: otherAgent } = await createAuthenticatedAgent();
    ({ agent } = await createAuthenticatedAgent());

    const foreign = await otherAgent.post('/api/recipes').send({ ...recipeBody, name: 'Foreign' });
    const own = await agent.post('/api/recipes').send({ ...recipeBody, name: 'Own' });
    const own2 = await agent.post('/api/recipes').send({ ...recipeBody, name: 'Own 2' });
    expect([foreign.status, own.status, own2.status]).toEqual([201, 201, 201]);
    foreignId = foreign.body.id;
    ownId = own.body.id;
    ownId2 = own2.body.id;
    recipeQueries.findFirst = 0;
    recipeQueries.findMany = 0;
  });

  async function createEvent(recipeIds: string[]) {
    return agent
      .post('/api/events')
      .send({ name: 'Party', guestGroup: validGuestGroup, recipeIds });
  }

  it('POST accepts exactly the cap of unique recipe IDs', async () => {
    const res = await createEvent(uniqueIds(CAP));
    expect(res.status).toBe(201);
  });

  it('POST returns 400 when the unique recipe IDs exceed the cap, and stores nothing', async () => {
    const res = await createEvent(uniqueIds(CAP + 1));

    expect(res.status).toBe(400);
    expect(await prisma.event.count()).toBe(0);
  });

  it('PUT returns 400 when the unique recipe IDs exceed the cap, leaving the event unchanged', async () => {
    const created = await createEvent([ownId]);
    expect(created.status).toBe(201);

    const res = await agent.put(`/api/events/${created.body.id}`).send({
      name: 'Party',
      guestGroup: validGuestGroup,
      recipeIds: uniqueIds(CAP + 1),
    });

    expect(res.status).toBe(400);
    const stored = await prisma.event.findUnique({ where: { id: created.body.id } });
    expect(JSON.parse(stored!.recipeIdsJson)).toEqual([ownId]);
  });

  it('stores duplicate recipe IDs once, keeping first-seen order', async () => {
    const res = await createEvent([ownId, ownId, ownId2, ownId]);

    expect(res.status).toBe(201);
    expect(res.body.recipeIds).toEqual([ownId, ownId2]);
    expect(res.body.droppedRecipeIds).toEqual([]);
    const stored = await prisma.event.findUnique({ where: { id: res.body.id } });
    expect(JSON.parse(stored!.recipeIdsJson)).toEqual([ownId, ownId2]);
  });

  it('still enforces ownership and reports each dropped ID once, on POST and PUT', async () => {
    const mixed = [ownId, foreignId, 'missing-recipe', foreignId, ownId];

    const created = await createEvent(mixed);
    expect(created.status).toBe(201);
    expect(created.body.recipeIds).toEqual([ownId]);
    expect(created.body.droppedRecipeIds).toEqual([foreignId, 'missing-recipe']);

    const updated = await agent
      .put(`/api/events/${created.body.id}`)
      .send({ name: 'Party', guestGroup: validGuestGroup, recipeIds: [...mixed, ownId2] });
    expect(updated.status).toBe(200);
    expect(updated.body.recipeIds).toEqual([ownId, ownId2]);
    expect(updated.body.droppedRecipeIds).toEqual([foreignId, 'missing-recipe']);

    const stored = await prisma.event.findUnique({ where: { id: created.body.id } });
    expect(JSON.parse(stored!.recipeIdsJson)).toEqual([ownId, ownId2]);
  });

  it('checks ownership with a single findMany instead of one query per ID', async () => {
    const res = await createEvent([ownId, foreignId, ownId2]);

    expect(res.status).toBe(201);
    expect(res.body.recipeIds).toEqual([ownId, ownId2]);
    expect(res.body.droppedRecipeIds).toEqual([foreignId]);
    expect(recipeQueryCounts()).toEqual({ findFirst: 0, findMany: 1 });
  });

  it('GET /api/events/:id loads the stored recipes with a single findMany', async () => {
    const created = await createEvent([ownId, ownId2]);
    expect(created.status).toBe(201);
    // Make one stored ID stale, so the dropped path is exercised too.
    await prisma.ingredientLine.deleteMany({ where: { recipeId: ownId2 } });
    await prisma.recipe.delete({ where: { id: ownId2 } });

    recipeQueries.findFirst = 0;
    recipeQueries.findMany = 0;
    const res = await agent.get(`/api/events/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.recipeIds).toEqual([ownId, ownId2]);
    expect(res.body.droppedRecipeIds).toEqual([ownId2]);
    expect(recipeQueryCounts()).toEqual({ findFirst: 0, findMany: 1 });
  });

  describe('POST /api/events/plan', () => {
    function plan(recipeIds: string[]) {
      return agent.post('/api/events/plan').send({ recipeIds, guestGroup: validGuestGroup });
    }

    it('returns 400 when the unique recipe IDs exceed the cap', async () => {
      const res = await plan(uniqueIds(CAP + 1));

      expect(res.status).toBe(400);
    });

    it('plans duplicate recipe IDs once', async () => {
      const res = await plan([ownId, ownId, ownId2]);

      expect(res.status).toBe(200);
      expect(res.body.includedRecipes).toHaveLength(2);
    });

    it("still returns 404 naming the first unowned ID, including another user's recipe", async () => {
      const res = await plan([ownId, foreignId, 'missing-recipe']);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NotFound');
      expect(res.body.message).toContain(foreignId);
    });

    it('checks ownership with a single findMany instead of one query per ID', async () => {
      const res = await plan([ownId, ownId2]);

      expect(res.status).toBe(200);
      expect(res.body.includedRecipes).toHaveLength(2);
      expect(recipeQueryCounts()).toEqual({ findFirst: 0, findMany: 1 });
    });
  });
});
