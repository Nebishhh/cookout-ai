import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest';
import * as geminiClientModule from './geminiClient.js';
import { createAuthenticatedAgent, type TestAgent } from './__testHelpers__/testAuth.js';

// Mock geminiClient module so tests never make real network API calls
vi.mock('./geminiClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./geminiClient.js')>()),
  parseGuestGroupWithGeminiTimeout: vi.fn(),
}));

describe('POST /api/events/parse-description', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  let agent: TestAgent;

  beforeEach(async () => {
    vi.resetAllMocks();
    process.env.GEMINI_API_KEY = 'test-mock-key';
    ({ agent } = await createAuthenticatedAgent());
  });

  afterAll(() => {
    process.env.GEMINI_API_KEY = originalApiKey;
  });

  it('returns 200 via the heuristic when the description is confidently parseable, without calling Gemini', async () => {
    const response = await agent
      .post('/api/events/parse-description')
      .send({ description: 'dinner for 12, 3 vegetarian, 1 vegan' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      totalGuests: 12,
      vegetarianCount: 3,
      veganCount: 1,
      source: 'heuristic',
    });
    expect(geminiClientModule.parseGuestGroupWithGeminiTimeout).not.toHaveBeenCalled();
  });

  it('falls back to AI and returns 200 when the heuristic cannot determine a total guest count', async () => {
    vi.mocked(geminiClientModule.parseGuestGroupWithGeminiTimeout).mockResolvedValue(
      JSON.stringify({ totalGuests: 9, vegetarianCount: 2, veganCount: 0 })
    );

    const response = await agent
      .post('/api/events/parse-description')
      .send({ description: 'a big family gathering, most eat everything' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      totalGuests: 9,
      vegetarianCount: 2,
      veganCount: 0,
      source: 'ai',
    });
    expect(geminiClientModule.parseGuestGroupWithGeminiTimeout).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when description is missing or empty', async () => {
    const resMissing = await agent.post('/api/events/parse-description').send({});
    expect(resMissing.status).toBe(400);
    expect(resMissing.body.error).toBe('BadRequest');

    const resEmpty = await agent.post('/api/events/parse-description').send({ description: '   ' });
    expect(resEmpty.status).toBe(400);
    expect(resEmpty.body.error).toBe('BadRequest');

    expect(geminiClientModule.parseGuestGroupWithGeminiTimeout).not.toHaveBeenCalled();
  });

  it('returns 400 when description exceeds the length cap', async () => {
    const response = await agent
      .post('/api/events/parse-description')
      .send({ description: 'a'.repeat(501) });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('BadRequest');
    expect(geminiClientModule.parseGuestGroupWithGeminiTimeout).not.toHaveBeenCalled();
  });

  it('returns 422 when the heuristic extracts a value that violates GuestGroup invariants, without calling Gemini', async () => {
    // veganCount (9) > vegetarianCount (8) — extracted as-is, GuestGroup rejects it.
    const response = await agent
      .post('/api/events/parse-description')
      .send({ description: 'party for 5, 8 vegetarian, 9 vegan' });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('InvalidGuestGroupError');
    expect(geminiClientModule.parseGuestGroupWithGeminiTimeout).not.toHaveBeenCalled();
  });

  it('returns 422 when the AI-fallback result violates GuestGroup invariants', async () => {
    vi.mocked(geminiClientModule.parseGuestGroupWithGeminiTimeout).mockResolvedValue(
      JSON.stringify({ totalGuests: 4, vegetarianCount: 10, veganCount: 0 })
    );

    const response = await agent
      .post('/api/events/parse-description')
      .send({ description: 'a small gathering of friends' });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('InvalidGuestGroupError');
  });

  it('returns 502 BadGateway when the Gemini call fails', async () => {
    vi.mocked(geminiClientModule.parseGuestGroupWithGeminiTimeout).mockRejectedValue(
      new Error('Gemini API request timed out after 30 seconds.')
    );

    const response = await agent
      .post('/api/events/parse-description')
      .send({ description: 'some ambiguous gathering' });

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('BadGateway');
    expect(response.body.message).toContain('timed out');
  });

  it('returns a clean 429 message (not the raw upstream error blob) when Gemini rate-limits the request', async () => {
    const { ApiError } = await import('@google/genai');
    vi.mocked(geminiClientModule.parseGuestGroupWithGeminiTimeout).mockRejectedValue(
      new ApiError({
        status: 429,
        message: JSON.stringify({
          error: { code: 429, message: 'quota exceeded', status: 'RESOURCE_EXHAUSTED' },
        }),
      })
    );

    const response = await agent
      .post('/api/events/parse-description')
      .send({ description: 'twenty five friends, five vegetarian' });

    expect(response.status).toBe(429);
    expect(response.body.error).toBe('RateLimited');
    expect(response.body.message).not.toContain('RESOURCE_EXHAUSTED');
    expect(response.body.message).not.toContain('quota exceeded');
  });

  it('returns 502 BadGateway when Gemini returns non-JSON text', async () => {
    vi.mocked(geminiClientModule.parseGuestGroupWithGeminiTimeout).mockResolvedValue(
      'Sorry, I cannot parse this.'
    );

    const response = await agent
      .post('/api/events/parse-description')
      .send({ description: 'some ambiguous gathering' });

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('BadGateway');
    expect(response.body.message).toContain('invalid JSON');
  });

  it('returns 502 ExtractionError when Gemini returns the AmbiguousGuestCount shape', async () => {
    vi.mocked(geminiClientModule.parseGuestGroupWithGeminiTimeout).mockResolvedValue(
      JSON.stringify({
        error: 'AmbiguousGuestCount',
        message: 'The description does not clearly state a total guest count.',
      })
    );

    const response = await agent
      .post('/api/events/parse-description')
      .send({ description: 'we might have some people over sometime' });

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('ExtractionError');
    expect(response.body.message).toContain('does not clearly state');
  });

  it('returns 500 ServerConfigurationError when the heuristic is inconclusive and GEMINI_API_KEY is missing, without calling Gemini', async () => {
    delete process.env.GEMINI_API_KEY;

    const response = await agent
      .post('/api/events/parse-description')
      .send({ description: 'a big family gathering, most eat everything' });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('ServerConfigurationError');
    expect(geminiClientModule.parseGuestGroupWithGeminiTimeout).not.toHaveBeenCalled();
  });
});
