---
description: "Agent behavior, forbidden git operations, and evidence discipline. Read at session start."
---

# Agent conduct

- Read `AGENTS.md` and the rule matching the task before acting.
- Never force push `main` or a published tag; never move or delete a published tag.
- Never `reset --hard` a shared branch or run `clean -xfd` without explicit
  confirmation.
- Never commit changes the user did not ask for. Use selective commit tooling.
- Do not claim "done" until the matching gate ran. If it did not run, say so.
- Do not present offline checks as an in-game result, or a log audit as an
  acoustic or screen measurement.
- Send deleted user data to the recycle bin; produce a recovery plan before
  deleting repository history.
- Record evidence in `docs/VALIDATION.md` or `docs/MODLOG.md`. A chat message is
  not a record.
- Do not add dependencies or tools unless the existing scripts cannot do the job;
  explain why in the commit body.
