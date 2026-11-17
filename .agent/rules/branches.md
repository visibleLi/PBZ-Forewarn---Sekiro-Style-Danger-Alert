---
description: "Branch model, merge rules, and tag rules. Read before creating, merging, or deleting a branch."
---

# Branches

| Branch | Start | Direct commits | Merge into | Delete |
|---|---|---|---|---|
| `main` | — | ❌ | — | never |
| `dev` | `main` | ✅ version/release housekeeping only | — | never |
| `feat/<slug>` | `dev` | ✅ | `dev` (rebase + ff) | after merge |
| `fix/<slug>` | `dev` | ✅ | `dev` (rebase + ff) | after merge |
| `chore/<slug>` | `dev` | ✅ | `dev` (rebase + ff) | after merge |
| `release/vX.Y.Z` | `dev` | ✅ version/docs only | `main` (`--no-ff`) | after release |
| `hotfix/vX.Y.Z` | `main` | ✅ | `main` + `dev` | after release |

Rules:

- `main` never receives direct commits. Only `release/*` or `hotfix/*` merges.
- `main` is protected: `verify` must pass, force push is forbidden.
- `dev` is the next-version integration branch. Behavior changes go through short branches.
- Short branches start from `dev`, rebase onto `dev`, then merge with `--ff-only`.
- `release/*` may change only version carriers, CHANGELOG, VALIDATION, README and release docs.
- `hotfix/*` starts from `main`, bumps the patch version, merges to `main`, then back to `dev`.
- Never force push `main`; never move or delete a published tag.
- Branch names are lowercase with hyphens. Do not name integration branches after versions.

`dev` is the integration branch. `feature/0.6.1` remains as the historical
0.6.1 line; do not add new work there.
