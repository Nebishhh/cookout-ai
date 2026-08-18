/**
 * Standalone Manual Non-CI Smoke Test Script for Live Gemini API.
 *
 * THIS SCRIPT IS EXCLUDED FROM AUTOMATED CI AND `npm test`. It exists to periodically detect
 * *drift* between what live Gemini returns and what the recorded E2E fixtures
 * (apps/api/src/__fixtures__/recordedGeminiFixtures.ts) claim it returns.
 *
 * HOW TO RUN MANUALLY:
 * -------------------
 *   npx tsx --env-file=apps/api/.env scripts/smokeTestLiveGemini.ts
 *   # or:  GEMINI_API_KEY="your-real-key" npx tsx scripts/smokeTestLiveGemini.ts
 *
 * It costs real API calls (two of them), so don't wire it into anything automated.
 *
 * Why it calls the real client instead of its own prompt: this script previously sent a
 * hand-written prompt with no responseSchema, which meant a clean run proved nothing about
 * production — it was exercising a different request than the app makes. It now imports
 * parseRecipeTextWithGemini() directly, so the real GEMINI_SYSTEM_PROMPT and the real
 * anyOf/`required` response schema are what get validated. geminiClient.ts imports only
 * @google/genai (no @cookout-ai/domain), which is what keeps this runnable from the repo root.
 */

import { parseRecipeTextWithGemini } from '../apps/api/src/geminiClient.js';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey || apiKey.trim() === '') {
  console.log('\n[SMOKE TEST SKIPPED]');
  console.log('GEMINI_API_KEY is not set in environment.');
  console.log('To run this live smoke test manually, run:');
  console.log('  npx tsx --env-file=apps/api/.env scripts/smokeTestLiveGemini.ts\n');
  process.exit(0);
}

const EXPECTED_TOP_LEVEL_KEYS = [
  'name',
  'baseServings',
  'dietaryTags',
  'ingredients',
  'instructions',
];
const EXPECTED_INGREDIENT_KEYS = ['ingredientId', 'displayName', 'amount', 'unit'];

/** States its timings explicitly, so every timed step SHOULD come back with a duration. */
const TIMED_RECIPE_TEXT = `
Weeknight Roast Chicken - serves 4

Ingredients:
- 1 whole chicken (about 2 kg)
- 2 tbsp olive oil
- 1 tsp salt

Instructions:
1. Preheat the oven to 425F.
2. Rub the chicken with oil and salt, then rest at room temperature for 30 minutes.
3. Roast for 1 hour and 15 minutes, until the juices run clear.
4. Let it rest for 10 minutes before carving.
`;

/** States NO timings, so steps SHOULD come back without durations rather than invented ones. */
const UNTIMED_RECIPE_TEXT = `
Grandma Stew - serves 6

Ingredients:
- 1 kg beef chuck
- 2 onions
- 1 l beef stock

Instructions:
1. Brown the beef in batches until deeply caramelized.
2. Add the onions and cook until softened.
3. Pour in the stock and simmer gently until the beef is fork tender.
`;

interface StepShape {
  instruction?: string;
  duration?: { amount: number; unit: string };
  temperature?: { amount: number; unit: string };
}

interface RecipeShape {
  name?: string;
  baseServings?: number;
  dietaryTags?: unknown;
  ingredients?: Record<string, unknown>[];
  instructions?: StepShape[];
}

function parseResponse(raw: string): RecipeShape {
  return JSON.parse(raw.replace(/```json\s*|\s*```/g, '').trim());
}

async function checkTimedRecipe(): Promise<void> {
  console.log('[1/2] Recipe WITH explicit timings...');
  const parsed = parseResponse(await parseRecipeTextWithGemini(TIMED_RECIPE_TEXT, false));

  for (const key of EXPECTED_TOP_LEVEL_KEYS) {
    if (!(key in parsed)) {
      throw new Error(`SCHEMA DRIFT: missing required top-level key "${key}".`);
    }
  }

  if (!Array.isArray(parsed.ingredients) || parsed.ingredients.length === 0) {
    throw new Error('SCHEMA DRIFT: "ingredients" is not a non-empty array.');
  }
  for (const key of EXPECTED_INGREDIENT_KEYS) {
    if (!(key in parsed.ingredients[0])) {
      throw new Error(`SCHEMA DRIFT: ingredient missing required key "${key}".`);
    }
  }

  const steps = parsed.instructions ?? [];
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('SCHEMA DRIFT: "instructions" is not a non-empty array.');
  }
  if (steps.some((s) => typeof s.instruction !== 'string' || s.instruction.trim() === '')) {
    throw new Error('SCHEMA DRIFT: a step is missing its "instruction" string.');
  }

  // The drift that would silently break backward cook scheduling (see cookSchedule.ts): steps
  // still arrive, but with no duration, so every dish schedules as a zero-minute estimate.
  const withDuration = steps.filter((s) => s.duration).length;
  const withTemperature = steps.filter((s) => s.temperature).length;
  console.log(
    `      ${steps.length} steps, ${withDuration} with duration, ${withTemperature} with temperature`
  );
  if (withDuration === 0) {
    throw new Error(
      'SCHEMA DRIFT: a recipe stating explicit times returned NO step durations. Backward cook ' +
        'scheduling depends on these — every dish would render as a zero-minute estimate.'
    );
  }
  for (const step of steps) {
    if (step.duration && !['minutes', 'hours'].includes(step.duration.unit)) {
      throw new Error(`SCHEMA DRIFT: unexpected duration unit "${step.duration.unit}".`);
    }
    if (step.temperature && !['F', 'C'].includes(step.temperature.unit)) {
      throw new Error(`SCHEMA DRIFT: unexpected temperature unit "${step.temperature.unit}".`);
    }
  }
}

async function checkUntimedRecipe(): Promise<void> {
  console.log('[2/2] Recipe WITHOUT stated timings...');
  const parsed = parseResponse(await parseRecipeTextWithGemini(UNTIMED_RECIPE_TEXT, false));
  const steps = parsed.instructions ?? [];

  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('SCHEMA DRIFT: "instructions" is not a non-empty array.');
  }

  // Not a hard failure — a model inventing plausible times isn't a schema break, and the app
  // tolerates it. But it IS worth knowing, because hasUnstatedDurations (the "estimate" badge)
  // silently stops firing, and the schedule starts asserting times the source never stated.
  const invented = steps.filter((s) => s.duration).length;
  console.log(`      ${steps.length} steps, ${invented} with an inferred duration`);
  if (invented > 0) {
    console.warn(
      `      ⚠️  Gemini inferred ${invented} duration(s) the recipe never stated. Cook schedules ` +
        'will look more confident than the source justifies.'
    );
  }
}

async function runLiveSmokeTest(): Promise<void> {
  console.log('\n=== LIVE GEMINI API SMOKE TEST & SCHEMA DRIFT CHECK ===\n');
  try {
    await checkTimedRecipe();
    await checkUntimedRecipe();
    console.log('\n✅ SUCCESS: live Gemini output matches the recorded fixture shape.');
    console.log('   Step durations and temperatures are being extracted as expected.\n');
  } catch (err) {
    console.error('\n❌ SMOKE TEST FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

runLiveSmokeTest();
