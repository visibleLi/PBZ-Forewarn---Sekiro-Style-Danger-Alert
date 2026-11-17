---
description: "Commit format, scope, and forbidden content. Read before writing a commit."
---

# Commits

Format: `type(scope): subject`

- type: `feat` `fix` `chore` `docs` `test` `ci` `refactor` `perf`
- scope: `js` `lua` `tools` `docs` `ci` `audio` `release`
- subject: imperative, ≤ 72 characters, no trailing period
- body: why plus evidence (session ID, check count, archive hash, date)

Rules:

- One concern per commit. Do not mix directory moves, behavior changes and docs.
- Never commit generated output: `dist/`, `verification/`, `runs/`, `cue.wav`,
  `*.bnk`, `*.wem`, `generated/`, `src/lua/tests/lib/`, `__pycache__/`.
- Never commit logs, secrets or personal paths.
- Agents must use selective commit tooling; never `git add -A` or `git commit -a`.
- Run the matching gate before committing. If it was not run, say so in the body.
- A commit that changes behavior must name the evidence in `docs/VALIDATION.md`
  or state that the behavior is unverified.
