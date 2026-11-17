---
description: "Current default process choices. Read before changing branch, release, or evidence defaults."
---

# Decisions

These are the current defaults. Change one only with a commit to this file.

1. `feature/0.6.1` is renamed to `dev`; integration branches do not carry versions.
2. `release/*` merges into `main` with `--no-ff`.
3. Evidence lives in `E:\dev\pbz-runs`; long-term archive is
   `G:\PBZForewarn-evidence`.
4. `main` is protected: `verify` required, force push forbidden.
5. Commit format is convention only; no commitlint in CI.
