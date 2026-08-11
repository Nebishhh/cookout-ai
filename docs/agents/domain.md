# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (this repo — `cookout-ai` is 3 workspaces but one coherent domain, not multiple bounded contexts):

```
/
├── CONTEXT.md          (not yet created — see above)
├── docs/adr/
│   └── 0001-monorepo-architecture.md
└── packages/domain/src/
```

## Use the glossary's vocabulary

`docs/glossary.md` already defines this repo's domain terms (Cookout Event, Recipe, GuestGroup, etc.). When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined there. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR (e.g. `docs/adr/0001-monorepo-architecture.md`), surface it explicitly rather than silently overriding:

> _Contradicts ADR-0001 (monorepo architecture) — but worth reopening because…_
