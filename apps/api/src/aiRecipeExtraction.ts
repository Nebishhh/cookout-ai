import { hasMinimalRecipeShape } from './recipeMapper.js';

/**
 * Outcome of a Gemini recipe-extraction attempt, after sanitizing/parsing the raw response text
 * and checking it against the NoRecipeFound and minimal-shape rules.
 */
export type RecipeExtractionResult =
  | { status: 'ok'; candidate: Record<string, unknown> }
  | { status: 'no-recipe-found'; message?: string }
  | { status: 'invalid-json' }
  | { status: 'malformed-shape' };

function sanitizeAndParse(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    const sanitized = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return { ok: true, value: JSON.parse(sanitized) };
  } catch {
    return { ok: false };
  }
}

function isNoRecipeFound(candidate: unknown): candidate is { error: string; message?: string } {
  return (
    !!candidate &&
    typeof candidate === 'object' &&
    'error' in candidate &&
    (candidate as { error: unknown }).error === 'NoRecipeFound'
  );
}

/**
 * Orchestrates a Gemini call plus (at most) one shape-guard retry. `callGemini` must invoke the
 * appropriate parseRecipe*WithGemini[Timeout] function, threading its `reinforceShape` argument
 * straight through so the retry attempt gets the shape-correction reinforcement text.
 *
 * NoRecipeFound and invalid-JSON responses are NOT retried: NoRecipeFound is already a correct,
 * intentional model response (retrying would waste a live API call for no benefit); invalid-JSON
 * is a different, pre-existing failure mode this issue doesn't cover. Only a schema-valid-but-
 * unusable shape (see issue #1 — everything crammed into "name", no "ingredients" array) triggers
 * the retry.
 */
export async function extractRecipeCandidate(
  callGemini: (reinforceShape: boolean) => Promise<string>
): Promise<RecipeExtractionResult> {
  const attempt = async (reinforceShape: boolean): Promise<RecipeExtractionResult> => {
    const raw = await callGemini(reinforceShape);
    const parsed = sanitizeAndParse(raw);
    if (!parsed.ok) {
      return { status: 'invalid-json' };
    }
    if (isNoRecipeFound(parsed.value)) {
      return { status: 'no-recipe-found', message: parsed.value.message };
    }
    if (hasMinimalRecipeShape(parsed.value)) {
      return { status: 'ok', candidate: parsed.value as Record<string, unknown> };
    }
    return { status: 'malformed-shape' };
  };

  const first = await attempt(false);
  if (first.status !== 'malformed-shape') {
    return first;
  }
  return attempt(true);
}
