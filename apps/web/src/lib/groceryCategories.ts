/**
 * Mirrors the string values of GroceryCategory in packages/domain/src/shopping/groceryCategory.ts.
 * apps/web talks to apps/api over HTTP only (never imports packages/domain directly), so this
 * list is duplicated here rather than shared — same pattern already used for dietary tag options
 * in RecipeForm.tsx.
 */
export const GROCERY_CATEGORY_ORDER = [
  'Produce',
  'Meat',
  'Seafood',
  'Dairy',
  'Bakery',
  'Frozen',
  'Pantry Staples',
  'Spices & Condiments',
  'Beverages',
  'Other',
] as const;

export interface CategoryGroup<T> {
  category: string;
  items: T[];
}

/**
 * Buckets items by their `category` field and orders the buckets to match
 * GROCERY_CATEGORY_ORDER. Any category value not in the known list (shouldn't happen, but keeps
 * this resilient to drift) is appended at the end in first-seen order.
 */
export function groupByCategory<T extends { category: string }>(
  items: readonly T[]
): CategoryGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const bucket = buckets.get(item.category);
    if (bucket) {
      bucket.push(item);
    } else {
      buckets.set(item.category, [item]);
    }
  }

  const ordered: CategoryGroup<T>[] = [];
  for (const category of GROCERY_CATEGORY_ORDER) {
    const bucket = buckets.get(category);
    if (bucket) {
      ordered.push({ category, items: bucket });
      buckets.delete(category);
    }
  }
  for (const [category, bucket] of buckets) {
    ordered.push({ category, items: bucket });
  }

  return ordered;
}
