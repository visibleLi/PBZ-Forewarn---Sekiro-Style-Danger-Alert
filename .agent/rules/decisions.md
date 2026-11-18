---
description: "Current default process choices. Read before changing branch, release, or evidence defaults."
---

# Decisions

These are the current defaults. Change one only with a commit to this file.

1. `dev` is the integration branch, created from `feature/0.6.1`;
   `feature/0.6.1` stays as the historical 0.6.1 line.
2. `release/*` merges into `main` with `--no-ff`.
3. Evidence lives in `E:\dev\pbz-runs`; long-term archive is
   `G:\PBZForewarn-evidence`.
4. Required policy for `main`: `verify` must pass and force pushes are forbidden.
   GitHub branch-protection configuration has not been verified; this is a
   requirement, not a claim that the server enforces it.
5. Commit format is convention only; no commitlint in CI.
