---
name: cookout-competitive-intelligence
description: Run the full CookOut AI Competitive Intelligence & Strategy System — an evidence-driven, adversarial competitive teardown of CookOut AI against Paprika, Mealime, Plan to Eat, AnyList, Mela, and any other recipe/meal-planning competitors, using a standardized user-journey benchmark, five expert audit panels, and a red-team challenge phase. Use whenever the user asks to compare CookOut AI against competitors, wants a market/strategy assessment, asks "where does CookOut stand," or wants the COMPETITIVE_INTELLIGENCE / COOKOUT_STRATEGY docs generated or refreshed. Do not use for a single quick feature comparison — see "When not to use this" below.
---

# CookOut AI: Competitive Intelligence & Strategy System

## Core Operating Directive

> **Do not attempt to prove CookOut is good. Attempt to determine whether CookOut is good.**
> Every assumption, positioning claim, and "technical advantage" is a hypothesis to verify or disprove against evidence — not a conclusion to defend. If the honest finding is unflattering, the report says so plainly. The point of this system fails the moment it starts reading like marketing copy for CookOut.

## When NOT to use this

- A single quick comparison ("does Paprika support X?") — just answer directly.
- Fewer than 2 real competitors in scope — there's no panel/journey structure to run.
- The user wants a code review of CookOut alone, with no competitor angle.

If in doubt about running the full pipeline versus a lighter pass, ask in one line, then proceed — don't stall on ceremony.

---

## Epistemic Classification Rules

Every non-trivial finding in both deliverables must carry exactly one tag:

