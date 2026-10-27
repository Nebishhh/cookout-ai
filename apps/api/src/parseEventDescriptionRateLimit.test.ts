import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest';
import * as geminiClientModule from './geminiClient.js';
import { createAuthenticatedAgent, type TestAgent } from './__testHelpers__/testAuth.js';

// vi.hoisted, since the vi.mock factories below are hoisted above ordinary top-level consts.
const { AI_LIMIT } = vi.hoisted(() => ({ AI_LIMIT: 2 }));

// Mock geminiClient module so tests never make real network API calls
vi.mock('./geminiClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./geminiClient.js')>()),
  parseGuestGroupWithGeminiTimeout: vi.fn(),
}));

// The real recipeImportRateLimit deliberately no-ops under NODE_ENV=test (see
// aiImportRateLimit.ts); swap in an active instance with a small max so the route's actual
// mounting is exercised through the real app.
vi.mock('./middleware/aiImportRateLimit.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./middleware/aiImportRateLimit.js')>();
  return {
    ...actual,
    recipeImportRateLimit: actual.createAiImportRateLimit({
      windowMs: 60_000,
      max: AI_LIMIT,
      message: 'Too many recipe imports. Please try again later.',
      skip: () => false,
    }),
  };
});

const AI_ONLY_DESCRIPTION = 'a big family gathering, most eat everything';
const HEURISTIC_DESCRIPTION = 'dinner for 12, 3 vegetarian, 1 vegan';

describe('POST /api/events/parse-description rate limiting', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  let agent: TestAgent;

  beforeEach(async () => {
    vi.resetAllMocks();
    process.env.GEMINI_API_KEY = 'test-mock-key';
    vi.mocked(geminiClientModule.parseGuestGroupWithGeminiTimeout).mockResolvedValue(
      JSON.stringify({ totalGuests: 9, vegetarianCount: 2, veganCount: 0 })
    );
    // A fresh user per test, so each test starts with an empty per-user bucket.
    ({ agent } = await createAuthenticatedAgent());
  });

  afterAll(() => {
    process.env.GEMINI_API_KEY = originalApiKey;
  });

  it('returns 429 once the per-user AI limit is used up, without calling Gemini again', async () => {
    for (let i = 0; i < AI_LIMIT; i++) {
      const res = await agent
        .post('/api/events/parse-description')
        .send({ description: AI_ONLY_DESCRIPTION });
      expect(res.status).toBe(200);
      expect(res.body.source).toBe('ai');
    }

    const blocked = await agent
      .post('/api/events/parse-description')
      .send({ description: AI_ONLY_DESCRIPTION });

    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('TooManyRequests');
    expect(geminiClientModule.parseGuestGroupWithGeminiTimeout).toHaveBeenCalledTimes(AI_LIMIT);
  });

  it('does not count heuristic-resolved descriptions against the AI limit', async () => {
    for (let i = 0; i < AI_LIMIT + 2; i++) {
      const res = await agent
        .post('/api/events/parse-description')
        .send({ description: HEURISTIC_DESCRIPTION });
      expect(res.status).toBe(200);
      expect(res.body.source).toBe('heuristic');
    }

    const aiRes = await agent
      .post('/api/events/parse-description')
      .send({ description: AI_ONLY_DESCRIPTION });

    expect(aiRes.status).toBe(200);
    expect(aiRes.body.source).toBe('ai');
    expect(geminiClientModule.parseGuestGroupWithGeminiTimeout).toHaveBeenCalledTimes(1);
  });

  it('shares one bucket with the recipe-import routes', async () => {
    // Any route mounted with recipeImportRateLimit spends from the same per-user bucket;
    // import-text with an empty body still passes through the limiter before its own 400.
    for (let i = 0; i < AI_LIMIT; i++) {
      const res = await agent.post('/api/recipes/import-text').send({ text: '' });
      expect(res.status).toBe(400);
    }

    const blocked = await agent
      .post('/api/events/parse-description')
      .send({ description: AI_ONLY_DESCRIPTION });

    expect(blocked.status).toBe(429);
    expect(geminiClientModule.parseGuestGroupWithGeminiTimeout).not.toHaveBeenCalled();
  });
});
