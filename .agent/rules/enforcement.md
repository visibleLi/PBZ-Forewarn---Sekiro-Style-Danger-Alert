---
description: "What the repository enforces by machine and what is convention only. Read when unsure whether a rule is checked."
---

# Enforcement

| Enforced by machine | Convention only |
|---|---|
| CI rejects tracked audio and build output | branch naming |
| `verify.py` all suites green, each with checks | Conventional Commits |
| `package.py` version and input-hash checks | updating docs before release |
| `set_version.py` single-source version | evidence summary wording |
| `release.yml` requires real audio | direct commits to `dev` boundary |
| `.gitignore` plus CI guard | evidence archive path |

If a rule matters, prefer making it machine-checkable. Do not add a new tool for
a rule that a short script or an existing check can cover.
