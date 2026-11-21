# Recipe page fixtures

Trimmed copies of real recipe pages, used by `importUrl.test.ts` to check that URL import keeps
each page's instructions. Fetched 2026-11-21.

| Fixture                                 | Source                                                               | Structured-data shape                                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `allrecipes-howtostep-array.html`       | https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/ | Top-level JSON-LD array; `@type: ["Recipe", "NewsArticle"]`; flat list of 9 `HowToStep`                                               |
| `recipetineats-howtosection-graph.html` | https://www.recipetineats.com/chicken-pot-pie/                       | `@graph`; 3 `HowToSection` groups (3 + 8 + 6 steps); section name with an HTML entity (`&amp;`); each step repeats its text as `name` |
| `bbcgoodfood-howtostep-object.html`     | https://www.bbcgoodfood.com/recipes/easy-pancakes                    | Single JSON-LD object; flat list of 5 `HowToStep`                                                                                     |

What was kept and what was changed:

- Kept as published: the JSON-LD container shape, `@context`, `@type`, `name`, `recipeYield`,
  `recipeIngredient` (verbatim), the `recipeInstructions` structure (section names, step count and
  order, which keys each step carries), and the `&amp;` entity in the RecipeTin Eats section name.
- Paraphrased: every step's `text` (and `name`, where the page repeated the text there). The
  wording is ours; the step order and meaning follow the original.
- Dropped: everything else on the page, including other JSON-LD nodes, step images, URLs and
  video objects, and all page markup.

None of the fetched pages used a plain string or an array of strings for `recipeInstructions`;
those shapes are covered by synthetic inline tests in `importUrl.test.ts`.
