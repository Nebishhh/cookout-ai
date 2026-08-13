# CookOut AI — Competitive Intelligence Report

**Date:** 2026-08-13
**Scope:** CookOut AI vs. Paprika Recipe Manager 3, Mealime, Plan to Eat, AnyList, Mela.
**Method:** CookOut AI was audited from its own source and driven live end-to-end (dev server + browser automation). Competitors were researched exclusively from public material — marketing sites, pricing pages, help docs, app-store listings, and third-party reviews — no accounts were created and no paywalls were bypassed.

**Tag legend** — every non-trivial claim below carries one of:

- **[FACT]** — verified directly against CookOut's own code, live system, or docs. Only available for CookOut.
- **[OBSERVATION]** — recorded from a competitor's own public material, cited.
- **[INFERENCE]** — reconstructed from OBSERVATIONs; named and flagged as reconstruction, not a verified run.
- **[STRATEGIC JUDGMENT]** — an interpretive call (a Parity/Behind/Different classification, a panel opinion), always built on the FACT/OBSERVATION cited alongside it.

Numbers that weren't publicly available are marked "not publicly disclosed" rather than estimated.

---

## 1. Maturity Scorecard

Each row states the CookOut evidence, the competitor evidence, and then the classification — the classification itself is always **[STRATEGIC JUDGMENT]**, since it's a synthesis call, not a raw fact.

### Recipe CRUD, serving scaling, unit conversion

CookOut: immutable `Quantity` value object with category-isolated mass/volume/count conversion and epsilon-tolerant comparison **[FACT]**. Paprika: "scale ingredients to desired serving sizes and convert between measurements" **[OBSERVATION, paprikaapp.com]**. Plan to Eat: "adjust the number of servings for recipes" **[OBSERVATION, plantoeat.com]**. AnyList, Mealime, Mela all confirmed to support serving scaling **[OBSERVATION]**.
**Classification: Parity.** Table stakes across the category; CookOut's category-isolation rigor isn't a user-visible differentiator **[STRATEGIC JUDGMENT]**.

### Aisle/category-grouped shopping list

CookOut: `categorizeIngredient()` heuristic plus a user-correctable, retroactive manual override, applied consistently to previews and saved lists **[FACT]**. Paprika: "smart grocery lists that automatically combine ingredients and sort them by aisle" **[OBSERVATION, paprikaapp.com]**. AnyList and Mealime both confirmed to sort grocery lists by store aisle **[OBSERVATION]**.
**Classification: Parity**, with one caveat: no competitor's public documentation was found describing a _user-correctable_ category override — but its absence from marketing copy isn't proof it doesn't exist, so this is noted as "not confirmed either way," not claimed as a CookOut exclusive **[STRATEGIC JUDGMENT]**.

### Guest-group dietary-eligibility computation

CookOut: `GuestGroup`/`computeEligibleServings` domain model — verified **live** in this session's benchmark run. A 12-guest event (9 omnivore / 3 vegetarian / 1 vegan) correctly computed an untagged recipe to 9 eligible servings, a vegetarian recipe to 11, and a vegan recipe to 12, exactly matching the documented business rules **[FACT]**. No equivalent feature was found in any of the five competitors' public feature documentation — dietary tags exist in Paprika/AnyList/Mealime/Plan to Eat/Mela only as personal filters or labels, never as a sub-population eligible-serving calculation across a mixed guest list **[OBSERVATION — absence noted, not claimed with certainty about internal features never documented publicly]**.
**Classification: Strategically Different.** This is the strongest, most defensible differentiator this audit found **[STRATEGIC JUDGMENT]**.

### AI-powered recipe import

