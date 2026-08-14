# Practical Scaling

## Status: the shopping-list-rounding slice shipped; batch-size recommendation did not

**Shipped** (`packages/domain/src/shopping/practicalRounding.ts`, `applyPracticalRounding()`):
consolidated shopping-list items in the Count unit category (`count`/`clove`/`egg`/`onion`) are
rounded up to the nearest whole, buyable amount — "1 egg" instead of "0.25 egg," the headline
example below. Wired through every shopping-list-producing route (preview, save, event plan,
regenerate), same as `subtractPantryStock()`. Each item's response carries both the rounded
`quantity` and the exact `mathematicalQuantity`/`wasRoundedForPurchase` flag, surfaced in the UI
as a tooltip on the quantity badge.

**Deliberately built differently than originally proposed below**: instead of a curated
80-100-ingredient dataset keyed by `ingredientId`, atomicity is read directly off
`quantity.category === Count`. `ingredientId` is free-form text (user-typed or AI-extracted), not
a controlled vocabulary — a dataset keyed by it would silently miss most real recipes. The Count
unit registry, by contrast, is already a small, controlled set, and every unit in it is inherently
atomic (see `units.ts`'s own note on this). This reuses a distinction the domain already modeled
rather than inventing a second one.

**Not built, still open**: the "batch-size recommendation" idea (searching candidate serving
sizes 1/1.5/2/3/4 for the one that minimizes a rounding-waste cost score, e.g. "make 8 servings
instead of 6"). This conflicts with how EventPlanner already works today — a host plans for an
exact guest count, so recommending a _different_ batch size is a real product-design question,
not just an engineering one. The ingredient-behavior/policy layer, the curated dataset, and the
AI-explanation layer from the original design direction below were also not built — the Count/
Mass/Volume distinction turned out to cover the concrete, shippable part of this idea without them.

## One-sentence goal (original)

Practical Scaling augments mathematical recipe scaling with deterministic
cooking heuristics to produce recommendations that are more usable in a
home kitchen — e.g. recommending "use 1 egg, make 2 servings" instead of
"0.25 egg."

## Why this wasn't in v1

Mathematically correct scaling (scaleRecipe()) can produce technically
accurate but practically uncookable results for indivisible ingredients
(eggs, whole peppers, bay leaves). This is a real, separate problem from
unit conversion — but it requires new domain modeling (ingredient
behavior/policy, a curated ingredient dataset) and was deliberately
deferred until v1 (Milestones 1-9) was fully shipped, to protect scope
discipline.

## Design direction (if/when the still-open parts get built)

- Layering: Quantity (dumb, food-agnostic) -> Scaling Engine ->
  Ingredient Behavior/Policy -> Practical Scaling -> AI Explanation
  (optional, last).
- Quantity must NOT gain any food-specific knowledge. It stays a pure
  amount+unit+category value object, reusable outside cooking entirely.
- Ingredient behavior (atomic / divisible / continuous) and per-ingredient
  scaling policy are new domain concepts, not an extension of Quantity
  or UnitCategory.
- Only ship a curated dataset for ~80-100 common ingredients (egg, garlic,
  onion, butter, flour, etc.). Everything else defaults to "unknown" —
  unknown means "no practical advice available," not an error.
- Batch-size recommendation (e.g. "make 2 servings instead of 1") should
  be evaluated across a small fixed set of candidate serving sizes
  (1, 1.5, 2, 3, 4) using a heuristic cost score — this is a heuristic
  scoring system, explicitly NOT an optimization algorithm, and should
  never be described or marketed as one.
- The hard, interesting engineering problem here is inventing a
  defensible per-ingredient "cost of imprecise rounding" score — encoding
  cooking judgment — not the small brute-force search over candidates.
- Do not add "confidence: High/Medium" labels to any recommendation
  unless each level has an explicit, rigorously defined rule behind it
  (e.g. "High = derived entirely from known ingredients with deterministic
  rules"). Undefined confidence labels are decorative, not meaningful.
- AI's role, if added, is to explain a recommendation the deterministic
  engine already produced ("this recipe relies on whole eggs, so 2
  servings will scale much better") — not to invent the recommendation
  itself.
- User feedback (thumbs up/down on recommendations, or tracking overrides)
  is a plausible long-term signal for tuning heuristics, but requires
  real usage volume this project won't have as a solo/small-audience
  tool — not a v2 feature, keep in mind only as a distant future direction.

## Explicit non-goals

The batch-size recommendation search, the curated ingredient-behavior dataset, and the
AI-explanation layer above remain unbuilt and are not currently planned — see "Status" at the
top. This file exists so the idea isn't lost, not as a commitment to build the rest of it.
