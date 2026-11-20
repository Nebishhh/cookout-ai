import { afterEach, describe, expect, it, vi } from 'vitest';

describe('prisma client module', () => {
  const original = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = original;
    vi.resetModules();
  });

  it('refuses to load without DATABASE_URL instead of falling back to dev.db', async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();

    await expect(import('./prisma.js')).rejects.toThrow(
      'DATABASE_URL is not set. For local dev, copy apps/api/.env.example to apps/api/.env'
    );
  });

  it('loads when DATABASE_URL is set', async () => {
    expect(process.env.DATABASE_URL).toBeTruthy();
    vi.resetModules();

    const mod = await import('./prisma.js');
    expect(mod.prisma).toBeDefined();
  });
});
