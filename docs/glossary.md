# CookOut AI - Domain Glossary

This glossary defines key domain terminology used across the CookOut AI codebase, documentation, and API contracts.

---

### Core Concepts

#### Cookout Event

A planned gathering (e.g., BBQ, block party, family reunion) associated with a target guest headcount, adult/child proportion breakdown, menu selections, and prep schedule.

The prep schedule is the **Cook Schedule** (`computeCookSchedule()`, `packages/domain/src/events/cookSchedule.ts`): given the Event's `serveTimeMinutes`, it works backwards through each included recipe's step durations to produce a start time per dish, sorted earliest-first. Oven/equipment conflict detection is explicitly _not_ part of it — see `docs/ideas/cook-scheduling.md`.

#### Recipe

A structured set of ingredients, base serving size, instructions, preparation time, and cooking tags.

#### Base Servings

The standard number of portions a recipe produces in its original unscaled state (e.g., 4 servings).

#### Scaled Quantity

The calculated ingredient amount required when scaling a recipe's base servings up or down to match an event's target guest count or portion multiplier.

#### Ingredient

A specific food item in a recipe defined by name, quantity, measurement unit, category (e.g., Produce, Meat, Spices), and optional pantry/dietary attributes.

#### Unit of Measurement

The scale used for ingredient quantities. Standardized into:

- **Volume**: Teaspoon (tsp), Tablespoon (tbsp), Fluid Ounce (fl oz), Cup (cup), Pint (pt), Quart (qt), Gallon (gal), Milliliter (ml), Liter (l).
- **Weight**: Ounce (oz), Pound (lb), Gram (g), Kilogram (kg).
- **Count**: Item, Piece, Clove, Pinch, Dash, Can, Package.

#### Unit Conversion & Normalization

The algorithm that converts disparate units (e.g., 8 tbsp to 0.5 cups or 16 oz to 1 lb) so ingredients can be aggregated accurately.

#### Consolidated Shopping List

A merged list of all required ingredients across all recipes selected for a Cookout Event, grouped by store aisle/category, with unit-normalized total quantities minus available pantry items.

#### Pantry Inventory

The collection of ingredients currently in stock in a user's kitchen/pantry with quantities and expiration statuses, used to reduce shopping list purchasing requirements.

#### Portion Multiplier

A factor applied to recipe calculations to accommodate heavy eaters, extra sides, leftovers, or dietary specific adjustments (e.g., 1.25x scaling).

#### Gemini Recipe Import

The process of sending raw recipe text, images, or URL content to Google Gemini AI models to extract structured JSON data adhering to domain recipe schemas.
