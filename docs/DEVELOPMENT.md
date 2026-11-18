# PBZForewarn development workflow

Rules live in `AGENTS.md` and `.agent/rules/`. This file only describes how to
build, verify and package the project. It does not restate branch, commit,
release or evidence rules.

## Environment

- Python 3.12
- Node.js 24
- `lupa==2.8` for the Lua mock tests

Audio you have the right to use goes at `src/js/PBZForewarn/cue.wav`.
Supported input: uncompressed 44100 Hz stereo 16-bit PCM WAV, 0.01–30 seconds.
Only the known original 0.5 sound receives its verified 80 ms silence trim
automatically. Git and Source ZIPs exclude all WAV, BNK and WEM files and
third-party runtimes.

## Build

```bash
python -m pip install --target src/lua/tests/lib -r requirements-test.txt
python tools/audio-bank/build_bank.py
python tools/verify.py --node <node-path-or-node-on-PATH>
python tools/package.py
```

The packager writes `dist/PBZForewarn-<VERSION>.zip`. This development
checkpoint is not a player release. Add `--source` for the optional source
archive. Use `--output-dir <new-folder>` to collect a candidate separately from
older outputs. `PACKAGE_CHECK.json` stays outside the installer. Only
`ProjectPBZ/`, `platform/` and a bilingual README go to players.
The Source ZIP carries `AGENTS.md` and `.agent/rules/`; the installer never does.

`README.txt` at the repository root is the player document: it holds the Nexus
description verbatim, bilingual, and the packager copies it into the installer
unchanged. Do not add a second player copy under `docs/`; that is how the two
used to drift apart. Everything under `docs/` is developer-facing and never
reaches a player.

## What the scripts own

`tools/build_state.py` owns the source inventory, version and required test
suites. `tools/verify.py` hashes inputs before and after checks; failure removes
the old summary. `tools/package.py` requires the complete suite list, passed
syntax and matching input hashes. Tests cover rejection of partial/failed
reports and edits after validation.

ZIP time, permissions and platform metadata are fixed; text line endings are
normalized. Byte reproducibility is checked under the same Python/zlib
environment, not promised across arbitrary compressors. `--check-baseline` is an
optional historical comparison; this branch is expected to differ from 0.5.

To change the development version, edit `VERSION` in `tools/build_state.py`, then
run `python tools/set_version.py --previous <old-version>`. Without arguments the
script only checks consistency. It has no positional new-version argument; update
CHANGELOG and validation/release notes separately.

## Provenance

The two QiShu_Huo rules come from captured actor/ability/action/type facts in
build 26367565. The sanitized
`src/js/tests/fixtures/qishu-captured-plans.json` stores their plan times and
types. It contains no full session or personal log. The plan start is not an
impact or original-flash measurement. Runtime still uses the current live task
and its conditions, never a fixed schedule of future enemy choices.

## Candidate verification

1. Run offline suites and package integrity checks.
2. Extract only the Source ZIP into an empty directory. Supply audio and install
   the stated test dependency there.
3. Rebuild the bank, run full verification, and generate both ZIPs from the
   extracted source.
4. Compare runtime files and archive hashes with the candidate; preserve the
   report outside the installer.
5. Test the candidate in PBZ: QiShu_Huo's two moves, existing red/blue/black
   moves, sound, lock/unlocked, duplicate suppression, cancellation,
   performance, and normal exit. Save logs before starting another run.
6. Audit by actor and actual cue source, not just `missed=0`. Missing
   recognition can leave `missed=0`.
7. The agent captures the logs and reports through the Live log watch procedure
   in `.agent/rules/evidence.md`; the user does not need to run Python or leave
   the game early. Preserve the exact capture being cited, including its timestamp.
   For the dev.5 stall comparison, the agent may additionally run
   `python tools/analyze-run.py --save E:/dev/pbz-runs`. That helper checks the
   dev.5-specific claims and copies two JSON logs; it is neither the watcher nor
   a general acceptance test for later versions. Keep separate capture times
   distinct so a later snapshot cannot replace evidence behind an earlier report.

`SemanticFallback=0` disables the new rules; this is the bounded observation
version's standard path, not a byte-identical 0.5 rollback. Reinstall the 0.5
archive for that. Lua-side switches need a full restart.
