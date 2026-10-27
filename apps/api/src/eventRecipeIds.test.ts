import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from './prisma.js';
import { createAuthenticatedAgent, type TestAgent } from './__testHelpers__/testAuth.js';

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

describe('POST/PUT /api/events recipeIds handling', () => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    // Prisma's model methods don't call through under a bare vi.spyOn (they resolve to
    // undefined), so capture the real ones and forward to them explicitly.
    const realFindFirst = prisma.recipe.findFirst.bind(prisma.recipe);
    const realFindMany = prisma.recipe.findMany.bind(prisma.recipe);
    const findFirst = vi
      .spyOn(prisma.recipe, 'findFirst')
      .mockImplementation(((args) => realFindFirst(args)) as typeof prisma.recipe.findFirst);
    const findMany = vi
      .spyOn(prisma.recipe, 'findMany')
      .mockImplementation(((args) => realFindMany(args)) as typeof prisma.recipe.findMany);

    const res = await createEvent([ownId, foreignId, ownId2]);

    expect(res.status).toBe(201);
    expect(res.body.recipeIds).toEqual([ownId, ownId2]);
    expect(res.body.droppedRecipeIds).toEqual([foreignId]);
    expect(findFirst).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
