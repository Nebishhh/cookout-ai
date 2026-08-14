import { GoogleGenAI, Type, type Schema } from '@google/genai';

const GEMINI_SYSTEM_PROMPT = `You are a specialized AI recipe extractor for CookOut AI.
Your task is to parse raw recipe input (text, web page content, handwritten notes, or recipe cards) into a clean, structured JSON format.

CRITICAL INSTRUCTIONS:
1. You MUST return ONLY valid JSON matching the exact schema below. Do NOT wrap in markdown \`\`\`json blocks or add any markdown formatting or commentary.
2. If the input is NOT a recipe (e.g. general article, photo of a mountain, unrelated text), you MUST return JSON with an error field:
   {"error": "NoRecipeFound", "message": "The provided image or text does not contain explicit recipe ingredients or quantities."}
3. Standardize all ingredient units into one of these allowed units:
   ["g", "kg", "oz", "lb", "ml", "l", "tsp", "tbsp", "cup", "fl oz", "count", "clove", "egg", "onion"]
   If an ingredient has no unit (e.g., "2 apples"), use "count".
4. Standardize dietaryTags if explicitly stated or clearly inferrable: ["Vegetarian", "Vegan"]. If omnivore / contains meat / unknown, return an empty array [].
5. Extract cooking steps as "instructions": an ordered array of objects, one per instruction, in the order they should be performed. Each object has an "instruction" string, plus OPTIONAL "duration", "temperature", and "notes" fields — include duration/temperature ONLY when explicitly stated in the source text for that step (e.g. "bake for 25 minutes at 350°F"); include "notes" ONLY when the source text has a distinct aside/tip/warning attached to that step (e.g. "Tip: don't overmix the batter" or "Careful, the handle will be hot"), as a plain string separate from the instruction itself. OMIT any of these fields entirely otherwise. Never guess or infer a typical duration/temperature/notes that isn't stated. If the input has no instructions (e.g. an ingredients-only recipe card), return an empty array [].

OUTPUT JSON SCHEMA:
{
  "name": "Recipe Title",
  "baseServings": 4,
  "dietaryTags": ["Vegetarian"],
  "ingredients": [
    {
      "ingredientId": "chicken_breast",
      "displayName": "Chicken Breast",
      "amount": 500,
      "unit": "g"
    }
  ],
  "instructions": [
    {
      "instruction": "Preheat the oven to 400°F.",
      "temperature": { "amount": 400, "unit": "F" }
    },
    {
      "instruction": "Season the chicken breast and place on a baking sheet."
    },
    {
      "instruction": "Bake until cooked through.",
      "duration": { "amount": 25, "unit": "minutes" },
      "temperature": { "amount": 400, "unit": "F" },
      "notes": "Tent with foil if browning too quickly."
    }
  ]
}`;

/**
 * OpenAPI-subset schema (per @google/genai's GenerateContentConfig.responseSchema) enforced on
 * live generateContent() calls — the root cause of instructions occasionally going missing (and,
 * more severely, of ingredients sometimes going missing entirely — see issue #1) on a live
 * (non-fixture) response was that the root object had no `required` fields at all, so a response
 * like `{name: "everything crammed into one string"}` was schema-valid. Split into two shapes
 * combined via `anyOf` instead of one flat optional-everywhere object: RECIPE_ERROR_SHAPE for the
 * intentional {error, message} "not a recipe" response, RECIPE_SUCCESS_SHAPE for an actual recipe
 * draft, each with its own `required`. `ingredients` also gets `minItems: '1'` so an empty array
 * doesn't pass either. This narrows the failure window but doesn't close it — the app-layer
 * shape guard + bounded retry in aiRecipeExtraction.ts is the real backstop, since structured
 * output enforcement makes shape compliance more reliable, not guaranteed, for a live response.
 */
const RECIPE_ERROR_SHAPE: Schema = {
  type: Type.OBJECT,
  properties: {
    error: { type: Type.STRING },
    message: { type: Type.STRING },
  },
  required: ['error', 'message'],
};

const RECIPE_SUCCESS_SHAPE: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    baseServings: { type: Type.INTEGER },
    dietaryTags: { type: Type.ARRAY, items: { type: Type.STRING } },
    ingredients: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          ingredientId: { type: Type.STRING },
          displayName: { type: Type.STRING },
          amount: { type: Type.NUMBER },
          unit: { type: Type.STRING },
        },
        required: ['ingredientId', 'displayName', 'amount', 'unit'],
      },
      minItems: '1',
    },
    instructions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          instruction: { type: Type.STRING },
          duration: {
            type: Type.OBJECT,
            properties: {
              amount: { type: Type.NUMBER },
              unit: { type: Type.STRING, enum: ['minutes', 'hours'] },
            },
            required: ['amount', 'unit'],
          },
          temperature: {
            type: Type.OBJECT,
            properties: {
              amount: { type: Type.NUMBER },
              unit: { type: Type.STRING, enum: ['F', 'C'] },
            },
            required: ['amount', 'unit'],
          },
          notes: { type: Type.STRING },
        },
        required: ['instruction'],
      },
    },
  },
  required: ['name', 'baseServings', 'ingredients', 'instructions'],
};

