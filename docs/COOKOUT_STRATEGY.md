# CookOut AI — Strategy & Action Plan

**Date:** 2026-08-13
**Companion to:** `docs/COMPETITIVE_INTELLIGENCE.md` (evidence, panels, and red team verdict this plan is built on).

---

## ⚠ Production Bug Found During This Audit — Not a Strategic Finding, a Live Defect

**This is flagged here, separately, so it doesn't get lost inside the strategic framing below.**

During Phase 2's live journey benchmark, CookOut's AI URL-import failed **twice in a row** on two different real, ordinary recipe URLs. Root cause is confirmed, not inferred: the live `gemini-3.6-flash` call (via `apps/api/src/geminiClient.ts`) returned syntactically valid JSON that was structurally wrong — every field crammed into a single garbled `name` string, no `ingredients` array at all — **despite `responseSchema`/`responseMimeType: application/json` being configured on the call**. This is the same class of bug `PROJECT_STATE.md` documents as previously fixed ("schema enforcement makes compliance reliable, not guaranteed, for a live response") — it recurred, live, during this audit, on the simplest possible input (a plain pancake recipe with three ingredients).

This is a **live production defect in the AI import pipeline**, not a competitive-positioning observation. It belongs on an issue tracker today, independent of anything else in this document. See §4 for its ranking, but do not wait for a strategy review to act on it.

---

## 1. Product Positioning Baseline

**What CookOut actually is, stated plainly:** a pre-launch, unmonetized, self-hosted full-stack web application with zero real users, zero authentication, and zero native mobile presence. Its practical audience today is not consumers — it's whoever evaluates the codebase itself: the developer, a future collaborator, an employer, or an audit like this one.

**Who it serves, if and when it ships:** a host planning a meal for a mixed-dietary group who currently does the "who can eat what, and how much do I need to buy" math by hand or by guess.

**Core job-to-be-done:** turn a guest list with mixed dietary restrictions and a set of candidate recipes into an accurate, consolidated shopping list — without the host doing sub-population serving math themselves.

**What it is not, and shouldn't pretend to be right now:** a meal-planning-calendar app, a multi-household grocery-sharing app, or a budget-tracking app. Those are real, valuable products — they're just not the product CookOut's architecture or `PROJECT_STATE.md` describes it as building toward.

---

## 2. Strategic Action Matrix

### COPY — patterns competitors perfected that CookOut should adopt

- **Plan to Eat's graceful partial-offline model** (view/edit recipes and check off grocery items work offline; only date-range changes need a connection) is a realistic, achievable target — far more attainable than Paprika's full local-first rewrite, and it maps directly onto CookOut's existing checkbox-retry work.
- **AnyList's household-tier framing** ($9.99/yr individual vs. $14.99/yr household) is the right _shape_ for how multi-user pricing/sharing should eventually work here, if CookOut ever monetizes — worth keeping as the reference model, not building yet (see §4).
- **Paprika's fully local-first storage** is the right long-term target architecture for genuine offline support, if that's ever prioritized over other work.

### DIFFERENTIATE — led by the model that's actually proven, not the one with the most marketing appeal

1. **The `GuestGroup` dietary-eligibility computation — this is the headline differentiator, and it should lead any pitch, README, or landing copy.** It's structural, not commoditized: a data-model decision (a guest sub-population concept in `packages/domain`) that no competitor's schema was found to be built around, and it computed correctly, live, in this audit's benchmark run (9/9/11/12 eligible servings across omnivore/omnivore/vegetarian/vegan recipes, exactly matching the documented business rules). CookOut's own README currently doesn't mention this capability by name in its feature list — that's a positioning gap worth closing before anything else in this matrix.
2. **Per-step structured timing/temperature/notes and manual, retroactive grocery-category overrides** are real, niche differentiators — no competitor's public material describes either. Keep them; don't lead with them, since they're low-visibility to a first-time user.
3. **AI import breadth (text/URL/image/camera) is explicitly _not_ ready to be positioned as a differentiator.** It is real, structurally broader than any competitor's import surface, and it is also the one thing in this entire audit that was directly observed failing, twice, on ordinary input. Fix the bug flagged above and re-verify its actual failure rate — with real measurement, not the current 2-sample anecdote — before it appears anywhere as a strength.

### IGNORE — competitor capabilities that don't fit CookOut's actual job-to-be-done

