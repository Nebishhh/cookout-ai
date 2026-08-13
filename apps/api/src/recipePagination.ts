import { InvalidRecipeError } from '@cookout-ai/domain';

export interface RecipeCursor {
  createdAt: Date;
  id: string;
}

/**
 * Opaque cursor for GET /api/recipes?limit=... pagination: base64-encodes the last row's
 * (createdAt, id) pair. `id` is the tie-breaker — createdAt isn't @unique on Recipe, and
 * ties are plausible in fast test/seed runs, so a cursor keyed on createdAt alone could
 * skip or repeat rows.
 */
export function encodeRecipeCursor(cursor: RecipeCursor): string {
  return Buffer.from(
    JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id })
  ).toString('base64url');
}

/** Throws InvalidRecipeError (-> 400) for a malformed or tampered cursor. */
export function decodeRecipeCursor(raw: string): RecipeCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8'));
  } catch {
    throw new InvalidRecipeError(`Invalid cursor: "${raw}".`);
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as { createdAt?: unknown }).createdAt !== 'string' ||
    typeof (parsed as { id?: unknown }).id !== 'string'
  ) {
    throw new InvalidRecipeError(`Invalid cursor: "${raw}".`);
  }

  const { createdAt, id } = parsed as { createdAt: string; id: string };
  const parsedDate = new Date(createdAt);
  if (Number.isNaN(parsedDate.getTime()) || id.trim().length === 0) {
    throw new InvalidRecipeError(`Invalid cursor: "${raw}".`);
  }

  return { createdAt: parsedDate, id };
}
