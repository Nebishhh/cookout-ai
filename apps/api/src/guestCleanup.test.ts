import { describe, expect, it, beforeEach } from 'vitest';
import { prisma } from './prisma.js';
import { sweepExpiredGuests } from './guestCleanup.js';

describe('sweepExpiredGuests', () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  it('deletes a guest User whose guestExpiresAt has passed, along with their owned data', async () => {
    const guest = await prisma.user.create({
      data: { isGuest: true, guestExpiresAt: new Date(Date.now() - 1000) },
    });
    const recipe = await prisma.recipe.create({
      data: { userId: guest.id, name: 'Expired Guest Recipe', baseServings: 1 },
    });

    const deletedCount = await sweepExpiredGuests();

    expect(deletedCount).toBe(1);
    expect(await prisma.user.findUnique({ where: { id: guest.id } })).toBeNull();
    expect(await prisma.recipe.findUnique({ where: { id: recipe.id } })).toBeNull();
  });

  it('leaves a guest User whose guestExpiresAt is in the future untouched', async () => {
    const guest = await prisma.user.create({
      data: { isGuest: true, guestExpiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });

    const deletedCount = await sweepExpiredGuests();

    expect(deletedCount).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: guest.id } })).not.toBeNull();
  });

  it('never touches a real (non-guest) user, even one with an old createdAt', async () => {
    const realUser = await prisma.user.create({
      data: {
        email: 'old-real-user@example.com',
        passwordHash: 'irrelevant-for-this-test',
        isGuest: false,
        createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      },
    });

    const deletedCount = await sweepExpiredGuests();

    expect(deletedCount).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: realUser.id } })).not.toBeNull();
  });
});
