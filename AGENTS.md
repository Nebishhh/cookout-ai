# AGENTS.md

All guidance for coding agents working in this repository lives in **[`CLAUDE.md`](./CLAUDE.md)**. Read it before making any changes.

Never edit `.claude/skills` directly. Edit skills only in `.agents/skills`, then run `node scripts/syncSkills.mjs --write` to regenerate `.claude/skills`; CI (`npm run skills:check`) fails if the two diverge. Before editing a skill listed in `skills-lock.json`, remove its lock entry and add it to `LOCAL_SKILLS` in `scripts/syncSkills.mjs` in the same change.

This file exists so agents that look for `AGENTS.md` by convention find their way there. Apart from the two skills rules above (where to edit skills, and making a vendored skill local before editing it), which are repeated here because agents that read this file edit `.agents/skills` directly, keep the guidance itself in `CLAUDE.md` only: don't duplicate it here, or the two will drift.