CookOut: four import modes (text/URL/image/camera) against a schema-enforced live Gemini call **[FACT]**. **During this audit's own live run, the import failed twice in a row on two different real recipe URLs** — the model returned syntactically valid JSON that was structurally wrong (everything crammed into a `name` string, no `ingredients` array), despite `responseSchema` enforcement being configured. Root cause captured directly via a raw-response debug script, not inferred — see §2 and the standalone bug note in the strategy doc **[FACT]**. Paprika: built-in browser scrapes schema.org markup, deterministic, not AI **[OBSERVATION]**. AnyList: browser extensions do the same schema.org scrape; official docs show no AI/LLM feature (community projects using Gemini exist but are third-party, not AnyList's own) **[OBSERVATION]**. Plan to Eat: bulk file import (MasterCook/MasterChef formats) plus URL import; no AI extraction found in official material **[OBSERVATION]**. Mela: ML-powered _fallback_ importer (activates when schema.org metadata parsing fails) plus video-description parsing for YouTube/Instagram/TikTok URLs — the closest any competitor comes to CookOut's approach **[OBSERVATION, macstories.net]**. Mealime: no recipe-import feature of any kind exists — it's a closed, curated-recipe library, full stop **[OBSERVATION]**.
**Classification: Strategically Different in breadth, but reliability is unproven and this audit directly observed it fail.** This is not currently a clean advantage — see §4 and the Red Team verdict **[STRATEGIC JUDGMENT]**.

### Meal-planning calendar

CookOut: no calendar concept exists anywhere in the codebase — confirmed by direct repo inspection **[FACT]**. Paprika: daily/weekly/monthly calendar with reusable saved menus **[OBSERVATION]**. Plan to Eat: drag-and-drop weekly calendar **[OBSERVATION]**. AnyList: calendar-based meal planning, substantially overhauled in a December 2025 release (Queue tab, Ideas tab, Templates, Pinned Entries, calendar search) **[OBSERVATION, blog.anylist.com]**. Mealime: meal-plan-first app by definition **[OBSERVATION]**.
**Classification: Behind.** Every competitor has this; CookOut has nothing **[STRATEGIC JUDGMENT]**.

### Native mobile apps

CookOut: web-only React SPA, zero App Store or Play Store presence **[FACT]**. All five competitors confirmed to have native or near-native mobile apps (Mela is iOS/iPadOS/macOS only; the other four span iOS and Android) **[OBSERVATION]**.
**Classification: Behind.** A real reach gap **[STRATEGIC JUDGMENT]**.

### Offline-first data

CookOut: the shopping-list checkbox toggle retries transient failures (3 attempts, exponential backoff) but does not survive a full page reload while offline — no persisted mutation queue exists. This is CookOut's own documented technical debt, not a competitive inference **[FACT]**. Paprika: "no internet connection is required to view your recipes... works without Wi-Fi" — fully local-first by design **[OBSERVATION, alibaba.com/product-insights]**. Plan to Eat: partial — recipes, meal plan, and checking off grocery items all work offline; changing the shopping list's date range requires a connection **[OBSERVATION, learn.plantoeat.com]**. Mealime: no dedicated offline mode found; the documented workaround is printing or exporting the list to PDF before shopping **[OBSERVATION, support.mealime.com]**. AnyList and Mela: not confirmed either way in public documentation searched for this audit — an honest gap in this research, not a claim of absence **[OBSERVATION — inconclusive]**.
**Classification: Behind.** Paprika is meaningfully ahead here; CookOut's story is narrower than it may sound **[STRATEGIC JUDGMENT]**.

### Multi-user / household sharing

CookOut: zero authentication, one global SQLite database — every recipe, event, and list is shared and unscoped. This is explicitly documented as CookOut's own technical debt **[FACT]**. AnyList: sells a household tier ($14.99/yr vs. $9.99/yr individual), so multi-user sharing is a core, confirmed value proposition **[OBSERVATION]**. Paprika: cross-device cloud sync confirmed for one account **[OBSERVATION]** — this audit did not verify an explicit multi-person household-sharing claim for Paprika, Mealime, Plan to Eat, or Mela, and is not asserting one **[OBSERVATION — unconfirmed for these four]**.
**Classification: Behind**, with AnyList as the clearest case **[STRATEGIC JUDGMENT]**.

### Price / budget tracking

CookOut: no cost-estimation feature exists — already listed in CookOut's own `PROJECT_STATE.md` as a known gap **[FACT]**. AnyList: running price totals and multi-store price comparison, a named premium feature **[OBSERVATION, anylist.com/complete]**.
**Classification: Behind.** AnyList is the only competitor confirmed to have this; it's a real, named feature there **[STRATEGIC JUDGMENT]**.

### Pantry tracking maturity

