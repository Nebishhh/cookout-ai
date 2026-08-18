# Cook Scheduling

## Status: backward scheduling shipped; oven/equipment conflict detection did not

**Shipped** (`packages/domain/src/events/cookSchedule.ts`, `computeCookSchedule()`): given an
Event's `serveTimeMinutes`, each included recipe's step durations are summed and subtracted from
the serve time to produce a start time per dish, sorted earliest-first — the order the host
actually does things. Each step also carries an absolute start time, so a dish expands into a
walk-forward timeline. Surfaced by `CookSchedulePanel.tsx` in both the event preview and the
saved-event view. See PROJECT_STATE.md §10 for the full design.

**Two prior scope notes were deliberately reversed to make this possible**, and both were
updated rather than left contradicting the code:

- `StepDuration` said durations were "captured/displayed only, never summed or converted across
  a recipe." Summing is now exactly what happens, via a new `toMinutes()`. `scale()` still does
  **not** exist and shouldn't: cooking twice as much food does not take twice as long.
- `Event` said it had no date/time field. It now has `serveTimeMinutes` — wall-clock minutes
  from midnight, deliberately not a `DateTime`, since "serve at 6pm" is a wall-clock intent
  rather than an instant, and all schedule arithmetic is relative anyway.

## Not built: oven / equipment conflict detection

The original idea's second half was: flag when two dishes need the oven at overlapping times at
different temperatures, before the host is standing in the kitchen mid-cook.

**Why it wasn't built:** nothing in this codebase models the oven — or any equipment — as a
contended resource. The only available proxy is "the step states a temperature," and that is
lossy in the wrong direction: a stovetop simmer, a candy thermometer target, and a meat-probe
pull temperature all carry temperatures without involving the oven at all. Building on that
proxy would generate false warnings, which for a warning feature is worse than generating none.

**What it would actually require**, in rough order:

1. A way for a step to state what equipment it occupies (oven / stovetop burner / grill /
   counter). Either a new field on `RecipeStep`, set by the user or extracted by AI import, or a
   separate equipment-behavior lookup. This is the real prerequisite — everything else is
   arithmetic on top of it.
2. Overlap detection across the already-computed per-step absolute time windows
   (`ScheduledStep.startTimeMinutes` + `durationMinutes` already give the interval; the
   interval-intersection pass itself is straightforward).
3. F↔C normalization on `StepTemperature` before comparing temperatures — 175 C and 350 F are
   the same oven and must not be reported as a conflict. `StepTemperature` has no `convertTo()`
   today, mirroring the note `StepDuration` used to carry.
4. A decision about capacity, which is a product question, not an engineering one: two dishes at
   the _same_ temperature may or may not be a conflict depending on whether they physically fit.

## Known limitation of what did ship

A step with no stated duration counts as **zero** minutes and flags its dish
`hasUnstatedDurations`, rendered as an "estimate" badge. This necessarily _understates_ a dish's
total. The flag exists because a silently-short schedule is the dangerous failure mode for a
host, while a visibly incomplete one is merely unhelpful — but it does mean the feature's value
scales directly with how consistently recipes carry step timings.

Worth knowing: as of 2026-08-17 the dev database had 16 recipes and **zero** recipe steps, since
13 of them predate the step feature entirely (shipped 2026-08-12). The pipeline that would
populate them — Gemini extraction through to persistence — is intact and test-covered end to
end; there simply hasn't been usage since. Steps are also strictly sequential within a dish; no
attempt is made to treat unattended oven time as parallelizable, because nothing in `RecipeStep`
distinguishes active work from waiting.