- **`[FACT]`** — verified directly from CookOut's own source code, its actual API responses, or its own docs (`PROJECT_STATE.md`, README). **This tag is only available for CookOut itself.** Competitors are closed-source; nothing about them can be tagged FACT.
- **`[OBSERVATION]`** — recorded from a competitor's public, verifiable material: their own marketing site, pricing page, app store listing, a screenshot, a demo video, official docs. Cite the source.
- **`[INFERENCE]`** — a conclusion drawn from OBSERVATIONs (e.g., reconstructing a competitor's tap-count for a workflow from a demo video or written walkthrough, since no one is actually installing and clicking through five consumer apps). Must name which observations it's built on, and must not be presented with more confidence than a reconstruction deserves.
- **`[STRATEGIC JUDGMENT]`** — the panel's opinion or recommendation, clearly opinion.

**Never fabricate a specific number** (review count, price, user count, tap count) that wasn't actually found. If it isn't publicly available, write "not publicly disclosed" and stop there — that absence is itself a finding, not a gap to paper over.

## Execution guardrails

- **CookOut gets hands-on treatment; competitors don't.** This runs in Claude Code with Playwright available — use it to actually drive CookOut's own dev instance (`npm run dev`, then Playwright against `localhost:3000`) for Phase 2's journey benchmark. Real screenshots and real click-throughs are fair game for CookOut and get tagged `[FACT]`/`[OBSERVATION]`, not `[INFERENCE]`.
- **Competitor accounts are off-limits by default.** Paprika, Mealime, Plan to Eat, AnyList, and Mela are consumer apps that require sign-up/payment/native mobile install to actually use. Do not create accounts on their services, submit payment info, or attempt to bypass a login wall, even though Playwright makes this technically possible — that needs explicit user permission first, not an assumption. Playwright can freely be pointed at anything genuinely public and login-free: marketing sites, pricing pages, public app-store listing pages, public help-center articles, embedded demo videos. Everything else comes from search/fetch of that same public material.
- **Be polite to competitor sites.** A handful of page loads per competitor via Playwright/fetch is fine; don't hammer them with repeated automated requests — that's how you get rate-limited or flagged, and it isn't necessary for this kind of research.
- **Batch the research, don't re-search per panel.** Research each competitor once, up front, thoroughly (roughly 4-8 targeted searches/fetches per competitor: what it does, platforms, pricing, tech signals if any, market position, recent trajectory), then reuse that evidence across every panel and the journey benchmark. Re-searching per panel wastes budget and risks contradicting earlier findings.
- **This is a heavy task.** Five competitors, a real journey run for CookOut plus reconstructed journeys for five competitors, five panels, a red-team pass, and two documents is realistically 30-50+ tool calls done properly. Pace it — it's fine for this to span more of the session than a typical task, but check in with the user if it looks like it'll run substantially longer than expected rather than silently truncating panels to fit.
- **Citations**: any claim drawn from a competitor's own site or reviews follows normal citation/quoting rules — paraphrase, don't reproduce their marketing copy at length.

---

## Phase 1: Evidence Collection

1. **CookOut AI internal audit** — read `PROJECT_STATE.md` (canonical status doc) in full, plus the actual repo if available. Map the domain kernel (`packages/domain`), API layer (`apps/api`), UI layer (`apps/web`). Cross-check the doc against the repo/README for staleness (e.g. a README claiming a lower test count than the state doc actually reports) and flag any mismatch.
2. **Competitor research** — for **Paprika 3, Mealime, Plan to Eat, AnyList, Mela**, and any other competitor the user names, gather via public sources only: core feature set, platform reach (web/iOS/Android/offline sync model), pricing (current, real numbers), any publicly disclosed tech signals (rare for consumer apps — say so if none found), market position (rough scale signals: ratings, review counts, how long established, notable press), and trajectory over the last ~12 months (active development vs. stagnant vs. recently acquired).
3. **Maturity normalization** — classify each CookOut capability against the competitor set as one of:
   - **Parity** — matches the industry baseline these competitors already established.
   - **Behind** — a competitor has a mature solution CookOut lacks.
   - **Strategically Different** — CookOut deliberately takes another path; not simply "missing."
   - **Too Early to Judge** — depends on scale/infrastructure CookOut doesn't have yet.
4. **AI-maturity audit** — for each competitor, check whether they've already shipped AI-powered features (import, recipe suggestions, meal-planning chat, etc.) and roughly when the app was originally built/launched. Don't assume "old app, therefore no AI features" — several of these apps have added AI capabilities in the last year or two, and the whole point of this system is not skipping verification in favor of a flattering assumption. This audit is what makes the AI-Era Positioning check below answerable with evidence.

## AI-Era Positioning

CookOut is being built after LLMs went mainstream; Paprika, Mealime, Plan to Eat, AnyList, and Mela were all originally designed before that. That's a real hypothesis worth testing, not an assumed advantage — verify it with Phase 1's AI-maturity audit before leaning on it anywhere in the deliverables.

When it does hold up, be precise about *why* it's an advantage. Split any AI-related finding into one of two buckets:

- **Structural advantage** — something a legacy competitor can't easily retrofit because of *their* existing constraints: a data model/schema built years before structured LLM extraction existed, a form-heavy UX and user base that doesn't expect natural-language input, or an engineering culture organized around manual content curation rather than an AI-import pipeline. CookOut's own architecture is relevant evidence here — the deterministic-domain-core / AI-at-the-edges split (`packages/domain` has zero AI dependency; Gemini is scoped entirely to `apps/api` import) means new AI-adjacent features can be added without touching the math that already has 342 passing tests behind it. A legacy app retrofitting AI has to either bolt it on top of an older architecture or risk destabilizing what already works.
- **Commoditized feature gap** — something any competitor can add by wrapping one LLM API call over a weekend (e.g. "paste a recipe URL, get structured JSON back" is now a solved problem any team can integrate). Don't present this as a durable moat; it's a head start, not a wall.

Concrete angles worth checking against the evidence, not assuming:
- Natural-language event planning ("dinner for 12, 3 vegetarian, 1 vegan, plan it") instead of the guest-group form-filling every one of these competitors uses — is this something their existing UX/data model could add easily, or does it require them to rethink a core interaction pattern?
- Import fidelity — CookOut's structured-output-schema-enforced Gemini extraction (text/URL/image/camera) vs. competitors' likely reliance on JSON-LD scraping (which breaks on non-standard recipe sites) or manual entry. Check whether any competitor has actually upgraded to LLM-based extraction already before claiming this as a gap.
- Whether an AI-assisted onboarding wedge (e.g. cleanly importing a user's existing Paprika/AnyList export) is realistic and whether it's something CookOut is structurally suited to build cheaply given the import pipeline already exists.

This feeds directly into Panels 1 and 4 below, the Red Team, and the DIFFERENTIATE/BUILD sections of the strategy doc — it isn't a standalone finding, it needs to survive contact with those.

## Phase 2: The 10-Minute User Journey Benchmark

Walk CookOut AI and every competitor through the identical scenario:

> *"Hosting a dinner for 12: 8 eat everything, 3 are vegetarian, 1 is vegan. Need 4 recipes, want to import one from a URL, scale all ingredients accurately, generate one consolidated grocery list, and shop with it offline."*

For **CookOut**, run it for real: start the dev servers, drive the flow with Playwright end to end, and record actual interaction counts and screenshots — tag these `[FACT]`/`[OBSERVATION]`. If the dev servers won't start cleanly, fall back to tracing the actual code path/route through the repo and tag that as `[INFERENCE]` (code-path tracing is a reasonable proxy, but it's not the same as a verified run — don't blur the two).

For **each competitor**, reconstruct the same journey from whatever public walkthroughs, help docs, or demo footage exist. Tag every step count as `[INFERENCE]`, note explicitly which parts of the journey couldn't be reconstructed from available material (e.g., "no public walkthrough shows offline grocery-list behavior for Plan to Eat — untested, not claimed"), and never present a reconstructed tap count with the same confidence as CookOut's directly-run one.

Record for each app: total interaction count, friction points, where the mental model breaks or shines, and anywhere the app can't complete part of the scenario at all.

## Phase 3: The Five Expert Panels

Each panel writes from its lens, referencing Phase 1/2 evidence directly (don't re-derive from scratch), tags every claim, and stays concrete — 150-300 words per panel is enough; don't pad.

1. **Product & Customer** (PM + UX + Growth) — user segment, activation moment, retention loop per app; where CookOut creates friction the competitors solved. Also weigh in on AI-Era Positioning from the UX side: what would a genuinely AI-native interaction (e.g. natural-language event planning) actually look like here, and does it clear a bar real users care about, or is it an engineer's pet feature?
2. **Culinary & Domain** (domain expert + food ops + event planning) — evaluate CookOut's `GuestGroup`, `Quantity`, and unit-conversion model against real kitchen edge cases (leftovers, non-linear scaling, volume-vs-mass conversion) and how competitors handle (or don't handle) the same edge cases.
3. **Engineering & Architecture** (staff engineer + architect + backend + frontend, combined) — inspect CookOut's actual repo structure. Central question: **does this architecture create real product leverage, or is it premature engineering for the current user base?** Competitor engineering is assessed only from external signals (uptime/bug reports/release cadence/job postings) — never assume access to their code.
4. **Business & Market** (strategist + market researcher + pricing) — market whitespace, monetization ceiling, realistic willingness-to-pay, and how a solo/portfolio project's economics differ from funded competitors'. Rule on AI-Era Positioning from the strategy side: which AI-related items are structural advantage (per the definition above) worth actually building into the DIFFERENTIATE section, and which are commoditized gaps not worth over-indexing on.
5. **Reliability, Security & Reality** (QA + security + startup CTO) — audit CookOut's actual SSRF guard, upload validation (Busboy + magic-byte sniffing), offline/retry resilience, and error handling against what's realistically known or inferable about competitor reliability (crash reports in reviews, outage history if public).

## Phase 4: Adversarial Red Team

A separate pass that aggressively challenges every positive finding from Phase 3. Minimum set of questions, answered directly and specifically (not rhetorically waved off):

- Are we overestimating CookOut's differentiation?
- Is "dynamic guest-group event planning" a problem real hosts actually have, or an edge case CookOut over-invested in?
- Are the competitor weaknesses we found actually meaningful to *their* target users, or just theoretically inferior?
- Are we confusing clean codebase architecture with actual customer value?
- Can a new user understand CookOut's value proposition in 10 seconds, compared to how quickly competitors communicate theirs?
- Is the AI-import feature (live Gemini calls) a real differentiator, or a cost center that doesn't survive contact with a paying user base?
- Is "built after the AI wave" actually a moat, or a temporary head start that closes the moment a competitor's team wraps one API call around their own import flow?
- Did the AI-maturity audit actually happen, or did the panels quietly assume these are "old apps with no AI" without checking? If it didn't happen, that's a finding about this process, not just about the competitors.
- Would this analysis read differently to someone with zero attachment to CookOut's codebase?

The red team's job is to find the strongest counter-argument to each Phase 3 finding, not to concede immediately. Its verdict goes into the intelligence doc unfiltered, even where it undercuts earlier panel conclusions.

## Phase 5: Deliverables

Produce two documents.

**Where they go**: write directly to `docs/COMPETITIVE_INTELLIGENCE.md` and `docs/COOKOUT_STRATEGY.md` in the repo. If either file already exists from a prior run, don't silently overwrite — diff against the old version and note in the new one what changed since last time (new evidence, reversed findings, etc.), same discipline PROJECT_STATE.md itself follows for staying current.

### `docs/COMPETITIVE_INTELLIGENCE.md`
1. Observable competitor landscape — mental model, core objects, evidence-tagged findings per competitor.
2. The 10-minute journey benchmark — comparative table, interaction counts, friction points, explicit reconstruction caveats.
3. Five-panel detailed findings, every claim tagged.
4. Red Team verdict, unfiltered.

### `docs/COOKOUT_STRATEGY.md`
1. **Product positioning baseline** — what CookOut is, who it serves, its core job-to-be-done, stated plainly (not aspirationally).
2. **Strategic action matrix**: COPY (patterns competitors perfected that CookOut should adopt) / DIFFERENTIATE (moats worth doubling down on — explicitly flag which of these are AI-Era structural advantages vs. commoditized features anyone could copy) / IGNORE (competitor capabilities that don't fit CookOut's actual job-to-be-done) / BUILD (essential next additions) / DON'T BUILD (complexity traps).
3. **Capital allocation matrix** — table: Feature/Initiative | User Value | Strategic Value | Engineering Cost | Decision.
4. **Codebase debt relevant to competitive position** — top 3 instances of premature abstraction or bloat that actually matter for shipping competitively (not a generic code-quality list).
5. **90-day tactical roadmap** — NOW / NEXT / LATER / NEVER.
6. **Things we believe vs. things we don't yet know** — explicit list of unverified hypotheses, each with the specific evidence that would be needed to validate it before building against it.

---

## Final guardrail

If, after running this, the honest conclusion is that CookOut is behind on fundamentals a hobby project shouldn't worry about yet, or that a "gap" doesn't actually matter to real users, say that directly in the strategy doc. A report that finds nothing wrong didn't look hard enough.
