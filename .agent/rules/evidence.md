---
description: "In-game logs, saved evidence, and VALIDATION claims. Read before running the game or writing a test claim."
---

# Evidence

| Item | Rule |
|---|---|
| Live game logs | `%LOCALAPPDATA%\ProjectPBZ\Saved\pbzforewarn_*.json` plus `PBZForewarn.txt` |
| Live log watch during play | `python tools/analyze-run.py` (no save); the agent reads the current logs on request |
| After a validation run you intend to cite | `python tools/analyze-run.py --save E:/dev/pbz-runs` before starting another run; ordinary play does not need it |
| Local evidence store | `E:\dev\pbz-runs\<session-id>\`, outside the repository, never committed |
| Release evidence | copy to `G:\PBZForewarn-evidence\runs\<session-id>\` for long-term retention |
| Inside the repository | `runs/` is a temporary working copy, gitignored, safe to delete |
| Commit ban | logs contain session IDs and paths; never commit them |

`docs/VALIDATION.md` is the only place a claim lives. Each entry states: date,
build, session ID, metric, and limits. Raw logs stay out of Git. A sanitized
fixture is allowed only with provenance and no personal data.

Claim discipline:

- Offline checks are not an in-game result.
- A log audit is not an acoustic or screen measurement.
- `missed=0` means no queued cue was missed, not full move coverage.
- One session is one session, not a distribution.
- A pause or level load is not a hitch; separate them before reporting.
