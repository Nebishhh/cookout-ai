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
  recipeInstructions?: unknown;
}

/**
 * Generous caps on what one page can contribute to the Gemini prompt. Real recipes stay far
 * below both; hitting either adds a warning to the import result so nothing is dropped silently.
 */
export const MAX_INSTRUCTION_STEPS = 100;
export const MAX_INSTRUCTION_STEP_CHARS = 2000;

type InstructionEntry = { kind: 'section'; name: string } | { kind: 'step'; text: string };

// Closing block-level tags and line breaks. A space goes after each before the markup is stripped,
// so "<p>Mix</p><p>Rest</p>" reads "Mix Rest", not "MixRest".
const BLOCK_BOUNDARY =
  /<\/(?:p|div|li|ul|ol|h[1-6]|tr|td|th|blockquote|section|article|header|footer)\s*>|<br\s*\/?>/gi;

/** Plain text from a JSON-LD string that may carry HTML tags or entities ("Mix &amp; <b>rest</b>"). */
function toPlainText(raw: string): string {
  const text = /[<&]/.test(raw)
    ? cheerio
        .load(`<body>${raw.replace(BLOCK_BOUNDARY, '$& ')}</body>`)('body')
        .text()
    : raw;
  return text.replace(/\s+/g, ' ').trim();
}

function hasType(obj: Record<string, unknown>, type: string): boolean {
  const t = obj['@type'];
  return t === type || (Array.isArray(t) && t.includes(type));
}

/**
 * Flattens schema.org recipeInstructions into ordered sections and steps. Handles a single string
 * (one step per line), arrays of strings, HowToStep objects (`text`, falling back to `name`), and
 * HowToSection groups (`name` plus nested `itemListElement`), at any nesting depth.
 */
function collectInstructions(value: unknown, out: InstructionEntry[] = []): InstructionEntry[] {
  if (typeof value === 'string') {
    for (const line of value.split(/\r?\n/)) {
      const text = toPlainText(line);
      if (text) out.push({ kind: 'step', text });
    }
  } else if (Array.isArray(value)) {
    for (const item of value) collectInstructions(item, out);
  } else if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (hasType(obj, 'HowToSection') || (Array.isArray(obj.itemListElement) && !obj.text)) {
      const name = typeof obj.name === 'string' ? toPlainText(obj.name) : '';
      if (name) out.push({ kind: 'section', name });
      collectInstructions(obj.itemListElement, out);
    } else {
      const raw = typeof obj.text === 'string' ? obj.text : obj.name;
      if (typeof raw === 'string') collectInstructions(raw, out);
    }
  }
  return out;
}

/**
 * Renders instructions as an "Instructions:" block with steps numbered across sections, applying
 * the caps above. Each cap that is hit adds a warning instead of dropping content silently.
 */
function formatInstructions(value: unknown): { lines: string[]; warnings: string[] } {
  const entries = collectInstructions(value);
  const totalSteps = entries.filter((e) => e.kind === 'step').length;
  if (totalSteps === 0) return { lines: [], warnings: [] };

  const lines = ['Instructions:'];
  const warnings: string[] = [];
  const maxChars = MAX_INSTRUCTION_STEP_CHARS.toLocaleString('en-US');
  let pendingSection: string | null = null;
  let stepNumber = 0;

  for (const entry of entries) {
    if (entry.kind === 'section') {
      pendingSection = entry.name; // printed only if a kept step follows it
      continue;
    }
    if (stepNumber === MAX_INSTRUCTION_STEPS) break;
    stepNumber++;
    if (pendingSection) {
      lines.push(pendingSection);
      pendingSection = null;
    }
    let text = entry.text;
    if (text.length > MAX_INSTRUCTION_STEP_CHARS) {
      text = `${text.slice(0, MAX_INSTRUCTION_STEP_CHARS - 1)}…`;
      warnings.push(
        `Step ${stepNumber} was longer than ${maxChars} characters and was shortened. Check it against the original page.`
      );
    }
    lines.push(`${stepNumber}. ${text}`);
  }

  if (totalSteps > MAX_INSTRUCTION_STEPS) {
    warnings.push(
      `This page lists ${totalSteps} instruction steps; only the first ${MAX_INSTRUCTION_STEPS} were imported. Add the rest by hand.`
    );
  }
  return { lines, warnings };
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
function formatJsonLdRecipeText(recipe: JsonLdRecipeObject): {
  text: string;
  warnings: string[];
} {
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

  const instructions = formatInstructions(recipe.recipeInstructions);
  lines.push(...instructions.lines);

  return { text: lines.join('\n').trim(), warnings: instructions.warnings };
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
  /** User-facing notes about content that was capped; empty when nothing was. */
  warnings: string[];
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
        const formatted = formatJsonLdRecipeText(recipeObj);
        if (formatted.text && formatted.text.length >= 10) {
          return {
            extractedText: formatted.text,
            extractionMethod: 'JSON-LD',
            warnings: formatted.warnings,
          };
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

  return { extractedText: cleanedText, extractionMethod: 'HTML-Text Fallback', warnings: [] };
}
