import { GoogleGenAI } from '@google/genai';

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
  ]
}`;

function checkProductionGuard() {
  if (process.env.USE_GEMINI_FIXTURES === 'true' && process.env.NODE_ENV === 'production') {
    throw new Error(
      'CRITICAL SECURITY GUARD: USE_GEMINI_FIXTURES cannot be enabled when NODE_ENV=production!'
    );
  }
}

export async function parseRecipeTextWithGemini(text: string): Promise<string> {
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
    contents: [{ text: GEMINI_SYSTEM_PROMPT }, { text: `RAW USER RECIPE TEXT TO PARSE:\n${text}` }],
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
  timeoutMs = 30000
): Promise<string> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Gemini API request timed out after ${timeoutMs / 1000} seconds.`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([parseRecipeTextWithGemini(text), timeoutPromise]);
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
  mimeType: string
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
    ],
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
  timeoutMs = 30000
): Promise<string> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Gemini API request timed out after ${timeoutMs / 1000} seconds.`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      parseRecipeImageWithGemini(imageBuffer, mimeType),
      timeoutPromise,
    ]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
