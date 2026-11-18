---
description: "In-game logs, saved evidence, and VALIDATION claims. Read before running the game or writing a test claim."
---

# Evidence

| Item | Rule |
|---|---|
| Live game logs | `%LOCALAPPDATA%\ProjectPBZ\Saved\pbzforewarn_*.json` plus `PBZForewarn.txt` |
| Live log watch during play | On "我开始玩了", the parent launches the local read-only `live-log-watch` agent; it samples about every 60 seconds without asking the user to run commands |
| Watch completion | After two consecutive checks without a PBZ process, the watcher writes `WATCH_NOTES.md`, `FINAL_REPORT.md` and a timestamped end-of-session snapshot outside the repository, then returns to the parent |
| Validation evidence | The agent preserves the snapshot being cited before it is overwritten; the user does not run `--save` manually. Ordinary play without a requested watch needs no capture |
| Local evidence store | `E:\dev\pbz-runs\<session-id>\`, outside the repository, never committed |
| Release evidence | copy to `G:\PBZForewarn-evidence\runs\<session-id>\` for long-term retention |
| Inside the repository | `runs/` is a temporary working copy, gitignored, safe to delete |
| Commit ban | logs contain session IDs and paths; never commit them |

`tools/analyze-run.py` is a dev.5-specific analyzer, not the watcher and not a
universal acceptance gate. Its optional `--save E:/dev/pbz-runs` copies two JSON
logs and an analysis report; it does not replace the watcher's six-file snapshot.
Keep multiple capture times for one session distinct rather than overwriting the
snapshot supporting an earlier report. Personal watcher definitions remain outside
the repository and both distribution archives.

`docs/VALIDATION.md` is the only place a claim lives. Each entry states: date,
build, session ID, metric, and limits. Raw logs stay out of Git. A sanitized
fixture is allowed only with provenance and no personal data.

Claim discipline:

- Offline checks are not an in-game result.
- A log audit is not an acoustic or screen measurement.
- `missed=0` means no queued cue was missed, not full move coverage.
- One session is one session, not a distribution.
- A pause or level load is not a hitch; separate them before reporting.
