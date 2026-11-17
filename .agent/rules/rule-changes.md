---
description: "How to change these rules. Read before editing AGENTS.md or .agent/rules."
---

# Rule changes

- A rule change is a commit that edits the matching file under `.agent/rules/`.
  The commit body states the reason and, if relevant, the incident that exposed
  the gap.
- `AGENTS.md` changes only when the gateway, hard invariants, or rule map changes.
- Do not restate the same rule in two files. The rule file is authoritative; the
  gateway only routes.
- If a command or path changes, update `docs/DEVELOPMENT.md` in the same commit.
- Verbal agreements do not become rules until they are committed.