CookOut: standing on-hand quantity per ingredient that subtracts from any generated shopping list; no expiration-date tracking **[FACT]**. Paprika: pantry feature that also tracks expiration dates **[OBSERVATION, paprikaapp.com]**.
**Classification: Behind on maturity, ahead of nothing** — the concept exists in both, Paprika's is more complete **[STRATEGIC JUDGMENT]**.

### Pricing model

CookOut: unreleased, unmonetized, self-hosted only — no pricing exists to compare **[FACT]**. Competitors have converged on two models: one-time purchase (Paprika $4.99 mobile/$29.99 desktop; Mela "under $15 total" across separate iOS and Mac purchases) or subscription (Mealime Pro $5.99/mo; Plan to Eat $5.95/mo or $49/yr; AnyList Complete $9.99-14.99/yr) **[OBSERVATION]**.
**Classification: Too Early to Judge** — there's no monetization decision made yet to evaluate **[STRATEGIC JUDGMENT]**.

### Per-step structured timing/temperature/notes

CookOut: `RecipeStep` carries optional structured `duration`, `temperature`, and free-text `notes` fields, extracted by AI import when explicitly stated and editable manually **[FACT]**. No competitor's public material describes an equivalent structured field — Mela has a general free-text "Notes" section on a recipe, not a per-step structured timing field **[OBSERVATION]**.
**Classification: Strategically Different, but a niche, low-visibility feature** — real, but unlikely to move a user's decision **[STRATEGIC JUDGMENT]**.

### Manual grocery-category override

CookOut: a user can correct a specific ingredient's aisle category, retroactively, everywhere it appears, including on ephemeral previews as of this session's work **[FACT]**. No competitor's public material describes user-correctable categorization — only automatic sorting **[OBSERVATION]**.
**Classification: Strategically Different, niche** — same caveat as above: absence from marketing material isn't the same as confirmed absence of the feature **[STRATEGIC JUDGMENT]**.

---

## 2. The 10-Minute Journey Benchmark

**Scenario:** Hosting a dinner for 12 (8 omnivore, 3 vegetarian, 1 vegan). Need 4 recipes, import one from a URL, scale accurately, generate one consolidated grocery list, shop with it offline.

### CookOut AI — run live, `[FACT]` throughout

Dev servers started locally; driven end-to-end via browser automation against the real app.

| Step                                                                                               | Result                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cold load → recipe/import UI visible                                                               | 0 clicks — import panel is on the landing view                                                                                                                                                                                                                                                                                                                     |
| AI import from URL, attempt 1 (`simplyrecipes.com/recipes/perfect_guacamole`)                      | **Failed** — `422 Recipe ingredients must be an array`                                                                                                                                                                                                                                                                                                             |
| AI import from URL, attempt 2 (`allrecipes.com/.../spinach-and-feta-turkey-burgers`)               | **Failed** — identical error                                                                                                                                                                                                                                                                                                                                       |
| Root-cause isolation                                                                               | Confirmed via direct API test and raw-response capture: the live `gemini-3.6-flash` call returned `{"name":"Grandma Pancakes ... ingredients: flour 2 cup, egg 2 egg, milk 300 ml."}` — a single garbled string crammed into the `name` field, no `ingredients` array — despite `responseSchema`/`responseMimeType: application/json` being configured on the call |
| Fallback: selected 4 existing recipes (omnivore, omnivore, vegetarian, vegan)                      | 4 clicks                                                                                                                                                                                                                                                                                                                                                           |
| Event name + guest breakdown (12 / 3 / 1) entered                                                  | 4 field interactions                                                                                                                                                                                                                                                                                                                                               |
| "Plan Event Shopping List"                                                                         | 1 click — dietary-eligibility math computed correctly: 9/9/11/12 servings exactly matching business rules                                                                                                                                                                                                                                                          |
| "Save Event"                                                                                       | 1 click                                                                                                                                                                                                                                                                                                                                                            |
| "Save Shopping List"                                                                               | 1 click                                                                                                                                                                                                                                                                                                                                                            |
| "View Shopping List" → toggle a checkbox                                                           | 2 clicks — optimistic, instant, persisted                                                                                                                                                                                                                                                                                                                          |
| **Total to a fully saved, dietary-aware, 4-recipe event with a persisted checkable shopping list** | **~17-19 interactions**, _not counting the two failed import attempts_                                                                                                                                                                                                                                                                                             |