const RECIPE_RESPONSE_SCHEMA: Schema = {
  anyOf: [RECIPE_ERROR_SHAPE, RECIPE_SUCCESS_SHAPE],
};

/**
 * Appended as an extra content block on a retry (reinforceShape=true), after a first attempt's
 * response passed JSON.parse but failed hasMinimalRecipeShape() — i.e. the model produced valid
 * JSON that wasn't usable (see issue #1: everything crammed into "name", no "ingredients" array).
 */
const SHAPE_REINFORCEMENT_PROMPT = `SHAPE CORRECTION REQUIRED: Your previous response was syntactically valid JSON but did not match the required recipe shape — most likely because ingredient or instruction details were crammed into a single field (such as "name") instead of the separate "ingredients"/"instructions" arrays. Re-extract the SAME input and return a complete JSON object with "name" (a short title string only — do not include ingredient or instruction text in it), "baseServings" (a number), a non-empty "ingredients" array of {ingredientId, displayName, amount, unit} objects (one entry per distinct ingredient), and an "instructions" array (each entry an object with an "instruction" string; use an empty array [] only if the input truly has no steps). If, and only if, the input genuinely is not a recipe at all, return {"error": "NoRecipeFound", "message": "..."} instead.`;

function checkProductionGuard() {
  if (process.env.USE_GEMINI_FIXTURES === 'true' && process.env.NODE_ENV === 'production') {
    throw new Error(
      'CRITICAL SECURITY GUARD: USE_GEMINI_FIXTURES cannot be enabled when NODE_ENV=production!'
    );
  }
}

export async function parseRecipeTextWithGemini(
  text: string,
  reinforceShape = false
): Promise<string> {
  checkProductionGuard();

  if (process.env.USE_GEMINI_FIXTURES === 'true') {
    const fixturePath = './__fixtures__/recordedGeminiFixtures.js';
    const { TEXT_IMPORT_FIXTURE, URL_IMPORT_FIXTURE } = await import(fixturePath);
    if (text.includes('FAILURE_CASE_TEST') || text.includes('NO_RECIPE')) {
      return JSON.stringify({
        error: 'NoRecipeFound',
        message:
          'The provided image or text does not contain explicit recipe ingredients or quantities.',
      });
    }
    if (text.includes('http://') || text.includes('https://') || text.includes('URL_TEST')) {
      return JSON.stringify(URL_IMPORT_FIXTURE);
    }
    return JSON.stringify(TEXT_IMPORT_FIXTURE);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      { text: GEMINI_SYSTEM_PROMPT },
      { text: `RAW USER RECIPE TEXT TO PARSE:\n${text}` },
      ...(reinforceShape ? [{ text: SHAPE_REINFORCEMENT_PROMPT }] : []),
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: RECIPE_RESPONSE_SCHEMA,
    },
  });

  const responseText = response.text;
  if (!responseText) {
    throw new Error('Empty response received from Gemini API.');
  }

  return responseText;
}

/**
 * Wraps parseRecipeTextWithGemini with a ~30-second timeout.
 * Reuses the existing parseRecipeTextWithGemini function unmodified.
 */
