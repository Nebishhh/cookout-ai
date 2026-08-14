export interface ParsedGuestGroupText {
  totalGuests: number;
  vegetarianCount: number;
  veganCount: number;
}

const FOR_OF_TOTAL = /\b(?:for|of)\s+(\d{1,4})\b/i;
const COUNT_KEYWORD_TOTAL = /\b(\d{1,4})\s*(?:guests?|people|attendees|diners?)\b/i;
const VEGETARIAN_COUNT = /\b(\d{1,4})\s*(?:vegetarians?|veggies?)\b/i;
const VEGAN_COUNT = /\b(\d{1,4})\s*vegans?\b/i;

/**
 * Deterministic, narrow keyword/number extractor for a free-text event description — the
 * regex-first half of the natural-language event-planning wrapper. Not an NLP engine: word-
 * numbers ("twelve", "a dozen") and combined phrasing ("12 vegetarian and vegan guests") are
 * deliberately unsupported. Returns `null` when `totalGuests` can't be confidently determined,
 * which is the sole signal the caller uses to fall back to an AI call — mirrors the pure-
 * heuristic-in-the-domain-package precedent already set by `categorizeIngredient()`.
 *
 * Extraction only, never correction: values are returned exactly as found, even if they'd later
 * violate `GuestGroup`'s invariants (e.g. veganCount > vegetarianCount) — that enforcement is
 * `GuestGroup`'s job, not this parser's. Keeping that boundary sharp avoids duplicating
 * validation logic in two places.
 */
export function parseGuestGroupText(text: string): ParsedGuestGroupText | null {
  const totalMatch = text.match(FOR_OF_TOTAL) ?? text.match(COUNT_KEYWORD_TOTAL);
  if (!totalMatch) {
    return null;
  }

  const veganMatch = text.match(VEGAN_COUNT);
  const vegetarianMatch = text.match(VEGETARIAN_COUNT);

  const veganCount = veganMatch ? parseInt(veganMatch[1], 10) : 0;
  // A vegan guest is, by GuestGroup's own inclusive-subset model, also a vegetarian guest — if
  // the text names a vegan count but never says "vegetarian", infer vegetarianCount from it
  // rather than defaulting to 0, which would misrepresent an otherwise-unambiguous input.
  const vegetarianCount = vegetarianMatch ? parseInt(vegetarianMatch[1], 10) : veganCount;

  return {
    totalGuests: parseInt(totalMatch[1], 10),
    vegetarianCount,
    veganCount,
  };
}