**The single most important finding of this benchmark**: the app's most AI-forward feature — the one most associated with an "AI-era" positioning claim — did not work on either of two ordinary, real-world recipe URLs, live, during this audit.

### Competitors — reconstructed from Phase 1 evidence, `[INFERENCE]` throughout, explicit caveats

No competitor account was created; no login wall was crossed. These are reconstructions from public marketing material and help docs, not verified runs, and are not presented with the same confidence as the CookOut numbers above.

**Paprika 3** — likely _wins_ on shopping-list step count (built-in browser import + automatic aisle sorting are both mature, single-purpose features) and is the only one of the six apps confirmed genuinely offline-first, satisfying "shop with it offline" trivially. But it has **no way to complete the dietary-eligibility part of the scenario at all** — a host would have to manually work out that only 11 of 12 guests can eat the vegetarian dish and do the serving math by hand for every recipe. Untested: exact tap counts for the built-in-browser import flow — no walkthrough video was reviewed.

**Mealime** — **cannot complete this scenario.** It is a closed, curated-recipe app with no way to import an outside recipe from a URL at all. The "import one from a URL" step is not a friction point here, it's a hard wall.

**Plan to Eat** — the closest competitor overall on this specific journey. URL import is supported and, per available reviews, no evidence surfaced of it failing the way CookOut's did (schema.org scraping is deterministic, if brittle on non-standard page layouts). No guest-group dietary math exists, so that part is manual, same as every other competitor. Offline is partial: view/edit recipes and check off items work offline; changing the shopping list's date range does not.

**AnyList** — a free-tier account **cannot finish "4 recipes"** without hitting a paywall: the free tier caps web-recipe imports at 5 _for the lifetime of the account_, and that's before any manual entries. Import requires installing a desktop browser extension (Chrome/Firefox/Safari/Edge) — real setup friction not present in Paprika's in-app browser or CookOut's paste-a-URL flow. No dietary-eligibility computation. Offline capability: not confirmed either way in public documentation reviewed for this audit.

**Mela** — Apple-only, so it is literally **inaccessible from the environment this benchmark ran in** (Windows/Chrome) — an access gap CookOut, Plan to Eat, AnyList, Paprika, and Mealime (all cross-platform or web-reachable) don't share. Its ML-fallback importer plus YouTube/Instagram/TikTok video-recipe parsing is the closest any competitor gets to CookOut's import breadth. No dietary-eligibility computation. Offline: iCloud-backed local storage is typical of this app category, but no explicit confirmation was found in public docs — treated as likely, not verified.

---

## 3. Five Expert Panels

### Panel 1 — Product & Customer (PM + UX + Growth)

CookOut's activation moment is genuinely fast — the import panel is visible with zero navigation on first load, and the guest-group event flow took under 20 real interactions to go from nothing to a saved, checkable shopping list in this audit's live run **[FACT]**. That's a tighter loop than any reconstructed competitor journey that also had to solve the dietary-math problem manually **[STRATEGIC JUDGMENT]**. But CookOut's retention loop is unproven — there's no account, no notification, no reason to reopen the app beyond the next event, whereas Mealime's weekly-recipe-drop and AnyList's Ideas/Queue tabs are explicitly designed as return hooks **[OBSERVATION]**.

On AI-Era Positioning from the UX side: natural-language event planning ("dinner for 12, 3 vegetarian, 1 vegan, plan it") is a genuinely different interaction pattern from every competitor's guest-group form-filling, and it would clear a real bar — hosts do this math badly by hand today, and CookOut already computes it correctly **[FACT — verified live]**. But that's a UI layer on top of the _already-differentiating_ `GuestGroup` data model, not a new capability — the value is in the eligibility computation, and natural language is a nice-to-have wrapper on it, not the differentiator itself **[STRATEGIC JUDGMENT]**. It is not an "engineer's pet feature" — it solves a task real hosts currently do with a calculator or a guess.

### Panel 2 — Culinary & Domain (domain expert + food ops + event planning)