export async function parseRecipeTextWithGeminiTimeout(
  text: string,
  timeoutMs = 30000,
  reinforceShape = false
): Promise<string> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Gemini API request timed out after ${timeoutMs / 1000} seconds.`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      parseRecipeTextWithGemini(text, reinforceShape),
      timeoutPromise,
    ]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Sends a validated image buffer to Gemini's vision endpoint asking it to extract structured recipe data.
 */
export async function parseRecipeImageWithGemini(
  imageBuffer: Buffer,
  mimeType: string,
  reinforceShape = false
): Promise<string> {
  checkProductionGuard();

  if (process.env.USE_GEMINI_FIXTURES === 'true') {
    const fixturePath = './__fixtures__/recordedGeminiFixtures.js';
    const { IMAGE_IMPORT_FIXTURE, CAMERA_IMPORT_FIXTURE } = await import(fixturePath);
    const rawContent = imageBuffer.toString('utf-8');
    if (rawContent.includes('FAILURE_PHOTO') || rawContent.includes('NON_RECIPE')) {
      return JSON.stringify({
        error: 'NoRecipeFound',
        message:
          'The provided image or text does not contain explicit recipe ingredients or quantities.',
      });
    }
    if (rawContent.includes('CAMERA_PHOTO') || rawContent.includes('camera')) {
      return JSON.stringify(CAMERA_IMPORT_FIXTURE);
    }
    return JSON.stringify(IMAGE_IMPORT_FIXTURE);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  const base64Data = imageBuffer.toString('base64');

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      { text: GEMINI_SYSTEM_PROMPT },
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
      { text: 'IMAGE OF RECIPE CARD / COOKBOOK PAGE / HANDWRITTEN RECIPE TO PARSE' },
      ...(reinforceShape ? [{ text: SHAPE_REINFORCEMENT_PROMPT }] : []),
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: RECIPE_RESPONSE_SCHEMA,
    },
  });

  const responseText = response.text;
  if (!responseText) {
    throw new Error('Empty response received from Gemini API.');
  }

  return responseText;
}

/**
 * Wraps parseRecipeImageWithGemini with a ~30-second timeout.
 */
export async function parseRecipeImageWithGeminiTimeout(
  imageBuffer: Buffer,
  mimeType: string,
  timeoutMs = 30000,
  reinforceShape = false
): Promise<string> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Gemini API request timed out after ${timeoutMs / 1000} seconds.`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      parseRecipeImageWithGemini(imageBuffer, mimeType, reinforceShape),
      timeoutPromise,
    ]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Extraction target for the natural-language event-planning wrapper — entirely separate from
 * the recipe-import prompt/schema above; this is only the AI-fallback path used when
 * `parseGuestGroupText()` (packages/domain) can't confidently determine a guest count from
 * free text on its own. Applies the anyOf-with-real-`required` schema shape from the start
 * (the fix issue #1 applied to the recipe schema after the fact), and deliberately has no
 * bounded-retry/reinforcement-prompt mechanism: the target here is one required integer plus
 * two optional ones, with no nested-array structure for a model to garble the way it garbled
 * `ingredients`/`instructions` in issue #1, so that machinery isn't proportionate to this
 * problem's actual complexity — see aiRecipeExtraction.ts for the recipe-import equivalent
 * this deliberately doesn't reuse.
 */
const GUEST_GROUP_SYSTEM_PROMPT = `You are a specialized assistant for CookOut AI that extracts a guest headcount breakdown from a short free-text event description.

CRITICAL INSTRUCTIONS:
1. Return ONLY valid JSON matching the schema below. No markdown, no commentary.
2. Extract:
   - "totalGuests": total attendees (required, positive integer).
   - "vegetarianCount": guests who are vegetarian, INCLUSIVE of vegan guests (every vegan is also counted here). Default 0 if unmentioned.
   - "veganCount": guests who are specifically vegan (a subset of vegetarianCount). Default 0 if unmentioned.
3. If the text does not clearly state or reasonably imply a total guest count, return instead:
   {"error": "AmbiguousGuestCount", "message": "<why>"}
4. Never invent a number that isn't stated or clearly implied.`;

const GUEST_GROUP_ERROR_SHAPE: Schema = {
  type: Type.OBJECT,
  properties: {
    error: { type: Type.STRING },
    message: { type: Type.STRING },
  },
  required: ['error', 'message'],
};

const GUEST_GROUP_SUCCESS_SHAPE: Schema = {
  type: Type.OBJECT,
  properties: {
    totalGuests: { type: Type.INTEGER },
    vegetarianCount: { type: Type.INTEGER },
    veganCount: { type: Type.INTEGER },
  },
  required: ['totalGuests'],
};

const GUEST_GROUP_RESPONSE_SCHEMA: Schema = {
  anyOf: [GUEST_GROUP_ERROR_SHAPE, GUEST_GROUP_SUCCESS_SHAPE],
};

export async function parseGuestGroupWithGemini(description: string): Promise<string> {
  checkProductionGuard();

  if (process.env.USE_GEMINI_FIXTURES === 'true') {
    const fixturePath = './__fixtures__/recordedGeminiFixtures.js';
    const { GUEST_GROUP_FIXTURE } = await import(fixturePath);
    if (description.includes('AMBIGUOUS_GUEST_COUNT_TEST')) {
      return JSON.stringify({
        error: 'AmbiguousGuestCount',
        message: 'The provided description does not clearly state a total guest count.',
      });
    }
    return JSON.stringify(GUEST_GROUP_FIXTURE);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      { text: GUEST_GROUP_SYSTEM_PROMPT },
      { text: `EVENT DESCRIPTION TO PARSE:\n${description}` },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: GUEST_GROUP_RESPONSE_SCHEMA,
    },
  });

  const responseText = response.text;
  if (!responseText) {
    throw new Error('Empty response received from Gemini API.');
  }

  return responseText;
}

/**
 * Wraps parseGuestGroupWithGemini with a ~30-second timeout.
 */
export async function parseGuestGroupWithGeminiTimeout(
  description: string,
  timeoutMs = 30000
): Promise<string> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Gemini API request timed out after ${timeoutMs / 1000} seconds.`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([parseGuestGroupWithGemini(description), timeoutPromise]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
