/**
 * Open Question / Scope Notes:
 * - Categorization is a deterministic keyword heuristic over `ingredientId` + `displayName`,
 *   not an AI call — consistent with the "deterministic domain, AI at the edge" rule. It will
 *   misclassify ingredients whose name doesn't contain one of the known keywords (falls back
 *   to `Other`) or whose keyword is genuinely ambiguous (e.g. "pepper" could be a vegetable or
 *   a spice) — rule order below resolves ties by checking more specific categories first.
 * - No manual per-recipe override exists yet; a user cannot correct a wrong categorization.
 * - Not persisted anywhere — always recomputed from `ingredientId`/`displayName`, so improving
 *   the ruleset retroactively improves grouping for every existing recipe/list with no migration.
 */
export enum GroceryCategory {
  Produce = 'Produce',
  Meat = 'Meat',
  Seafood = 'Seafood',
  Dairy = 'Dairy',
  Bakery = 'Bakery',
  Frozen = 'Frozen',
  PantryStaples = 'Pantry Staples',
  SpicesAndCondiments = 'Spices & Condiments',
  Beverages = 'Beverages',
  Other = 'Other',
}

/** Display/grouping order — roughly mirrors a typical grocery store's aisle layout. */
export const GROCERY_CATEGORY_ORDER: readonly GroceryCategory[] = [
  GroceryCategory.Produce,
  GroceryCategory.Meat,
  GroceryCategory.Seafood,
  GroceryCategory.Dairy,
  GroceryCategory.Bakery,
  GroceryCategory.Frozen,
  GroceryCategory.PantryStaples,
  GroceryCategory.SpicesAndCondiments,
  GroceryCategory.Beverages,
  GroceryCategory.Other,
];

// Checked in this order — more specific/less ambiguous categories first, so e.g. "chicken broth"
// lands in Meat before Pantry Staples, and "bell pepper" lands in Produce before "pepper" could
// otherwise pull it toward Spices.
const KEYWORD_RULES: ReadonlyArray<readonly [GroceryCategory, readonly string[]]> = [
  [
    GroceryCategory.Seafood,
    [
      'fish',
      'shrimp',
      'prawn',
      'salmon',
      'tuna',
      'crab',
      'lobster',
      'cod',
      'tilapia',
      'shellfish',
      'scallop',
    ],
  ],
  [
    GroceryCategory.Meat,
    [
      'chicken',
      'beef',
      'pork',
      'bacon',
      'sausage',
      'turkey',
      'lamb',
      'steak',
      'ham',
      'ground meat',
      'veal',
    ],
  ],
  [GroceryCategory.Dairy, ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'egg']],
  [
    GroceryCategory.Bakery,
    ['bread', 'bun', 'roll', 'tortilla', 'bagel', 'pita', 'baguette', 'croissant'],
  ],
  [
    GroceryCategory.Produce,
    [
      'onion',
      'garlic',
      'tomato',
      'lettuce',
      'spinach',
      'carrot',
      'potato',
      'apple',
      'banana',
      'lemon',
      'lime',
      'avocado',
      'cucumber',
      'celery',
      'broccoli',
      'mushroom',
      'cilantro',
      'parsley',
      'basil',
      'bell pepper',
      'chili pepper',
      'jalapeno',
      'kale',
      'zucchini',
      'ginger',
      'scallion',
      'shallot',
      'cabbage',
      'corn',
      'squash',
      'berry',
      'grape',
      'melon',
      'peach',
      'pear',
      'mint',
    ],
  ],
  [GroceryCategory.Frozen, ['frozen', 'ice cream']],
  [
    GroceryCategory.Beverages,
    ['juice', 'soda', 'sparkling water', 'wine', 'beer', 'coffee', 'tea'],
  ],
  [
    GroceryCategory.SpicesAndCondiments,
    [
      'salt',
      'pepper',
      'spice',
      'cumin',
      'paprika',
      'oregano',
      'cinnamon',
      'nutmeg',
      'sauce',
      'ketchup',
      'mustard',
      'mayo',
      'vinegar',
      'oil',
      'honey',
      'syrup',
      'seasoning',
    ],
  ],
  [
    GroceryCategory.PantryStaples,
    [
      'flour',
      'sugar',
      'rice',
      'pasta',
      'noodle',
      'bean',
      'lentil',
      'oat',
      'cereal',
      'canned',
      'stock',
      'broth',
      'chocolate',
      'nut',
      'breadcrumb',
      'yeast',
      'baking powder',
      'baking soda',
      'water',
    ],
  ],
];

/**
 * Deterministically buckets an ingredient into a grocery-aisle-style category for shopping-list
 * grouping. Pure function of the ingredient's own identity/label — never stored, always
 * recomputed at read/serialization time.
 */
export function categorizeIngredient(ingredientId: string, displayName: string): GroceryCategory {
  const haystack = `${ingredientId} ${displayName}`.toLowerCase();

  for (const [category, keywords] of KEYWORD_RULES) {
    if (keywords.some((keyword) => haystack.includes(keyword))) {
      return category;
    }
  }

  return GroceryCategory.Other;
}