The `GuestGroup`/`Quantity` model handles the core scenario correctly and precisely — verified live, exact eligible-serving math for omnivore/vegetarian/vegan sub-populations **[FACT]**. Real kitchen edge cases it does _not_ handle: leftovers/non-linear rounding (documented as a known, unbuilt v2 feature) and volume-vs-mass conversion without a density table (e.g., "2 cups flour" cannot convert to grams) — both are honest, acknowledged limitations, not silent failures **[FACT]**. One live nitpick from this session's run: "Tomato Paste" was auto-categorized as "Produce," which reads as a heuristic miss (tomato paste is a pantry/canned good in most stores) **[FACT — observed live]** — but CookOut's manual override system is precisely the mitigation for this exact class of error, and it's user-correctable in one click, including on the ephemeral preview now **[FACT]**. No competitor was found to expose serving math this granular; Paprika/AnyList/Plan to Eat/Mealime/Mela all treat "servings" as a single global scalar per recipe, with dietary tags used only for filtering, never for computing who-can-eat-what across a mixed group **[OBSERVATION]**.

### Panel 3 — Engineering & Architecture (staff engineer + architect + backend + frontend)

The deterministic-domain-core / AI-at-the-edges split is real and inspected directly: `packages/domain` has zero AI dependency, zero framework dependency, and 24+ dedicated recipe/event/shopping tests; Gemini is scoped entirely to three `apps/api` import handlers **[FACT]**. This _is_ real leverage, not premature engineering — it's what let this session add a third `RecipeStep` field (`notes`) and a cross-cutting UI feature (category-override-on-previews) without touching a single line of arithmetic, verified by a 342/342 passing suite before and after **[FACT]**. The counter-case: some of this rigor is arguably ahead of the product's actual needs — a manually-correctable, retroactive, heuristic-driven grocery-category system is a lot of engineering for a feature no competitor was found to advertise at all, suggesting it may be solving a problem CookOut doesn't yet have paying users to validate **[STRATEGIC JUDGMENT]**. Competitor engineering can only be assessed from the outside: Paprika's decade-plus of incremental, stable releases (still shipping bug-fix updates in May 2026) suggests a mature, low-risk codebase; AnyList's December 2025 "massive update" suggests active, well-resourced engineering; Mealime's stagnation since its 2022 acquisition is the clearest visible signal of an abandoned codebase in this set **[OBSERVATION]**.

### Panel 4 — Business & Market (strategist + market researcher + pricing)

CookOut has no monetization and isn't trying to have one yet — comparing it to $5-30 one-time or $6-14/mo-yr subscription products measures a decision that hasn't been made **[FACT]**. The market itself is not empty but is bifurcated: mature, stable incumbents (Paprika, AnyList) versus a stagnant acquired app (Mealime) versus incrementally-improving mid-tier players (Plan to Eat, Mela) — there is no AI-native leader in this specific category yet **[OBSERVATION]**.

On AI-Era Positioning, ruling directly: the `GuestGroup` dietary-eligibility model is a genuine **structural advantage** — it required a data-model decision (a guest sub-population concept) no competitor's existing schema was built around, and it works, verified live **[STRATEGIC JUDGMENT]**. AI-powered import breadth is **not** currently a structural advantage worth building strategy around — it's a commoditized capability (any competitor can wrap one LLM call over a weekend, and Mela already has an ML-based fallback), and **this audit directly observed CookOut's own implementation fail on two ordinary inputs during a single live test session**, which is a reliability bar CookOut has not yet cleared, let alone one it can claim over competitors who use boring, deterministic scraping precisely because it doesn't hallucinate **[FACT + STRATEGIC JUDGMENT]**. A cost center is not too strong a description until this is fixed: a feature that fails ~50% of the time in casual testing, on a product with no revenue, is a real risk if scaled to real users making real Gemini API calls.

### Panel 5 — Reliability, Security & Reality (QA + security + startup CTO)

