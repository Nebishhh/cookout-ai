/**
 * Standalone Manual Non-CI Smoke Test Script for Live Gemini API.
 *
 * THIS SCRIPT IS EXCLUDED FROM AUTOMATED CI AND `npm test`.
 * It is meant for periodic manual sanity checks against the live Gemini API
 * to detect fixture schema drift if Gemini's response format changes.
 *
 * HOW TO RUN MANUALLY:
 * -------------------
 *   GEMINI_API_KEY="your-real-gemini-api-key" node scripts/smokeTestLiveGemini.js
 */

import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey || apiKey.trim() === '') {
  console.log('\n[SMOKE TEST SKIPPED]');
  console.log('GEMINI_API_KEY is not set in environment.');
  console.log('To run this live smoke test manually, run:');
  console.log('  GEMINI_API_KEY="your-key" node scripts/smokeTestLiveGemini.js\n');
  process.exit(0);
}

const ai = new GoogleGenAI({ apiKey });
const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

console.log('\n=== LIVE GEMINI API SMOKE TEST & SCHEMA DRIFT CHECK ===\n');

const EXPECTED_FIXTURE_KEYS = ['name', 'baseServings', 'dietaryTags', 'ingredients'];
const EXPECTED_INGREDIENT_KEYS = ['ingredientId', 'displayName', 'amount', 'unit'];

async function runLiveSmokeTest() {
  const samplePrompt = `
You are a culinary data parsing assistant. Extract structured recipe data.
Respond ONLY with a single JSON object (no markdown, no commentary):
{
  "name": "Live Pancakes",
  "baseServings": 4,
  "dietaryTags": ["Vegetarian"],
  "ingredients": [
    { "ingredientId": "flour", "displayName": "Flour", "amount": 2, "unit": "cup" }
  ]
}

RAW RECIPE TEXT:
Classic Pancakes: 2 cups flour, 1 cup milk, 1 egg. Serves 4.
`;

  try {
    console.log(`[1/2] Sending live request to model: ${modelName}...`);
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ text: samplePrompt }],
    });

    const text = response.text || '';
    console.log('Live Gemini Raw Output Received:\n', text);

    const cleanedText = text.replace(/```json\s*|\s*```/g, '').trim();
    const parsed = JSON.parse(cleanedText);

    console.log('\n[2/2] Validating response schema against E2E fixture shape...');

    // Validate top-level keys
    for (const key of EXPECTED_FIXTURE_KEYS) {
      if (!(key in parsed)) {
        throw new Error(
          `SCHEMA DRIFT DETECTED: Missing required key "${key}" in live Gemini output.`
        );
      }
    }

    if (!Array.isArray(parsed.ingredients) || parsed.ingredients.length === 0) {
      throw new Error('SCHEMA DRIFT DETECTED: "ingredients" is not a non-empty array.');
    }

    const firstIng = parsed.ingredients[0];
    for (const key of EXPECTED_INGREDIENT_KEYS) {
      if (!(key in firstIng)) {
        throw new Error(`SCHEMA DRIFT DETECTED: Ingredient missing required key "${key}".`);
      }
    }

    console.log('\n✅ SUCCESS: Live Gemini response matches recorded fixture schema cleanly!');
    console.log('No fixture drift detected.\n');
  } catch (err) {
    console.error('\n❌ SMOKE TEST FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

runLiveSmokeTest();