- **Price/budget tracking** (AnyList's differentiator) — this is a data-sourcing problem (store price feeds, product matching), not a domain-modeling problem, and doesn't showcase anything CookOut's architecture is actually good at.
- **Curated, choose-from-a-library meal planning** (Mealime's entire model) — a fundamentally different product shape than "bring your own recipe." Copying it would blur CookOut's identity rather than sharpen it.
- **Multi-store price comparison** — same reasoning as price tracking; out of scope for the same reason.

### BUILD — essential next additions

- **Fix the AI-import schema-compliance bug** (§ above) — not optional, and blocking for any future claim that AI import is a strength.
- **A natural-language wrapper on the existing event-planning flow** ("dinner for 12, 3 vegetarian, 1 vegan, plan it") — this sharpens the one differentiator that's actually proven, rather than adding a new one; it's a UI layer over `GuestGroup`, not new domain logic.
- **Practical scaling v2** (non-linear rounding for indivisible ingredients — already scoped in `docs/ideas/practical-scaling.md`) — reinforces the domain-rigor story that is CookOut's genuine strength.
- **Fix `README.md` and `PROJECT_OVERVIEW.md` staleness** (172 and 78 reported Vitest tests vs. the actual, verified 342; `PROJECT_OVERVIEW.md` describes a 2-tab version of the app with no Event Planner at all) — cheap, and directly undermines credibility with exactly the audience (a code reviewer, a portfolio evaluator) CookOut's actual current purpose depends on.

### DON'T BUILD — complexity traps, ranked by how much they'd actually matter to CookOut's real current purpose (a portfolio piece demonstrating architecture), not by raw feature parity against five funded consumer apps

1. **Meal-planning calendar.** The single most tempting trap on this list — every one of the five competitors has one, so its absence is the most _visible_ gap in any side-by-side comparison. But it's a different mental model (recurring weekly planning) than CookOut's actual strength (one-off, dietary-aware event planning). Building it would dilute CookOut's identity rather than sharpen it, and the engineering cost (a full calendar UI plus a recurring-plan domain model) is high relative to what it would prove.
2. **Native mobile app.** Highest effort-to-signal ratio of anything considered in this audit, given CookOut's current purpose. A responsive web app already demonstrates the same engineering competency a native rewrite would, at a fraction of the cost. Revisit only if the project's goal shifts from "demonstrate architecture" to "acquire real users."
3. **Price/budget tracking.** Lowest priority of the three — it's not just off-strategy (see IGNORE above), it requires solving an unrelated problem (external price data) that has nothing to do with anything CookOut is actually trying to be good at.

**Not on this list, deliberately:** multi-user auth and a real offline mutation persister. Both are genuine gaps — see §4 for why they're ranked as later work rather than either urgent or dismissed outright.

---

## 3. Capital Allocation Matrix

| Feature / Initiative                                                    | User Value                                         | Strategic Value                                                                 | Engineering Cost                                                  | Decision                                   |
| ----------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| Fix AI-import schema-compliance bug                                     | High — import is currently unusable                | High — protects the only AI claim CookOut can credibly make                     | Low-Medium (response validation + retry/fallback, not a redesign) | **NOW**                                    |
| Fix README/PROJECT_OVERVIEW staleness                                   | N/A (internal)                                     | Medium — direct credibility with the audience that matters right now            | Very Low                                                          | **NOW**                                    |
| Reposition GuestGroup as the headline feature (README, landing copy)    | N/A (internal)                                     | High — closes the single biggest positioning gap found                          | Very Low                                                          | **NOW**                                    |
| Natural-language event-planning wrapper                                 | Medium                                             | High — sharpens the one proven differentiator                                   | Medium                                                            | **SHIPPED**                                |
| Offline mutation persister (`@tanstack/query-sync-storage-persister`)   | Medium                                             | Low-Medium                                                                      | Low — already scoped in existing tech debt                        | **SHIPPED**                                |
| Practical scaling v2 (shopping-list-quantity rounding half)             | Medium                                             | Medium — reinforces domain rigor                                                | Medium                                                            | **SHIPPED**                                |
| Handle Gemini 429 rate-limit responses with a clean user-facing message | Medium — currently leaks a raw upstream error blob | Low-Medium — a reliability/polish fix, not a differentiator                     | Low                                                               | **NEXT**                                   |
| Multi-user auth / multi-tenancy                                         | Medium (irrelevant while solo-used)                | Medium — closes the credibility gap in claiming "production-grade" architecture | High                                                              | **LATER**                                  |
| Pantry expiration-date tracking                                         | Low                                                | Low — small extension of an existing feature                                    | Low                                                               | **LATER**                                  |
| Meal-planning calendar                                                  | Medium (real competitor feature)                   | Low — wrong identity fit                                                        | High                                                              | **DON'T BUILD**                            |
| Native mobile app                                                       | Medium                                             | Low, for CookOut's current purpose                                              | Very High                                                         | **DON'T BUILD**                            |
| Price/budget tracking                                                   | Low-Medium                                         | Low                                                                             | High (needs external data source)                                 | **NEVER** (revisit only on a scope change) |

---

## 4. Codebase Debt Relevant to Competitive Position

Ranked by actual impact on shipping competitively — not a generic code-quality list.

1. **AI-import schema-compliance bug (see flagged section above).** This is the top item on this list, full stop. It's not "debt" in the usual sense — it's a currently-broken feature discovered live during this audit. Everything else in this section is secondary until this is fixed.
2. **Positioning debt in `README.md` and `PROJECT_OVERVIEW.md`.** Both are badly stale — `README.md` claims "172 Vitest unit and integration test suites," `PROJECT_OVERVIEW.md` claims "78/78 Vitest Unit & Integration Tests" and describes a 2-tab app with no Event Planner, no persisted events/lists, no pantry, no category overrides, and no step timing/notes. The actual, verified count is 342. This is the cheapest fix in this entire document and the one most likely to be seen first by anyone evaluating the project.
3. **No test coverage for the AI-import failure mode just discovered.** `scripts/smokeTestLiveGemini.js` exists specifically to catch schema drift against the live API, but it isn't run in CI (by design, to avoid API costs) and evidently didn't catch this before this audit did. Once the bug above is fixed, this is the mechanism that should be exercised regularly enough to prevent silent regression — not a new tool, just more disciplined use of what already exists.

---

## 5. 90-Day Tactical Roadmap

**NOW (this week):**

- Fix the AI-import schema-compliance bug — add response validation with a retry-or-explicit-failure path instead of surfacing a raw `InvalidRecipeError` to the user.
- Fix `README.md` and `PROJECT_OVERVIEW.md` staleness (test counts, missing features, outdated architecture description).
- Rewrite the README's feature list and landing copy to lead with the `GuestGroup` dietary-eligibility capability by name.

**Done since this roadmap was written (all four NEXT items below have shipped):**

- ✅ Natural-language wrapper on the event-planning flow.
- ✅ Offline mutation persister for the shopping-list checkbox toggle.
- ✅ Practical scaling v2 — the shopping-list-quantity-rounding half; batch-size recommendation remains unbuilt, see `docs/ideas/practical-scaling.md`.
- ✅ Re-ran the AI-import benchmark at volume — see §6's updated entry. Schema-compliance held (0 failures across 17 real Gemini calls); surfaced a new, separate finding instead (free-tier rate limiting), now the top of the list below.

**NEXT (30-60 days):**

- Handle Gemini 429/rate-limit responses cleanly (clean user-facing message, not the raw upstream error blob) — see §6.

**LATER (60-90+ days, contingent on the project's goal actually shifting toward real users — see §6):**

- Multi-user authentication and multi-tenancy.
- Pantry expiration-date tracking.

**NEVER (not while CookOut's purpose remains architecture demonstration rather than user acquisition):**

- Native mobile app.
- Meal-planning calendar.
- Price/budget tracking.

---

## 6. Things We Believe vs. Things We Don't Yet Know

**Believe:** `GuestGroup` dietary-eligibility computation is CookOut's strongest, most defensible differentiator.
**Don't know:** whether real hosts would actually choose an app for this specific capability, or just tolerate doing the math themselves as they do today. Evidence needed: actual user testing with a real mixed-dietary event, not just a working feature and a competitive gap analysis.

**Update, 2026-08-14 — re-measured at volume, not just re-asserted:** issue #1's fix (the `anyOf` schema split + app-layer shape-guard retry, shipped after this audit) held. Across ~35 live calls against the real `/api/recipes/import-text`/`/api/recipes/import-url` handlers (not the toy prompt in `scripts/smokeTestLiveGemini.js`) — 20 varied pasted-text recipes and both original failing URLs plus 8 new ones — **zero malformed-shape/schema-drift failures occurred among the 17 calls that actually reached Gemini.** The fix generalizes; the original two-failures-out-of-two was not a fluke that got lucky on retest.
**A different, newly-discovered reliability problem, not the one this line used to track:** the free-tier `GEMINI_API_KEY` this project runs on allows only 5 requests/minute, and the remaining ~18 of the ~35 calls were blocked by `429 RESOURCE_EXHAUSTED`, not any extraction defect. This is not just a short burst limit — a later 5-call confirmation batch, paced 13s apart with a 35s backoff-and-retry on each rate-limited call, still failed **all 5 calls on both the first attempt and the retry**, meaning the quota stays exhausted for extended periods once a session has made moderate volume of calls, not just momentarily. Worth its own fix, independent of anything else in this document: a rate-limited call currently returns the raw upstream Gemini error JSON (quota metrics, a Google Cloud console link) straight to the user via the generic `Upstream AI service error: ...` message — confusing, and a minor information leak about the deployment's specific quota tier. A real deployment needs either a paid tier or explicit 429 detection with a clean "AI import is busy, try again in a minute" message, before AI import reliability can be claimed as solved rather than just schema-compliant.

**Believe:** the deterministic-domain-core / AI-at-the-edges architecture is genuine engineering leverage (it let this session add a new domain field and a cross-cutting UI feature without touching any arithmetic, verified by a 342/342 passing suite).
**Don't know:** whether that leverage is visible or persuasive to anyone whose evaluation actually matters for CookOut's current purpose, since it currently isn't called out anywhere in the project's own external-facing documentation.

**Believe:** none of the five competitors researched have an equivalent to `GuestGroup`'s sub-population eligibility math.
**Don't know for certain:** whether this is because it's genuinely hard to build, or because none of them decided it was worth building. This audit's evidence is public-marketing-and-documentation-only — an internal or undocumented competitor feature could exist that this research wouldn't have surfaced.

**Don't know at all, and this is the single highest-leverage open question in this document:** what CookOut's actual goal is going forward — remain a portfolio/architecture demonstration, or move toward shipping to real users. Nearly every ranking in §2 through §5 depends on which of those is true, and revisiting this document once that's decided will change more of it than any single new competitive finding would.
