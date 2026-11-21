/**
 * Open Question / Scope Notes:
 * - Categorization is a deterministic keyword heuristic over `ingredientId` + `displayName`,
 *   not an AI call — consistent with the "deterministic domain, AI at the edge" rule. It will
 *   misclassify ingredients whose name doesn't contain one of the known keywords (falls back
 *   to `Other`) or whose keyword is genuinely ambiguous (e.g. "pepper" could be a vegetable or
 *   a spice).
 * - Keywords match whole words, never substrings: "egg" must not match "eggplant", "ham" must
 *   not match "graham", "oil" must not match "foil". Plurals match ("eggs", "tomatoes",
 *   "berries"), and compound words that belong in an aisle are listed as keywords of their own
 *   ("buttermilk", "strawberry", "walnut").
 * - The match with the most words wins ("ice cream" beats "cream", "baking soda" beats "soda");
 *   between equally long matches, rule order below decides.
 * - Users can correct a category per ingredient through manual overrides, applied outside this
 *   function.
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

// Rule order breaks ties between equally long matches — more specific/less ambiguous categories
// first, so e.g. "chicken broth" lands in Meat before Pantry Staples, and "lemon juice" in Produce
// before Beverages. A multi-word keyword ("bell pepper") beats a single word ("pepper")
// regardless of order.
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
      'goat',
      'steak',
      'ham',
      'ground meat',
      'veal',
    ],
  ],
  [
    GroceryCategory.Dairy,
    [
      'milk',
      'buttermilk',
      'cheese',
      'ricotta',
      'mozzarella',
      'parmesan',
      'cheddar',
      'feta',
      'goat cheese',
      'butter',
      'cream',
      'yogurt',
      'yoghurt',
      'egg',
    ],
  ],
  [
    GroceryCategory.Bakery,
    [
      'bread',
      'flatbread',
      'cornbread',
      'bun',
      'roll',
      'tortilla',
      'bagel',
      'pita',
      'baguette',
      'croissant',
    ],
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
      'pineapple',
      'banana',
      'lemon',
      'lemongrass',
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
      'eggplant',
      'ginger',
      'scallion',
      'shallot',
      'cabbage',
      'corn',
      'squash',
      'watercress',
      'berry',
      'strawberry',
      'blueberry',
      'raspberry',
      'blackberry',
      'grape',
      'grapefruit',
      'melon',
      'watermelon',
      'peach',
      'pear',
      'mint',
    ],
  ],
  [GroceryCategory.Frozen, ['frozen', 'ice cream']],
  [
    GroceryCategory.Beverages,
    ['juice', 'soda', 'sparkling water', 'wine', 'champagne', 'beer', 'coffee', 'tea'],
  ],
  [
    GroceryCategory.SpicesAndCondiments,
    [
      'salt',
      'pepper',
      'peppercorn',
      'spice',
      'cumin',
      'paprika',
      'oregano',
      'cinnamon',
      'nutmeg',
      'garlic powder',
      'onion powder',
      'cream of tartar',
      'sauce',
      'ketchup',
      'mustard',
      'mayo',
      'mayonnaise',
      'vinegar',
      'wine vinegar',
      'cider vinegar',
      'champagne vinegar',
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
      'barley',
      'cornstarch',
      'cornmeal',
      'cereal',
      'cornflake',
      'applesauce',
      'cracker',
      'graham cracker',
      'canned',
      'stock',
      'broth',
      'chocolate',
      'nut',
      'peanut',
      'walnut',
      'almond',
      'pecan',
      'cashew',
      'hazelnut',
      'peanut butter',
      'breadcrumb',
      'yeast',
      'baking powder',
      'baking soda',
      'water',
    ],
  ],
];

/** Lowercase words with accents stripped ("Jalapeños" → "jalapenos"); anything else separates. */
function toWords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/** True when `word` is `keyword` or a regular plural of it (s, es, y → ies). */
function wordMatches(word: string, keyword: string): boolean {
  return (
    word === keyword ||
    word === `${keyword}s` ||
    word === `${keyword}es` ||
    (keyword.endsWith('y') && word === `${keyword.slice(0, -1)}ies`)
  );
}

/** True when the keyword's words appear consecutively in `words`. */
function phraseMatches(words: readonly string[], keywordWords: readonly string[]): boolean {
  for (let start = 0; start + keywordWords.length <= words.length; start++) {
    if (keywordWords.every((keyword, i) => wordMatches(words[start + i], keyword))) return true;
  }
  return false;
}

const COMPILED_RULES = KEYWORD_RULES.map(
  ([category, keywords]) => [category, keywords.map((keyword) => keyword.split(' '))] as const
);

/**
 * Deterministically buckets an ingredient into a grocery-aisle-style category for shopping-list
 * grouping. Pure function of the ingredient's own identity/label — never stored, always
 * recomputed at read/serialization time.
 */
export function categorizeIngredient(ingredientId: string, displayName: string): GroceryCategory {
  const words = toWords(`${ingredientId} ${displayName}`);

  let best = GroceryCategory.Other;
  let bestLength = 0;
  for (const [category, keywords] of COMPILED_RULES) {
    for (const keywordWords of keywords) {
      // Strictly longer only, so an earlier rule keeps an equally long match.
      if (keywordWords.length > bestLength && phraseMatches(words, keywordWords)) {
        best = category;
        bestLength = keywordWords.length;
      }
    }
  }
  return best;
}
