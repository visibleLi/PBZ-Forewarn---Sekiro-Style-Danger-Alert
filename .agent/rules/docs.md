---
description: "Document ownership and packaging rules. Read before adding or moving documentation."
---

# Docs

```text
README.txt               player document = Nexus description, copied into the installer
docs/                    developer docs, never packaged
  CHANGELOG.txt          version history
  VALIDATION.md          verified / unverified claims
  DEVELOPMENT.md         build and verification steps (points here)
  MODLOG.md              chronological development log
  ROADMAP.md             direction
  MODDING_PLAN.md        reverse-engineering plan
  CREDITS.md             asset provenance and rights
AGENTS.md                gateway
.agent/rules/            this rule set
```

Rules:

- `README.txt` is the only player document. It is bilingual and matches the
  Nexus description. The packager copies it verbatim.
- Never add a second player document. No `docs/player/` tree.
- Everything under `docs/` is developer-facing and never reaches a player.
- The Source ZIP carries `AGENTS.md` and `.agent/rules/`; the installer never does.
- Rule changes go to `.agent/rules/` and the gateway; `DEVELOPMENT.md` only
  explains how to run things, it does not restate rules.
- If a command or path changes, update `DEVELOPMENT.md` in the same commit.
