import * as cheerio from 'cheerio';

/**
 * Open Questions / Scope Notes for Recipe Extraction:
 * - Naive HTML-to-text fallback may extract noise (navigation links, ads, footer text) alongside recipe text.
 * - Image import remains out of scope for this milestone.
 * - JSON-LD extraction supports standard schema.org Recipe shapes (single object, array, @graph, string/array @type).
 */

export class ExtractionError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'ExtractionError';
    this.statusCode = statusCode;
  }
}

interface JsonLdRecipeObject {
  '@type'?: string | string[];
  name?: string;
  recipeIngredient?: string | string[];
  recipeYield?: string | number | (string | number)[];
  yield?: string | number | (string | number)[];
  servings?: string | number;
}

/**
 * Helper to determine if a JSON-LD object is a schema.org Recipe.
 */
function isRecipeType(typeProp: unknown): boolean {
  if (typeof typeProp === 'string') {
    return typeProp.toLowerCase() === 'recipe';
  }
  if (Array.isArray(typeProp)) {
    return typeProp.some((t) => typeof t === 'string' && t.toLowerCase() === 'recipe');
  }
  return false;
}

/**
 * Recursively searches a parsed JSON-LD structure (object, array, or @graph)
 * for the first object matching schema.org Recipe.
 */
function findRecipeObjectInJson(data: unknown): JsonLdRecipeObject | null {
  if (!data || typeof data !== 'object') return null;

  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeObjectInJson(item);
      if (found) return found;
    }
    return null;
  }

  const obj = data as Record<string, unknown>;

  if (isRecipeType(obj['@type'])) {
    return obj as JsonLdRecipeObject;
  }

  if (Array.isArray(obj['@graph'])) {
    for (const item of obj['@graph']) {
      const found = findRecipeObjectInJson(item);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Formats a valid JSON-LD Recipe object into a clean text block for Gemini parsing.
 */
function formatJsonLdRecipeText(recipe: JsonLdRecipeObject): string {
  const lines: string[] = [];

  if (recipe.name) {
    lines.push(`Recipe Name: ${recipe.name}`);
  }

  const yieldVal = recipe.recipeYield ?? recipe.yield ?? recipe.servings;
  if (yieldVal !== undefined && yieldVal !== null) {
    const yieldStr = Array.isArray(yieldVal) ? yieldVal.join(', ') : String(yieldVal);
    lines.push(`Servings: ${yieldStr}`);
  }

  if (recipe.recipeIngredient) {
    lines.push('Ingredients:');
    const ingredients = Array.isArray(recipe.recipeIngredient)
      ? recipe.recipeIngredient
      : [recipe.recipeIngredient];

    for (const ing of ingredients) {
      if (typeof ing === 'string' && ing.trim()) {
        lines.push(`- ${ing.trim()}`);
      }
    }
  }

  return lines.join('\n').trim();
}

const MAX_JSON_LD_BLOCK_BYTES = 500 * 1024; // 500KB individual block limit

/**
 * Extracts recipe content from HTML.
 * Priority 1: schema.org Recipe JSON-LD script blocks (< 500KB each, per-block error tolerance).
 * Priority 2: Naive HTML-to-text fallback stripping script/style tags.
 * Throws ExtractionError (502) if no usable text is extracted.
 */
export function extractRecipeText(html: string): {
  extractedText: string;
  extractionMethod: 'JSON-LD' | 'HTML-Text Fallback';
} {
  if (!html || !html.trim()) {
    throw new ExtractionError('HTML content is empty.', 502);
  }

  const $ = cheerio.load(html);

  // Priority 1: JSON-LD script blocks
  const jsonLdBlocks = $('script[type="application/ld+json"]');

  for (let i = 0; i < jsonLdBlocks.length; i++) {
    const scriptEl = $(jsonLdBlocks[i]);
    const rawText = scriptEl.text().trim();

    if (!rawText) continue;

    // Skip oversized script blocks (>500KB)
    if (Buffer.byteLength(rawText, 'utf8') > MAX_JSON_LD_BLOCK_BYTES) {
      continue;
    }

    try {
      const parsedJson = JSON.parse(rawText);
      const recipeObj = findRecipeObjectInJson(parsedJson);

      if (recipeObj) {
        const formattedText = formatJsonLdRecipeText(recipeObj);
        if (formattedText && formattedText.length >= 10) {
          return { extractedText: formattedText, extractionMethod: 'JSON-LD' };
        }
      }
    } catch {
      // Per-block error tolerance: log/skip malformed JSON-LD block and continue to next
      continue;
    }
  }

  // Priority 2: Naive HTML-to-text extraction fallback
  // Strip non-content elements
  $('script, style, noscript, svg, iframe, header, footer, nav').remove();

  const bodyText = $('body').text() || $.text();
  const cleanedText = bodyText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

  if (!cleanedText || cleanedText.trim().length < 10) {
    throw new ExtractionError(
      'No usable recipe text or JSON-LD content could be extracted from the webpage.',
      502
    );
  }

  return { extractedText: cleanedText, extractionMethod: 'HTML-Text Fallback' };
}