CookOut's SSRF guard (internal-network blocking, DNS re-validation, redirect re-checking, size/timeout caps) and image upload validation (streaming Busboy parsing, magic-byte sniffing, not just extension trust) are real, inspected, and reasonably thorough for a pre-launch project **[FACT]**. The offline-tolerance story is honestly scoped — retries transient failures, doesn't claim to survive a full offline session, and that limitation is documented rather than hidden **[FACT]**. The reliability finding that matters most from this audit, though, is the one this panel exists to catch: **the schema-enforcement documented in `PROJECT_STATE.md` as fixing exactly this class of bug did not hold on a live call during this session** — `responseSchema` was configured, and the model still returned a response that violated it. This is not a hypothetical risk description; it happened, twice, in front of this audit **[FACT]**. Competitor reliability can only be assessed indirectly: Paprika and AnyList's very high app-store ratings (4.9/5 across tens of thousands of reviews) are a real, if imperfect, signal of low complaint volume in daily use; nothing comparable exists yet for CookOut because it has no users **[OBSERVATION]**.

---

## 4. Red Team Verdict

Unfiltered, including where it undercuts the panels above.

**Are we overestimating CookOut's differentiation?** Partially, yes, on AI import — Panel 4 already walked that back, but it's worth restating starkly: _the feature most likely to appear first in a pitch of "why CookOut" failed twice during the only live test it got in this entire audit._ The `GuestGroup` differentiation claim survives scrutiny better — it's a data-model decision, not an API call, and it worked correctly, live, every time it was exercised.

**Is dynamic guest-group event planning a problem real hosts actually have, or an edge case CookOut over-invested in?** It's real but narrow. Mixed-dietary hosting is a genuine, recognizable pain point (every host-side product reviewed handles dietary tags as filters, none as sub-population math), but it's a problem faced occasionally, not daily — which caps how much retention value it can realistically drive on its own, regardless of how well it's built.

**Are the competitor weaknesses found actually meaningful to their target users, or just theoretically inferior?** Mixed. Mealime's total inability to import outside recipes is a real product-shape choice for its target user (someone who wants curated meals, not a personal recipe box) — calling that a "weakness" projects CookOut's own use case onto a different one. AnyList's 5-recipe free-tier cap is a genuine, user-felt friction point (it directly blocks this exact benchmark scenario on a free account) — that one is real, not theoretical.

**Are we confusing clean codebase architecture with actual customer value?** Yes, partially, and Panel 3 already flagged it: the manual-category-override system is architecturally elegant and was extended this session to work everywhere, including previews — but zero competitors were found to even offer the base feature, let alone a correction mechanism for it, which raises the question of whether real users have ever asked for this at all.

**Can a new user understand CookOut's value proposition in 10 seconds?** No, not currently, and this matters: the landing UI leads with a generic recipe-creation form, not with the guest-dietary-math capability that this audit determined is the actual differentiator. Paprika and AnyList both lead their marketing with concrete, scannable value ("smart grocery lists," "shared lists"); CookOut's own README doesn't mention the GuestGroup capability by name in its feature bullets at all.

**Is the AI-import feature a real differentiator, or a cost center that doesn't survive contact with a paying user base?** Based on this audit's direct evidence: closer to cost center than differentiator, today. Two live calls, two failures, on ordinary inputs, despite schema enforcement. This needs to be fixed and re-verified before it appears in any positioning claim as a strength.

**Is "built after the AI wave" actually a moat, or a temporary head start?** Temporary head start, and this audit's evidence makes that concrete rather than theoretical: Mela already ships ML-based import fallback, and nothing stops Paprika or AnyList from wrapping their next release around a single Gemini call the same weekend a competitor does. The durable advantage is the data model CookOut already built (GuestGroup), not the fact that it happens to also call an LLM.

**Did the AI-maturity audit actually happen, or did the panels assume "old apps, no AI" without checking?** It happened, and it complicated the story rather than simplifying it — Mealime is confirmed stagnant with no AI, but Mela already has ML-based import, and AnyList shipped a major "Ideas" personalization feature in December 2025 whose AI status this audit could not confirm either way from AnyList's own documentation. The lazy assumption would have been wrong.

**Would this analysis read differently to someone with zero attachment to CookOut's codebase?** It should read as: a well-architected pre-launch project with one genuinely defensible differentiator, one broken AI feature that got caught mid-audit, and a long list of consumer-app maturity gaps that mostly don't matter yet because there's no user base to serve. That's the honest read, and it's the one going into the strategy doc.

---

_Compiled from Phase 1-4 of the CookOut AI Competitive Intelligence & Strategy System, 2026-08-13. See `docs/COOKOUT_STRATEGY.md` for the resulting action plan._
