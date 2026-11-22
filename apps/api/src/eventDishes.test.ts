import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from './prisma.js';
import { createAuthenticatedAgent, type TestAgent } from './__testHelpers__/testAuth.js';

/** 12 guests, 3 vegetarian of whom 1 is vegan: 9 omnivores, 2 vegetarians, 1 vegan. */
const twelve = { totalGuests: 12, vegetarianCount: 3, veganCount: 1 };
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Included = {
  recipeId: string;
  recipeName: string;
  eligibleServings: number;
  servings: number;
  course: string | null;
  servingsWereOverridden: boolean;
};

describe('Event dishes: courses and servings overrides', () => {
  let agent: TestAgent;
  let pork: string;
  let tagine: string;
  let potatoes: string;
  let sorbet: string;

  /** The 12-guest example: two mains, one side, one dessert. */
  const menu = () => [
    { recipeId: pork, course: 'Main' },
    { recipeId: tagine, course: 'Main' },
    { recipeId: potatoes, course: 'Side' },
    { recipeId: sorbet, course: 'Dessert' },
  ];

  async function createRecipe(
    name: string,
    baseServings: number,
    dietaryTags: string[],
    ingredient: { ingredientId: string; displayName: string; amount: number; unit: string }
  ) {
    const res = await agent
      .post('/api/recipes')
      .send({ name, baseServings, dietaryTags, ingredients: [ingredient] });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  const servingsByName = (included: Included[]) =>
    included.map((r) => [r.recipeName, r.servings, r.course]);

  beforeEach(async () => {
    // Same cleanup as app.test.ts — all API test files share one SQLite file (see CLAUDE.md).
    // Deleting events cascades to their EventDish rows.
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

    ({ agent } = await createAuthenticatedAgent());

    pork = await createRecipe('Pulled Pork', 4, [], {
      ingredientId: 'pork',
      displayName: 'Pork Shoulder',
      amount: 1,
      unit: 'kg',
    });
    tagine = await createRecipe('Chickpea Tagine', 4, ['Vegan'], {
      ingredientId: 'chickpeas',
      displayName: 'Chickpeas',
      amount: 400,
      unit: 'g',
    });
    potatoes = await createRecipe('Scalloped Potatoes', 6, ['Vegetarian'], {
      ingredientId: 'potato',
      displayName: 'Potatoes',
      amount: 1200,
      unit: 'g',
    });
    sorbet = await createRecipe('Coconut Sorbet', 6, ['Vegan'], {
      ingredientId: 'coconut-milk',
      displayName: 'Coconut Milk',
      amount: 800,
      unit: 'ml',
    });
  });

  describe('POST /api/events/plan', () => {
    it('splits each course in the 12-guest example and reports the shortfall and course totals', async () => {
      const res = await agent.post('/api/events/plan').send({ guestGroup: twelve, dishes: menu() });

      expect(res.status).toBe(200);
      expect(servingsByName(res.body.includedRecipes)).toEqual([
        ['Pulled Pork', 4.5, 'Main'],
        ['Chickpea Tagine', 7.5, 'Main'],
        ['Scalloped Potatoes', 11, 'Side'],
        ['Coconut Sorbet', 12, 'Dessert'],
      ]);
      expect(res.body.includedRecipes.map((r: Included) => r.eligibleServings)).toEqual([
        9, 12, 11, 12,
      ]);
      expect(res.body.includedRecipes.every((r: Included) => !r.servingsWereOverridden)).toBe(true);
      expect(res.body.warnings).toEqual([
        { course: 'Side', cohort: 'vegan', guestCount: 1, message: '1 vegan guest has no Side' },
      ]);
      expect(res.body.courseSummaries).toEqual([
        { course: 'Main', servings: 12, guestCount: 12, coveredGuestCount: 12 },
        { course: 'Side', servings: 11, guestCount: 12, coveredGuestCount: 11 },
        { course: 'Dessert', servings: 12, guestCount: 12, coveredGuestCount: 12 },
      ]);
    });

    it('still accepts the legacy recipeIds body, planning every dish as its own course', async () => {
      const res = await agent
        .post('/api/events/plan')
        .send({ guestGroup: twelve, recipeIds: [pork, tagine, potatoes, sorbet] });

      expect(res.status).toBe(200);
      for (const r of res.body.includedRecipes as Included[]) {
        expect(r.servings).toBe(r.eligibleServings);
        expect(r.course).toBeNull();
      }
      expect(res.body.warnings).toEqual([]);
      expect(res.body.courseSummaries).toEqual([]);
    });

    it('honours a servings override and shows the course going over', async () => {
      const dishes = menu();
      dishes[0] = { ...dishes[0], servingsOverride: 6 } as (typeof dishes)[number];
      const res = await agent.post('/api/events/plan').send({ guestGroup: twelve, dishes });

      expect(res.status).toBe(200);
      const porkPlan = res.body.includedRecipes[0] as Included;
      expect([porkPlan.servings, porkPlan.servingsWereOverridden]).toEqual([6, true]);
      expect(res.body.courseSummaries[0]).toEqual({
        course: 'Main',
        servings: 13.5,
        guestCount: 12,
        coveredGuestCount: 12,
      });
    });

    it.each([
      ['an unknown course', { course: 'Starter' }],
      ['an override of 0', { servingsOverride: 0 }],
      ['a fractional override', { servingsOverride: 2.5 }],
    ])('rejects %s with 400 InvalidEventError', async (_label, extra) => {
      const res = await agent
        .post('/api/events/plan')
        .send({ guestGroup: twelve, dishes: [{ recipeId: pork, ...extra }] });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'InvalidEventError');
    });
  });

  describe('saved events', () => {
    it('stores each dish with its course and override and returns them on every read', async () => {
      const dishes = menu();
      dishes[0] = { ...dishes[0], servingsOverride: 6 } as (typeof dishes)[number];

      const created = await agent
        .post('/api/events')
        .send({ name: 'Backyard Dinner', guestGroup: twelve, dishes });
      expect(created.status).toBe(201);

      const expectedDishes = [
        { recipeId: pork, course: 'Main', servingsOverride: 6 },
        { recipeId: tagine, course: 'Main', servingsOverride: null },
        { recipeId: potatoes, course: 'Side', servingsOverride: null },
        { recipeId: sorbet, course: 'Dessert', servingsOverride: null },
      ];
      expect(created.body.dishes).toEqual(expectedDishes);
      expect(created.body.recipeIds).toEqual([pork, tagine, potatoes, sorbet]);
      expect(created.body.includedRecipes[0].servings).toBe(6);

      const fetched = await agent.get(`/api/events/${created.body.id}`);
      expect(fetched.status).toBe(200);
      expect(fetched.body.dishes).toEqual(expectedDishes);
      expect(servingsByName(fetched.body.includedRecipes)).toEqual([
        ['Pulled Pork', 6, 'Main'],
        ['Chickpea Tagine', 7.5, 'Main'],
        ['Scalloped Potatoes', 11, 'Side'],
        ['Coconut Sorbet', 12, 'Dessert'],
      ]);

      const list = await agent.get('/api/events');
      expect(list.body[0].dishes).toEqual(expectedDishes);

      const rows = await prisma.eventDish.findMany({
        where: { eventId: created.body.id },
        orderBy: { position: 'asc' },
      });
      expect(rows.map((r) => [r.recipeId, r.position])).toEqual([
        [pork, 0],
        [tagine, 1],
        [potatoes, 2],
        [sorbet, 3],
      ]);
      expect(rows.every((r) => UUID_V4.test(r.id))).toBe(true);
    });

    it('replaces the dish list on PUT without leaving old rows behind', async () => {
      const created = await agent
        .post('/api/events')
        .send({ name: 'Backyard Dinner', guestGroup: twelve, dishes: menu() });

      const updated = await agent.put(`/api/events/${created.body.id}`).send({
        name: 'Backyard Dinner',
        guestGroup: twelve,
        dishes: [{ recipeId: sorbet }, { recipeId: pork, course: 'Side', servingsOverride: 3 }],
      });
      expect(updated.status).toBe(200);
      expect(updated.body.dishes).toEqual([
        { recipeId: sorbet, course: null, servingsOverride: null },
        { recipeId: pork, course: 'Side', servingsOverride: 3 },
      ]);

      const fetched = await agent.get(`/api/events/${created.body.id}`);
      expect(fetched.body.dishes).toEqual(updated.body.dishes);
      expect(await prisma.eventDish.count({ where: { eventId: created.body.id } })).toBe(2);
    });

    it('plans an event saved without courses exactly as before: every dish its own course', async () => {
      const created = await agent.post('/api/events').send({
        name: 'Old-style event',
        guestGroup: twelve,
        recipeIds: [pork, tagine, potatoes, sorbet],
      });
      expect(created.status).toBe(201);

      const fetched = await agent.get(`/api/events/${created.body.id}`);
      for (const body of [created.body, fetched.body]) {
        expect(body.includedRecipes.map((r: Included) => r.servings)).toEqual([9, 12, 11, 12]);
        for (const r of body.includedRecipes as Included[]) {
          expect(r.servings).toBe(r.eligibleServings);
        }
        expect(body.warnings).toEqual([]);
      }
      expect(fetched.body.dishes.every((d: { course: unknown }) => d.course === null)).toBe(true);
    });

    it('deletes its dishes along with the event', async () => {
      const created = await agent
        .post('/api/events')
        .send({ name: 'Short-lived', guestGroup: twelve, dishes: menu() });
      expect(await prisma.eventDish.count({ where: { eventId: created.body.id } })).toBe(4);

      const deleted = await agent.delete(`/api/events/${created.body.id}`);
      expect(deleted.status).toBe(204);
      expect(await prisma.eventDish.count({ where: { eventId: created.body.id } })).toBe(0);
    });

    it('keeps the surviving dishes and their settings when one recipe is deleted', async () => {
      const created = await agent
        .post('/api/events')
        .send({ name: 'Backyard Dinner', guestGroup: twelve, dishes: menu() });

      await agent.delete(`/api/recipes/${tagine}`);
      const fetched = await agent.get(`/api/events/${created.body.id}`);

      expect(fetched.status).toBe(200);
      expect(fetched.body.droppedRecipeIds).toEqual([tagine]);
      // Pork is now the only Main, so every omnivore takes a whole serving of it, and the
      // vegetarians and the vegan have no Main at all.
      expect(servingsByName(fetched.body.includedRecipes)).toEqual([
        ['Pulled Pork', 9, 'Main'],
        ['Scalloped Potatoes', 11, 'Side'],
        ['Coconut Sorbet', 12, 'Dessert'],
      ]);
      expect(fetched.body.warnings.map((w: { message: string }) => w.message)).toEqual([
        '2 vegetarian guests have no Main',
        '1 vegan guest has no Main',
        '1 vegan guest has no Side',
      ]);
    });

    it('saves the event shopping list from the course split', async () => {
      const created = await agent
        .post('/api/events')
        .send({ name: 'Backyard Dinner', guestGroup: twelve, dishes: menu() });

      const saved = await agent.put(`/api/events/${created.body.id}/shopping-list`).send({});
      expect(saved.status).toBe(200);

      const porkLine = saved.body.items.find(
        (i: { ingredientId: string }) => i.ingredientId === 'pork'
      );
      // 1 kg * 4.5 / 4 = 1.125 kg, bought as 1.2 kg. Without courses it would be 9/4 = 2.3 kg.
      expect(porkLine.quantity).toMatchObject({ amount: 1.2, unit: 'kg' });
    });
  });
});
