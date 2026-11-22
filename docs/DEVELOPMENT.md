# PBZForewarn development workflow

Rules live in `AGENTS.md` and `.agent/rules/`. This file only describes how to
build, verify and package the project. It does not restate branch, commit,
release or evidence rules.

## Environment

- Python 3.12
- Node.js 24
- `lupa==2.8` for the Lua mock tests
- the project-pinned TypeScript 5.9.3 development-only interface checker

Audio you have the right to use goes at `src/js/PBZForewarn/cue.wav`.
Supported input: uncompressed 44100 Hz stereo 16-bit PCM WAV, 0.01–30 seconds.
Only the known original 0.5 sound receives its verified 80 ms silence trim
automatically. Git and Source ZIPs exclude all WAV, BNK and WEM files and
third-party runtimes.

## Build

```bash
npm --prefix tools/dev-types ci --include=dev --ignore-scripts --no-audit --no-fund
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

## Optional Mods Menu test build

`src/lua/PBZForewarnHooks.modsmenu.json` defines the optional UE4SS menu rows.
Every keyed row, including reserved read-only settings, has English, Simplified
Chinese and Traditional Chinese labels/help explaining effect and application
mode. Descriptor tests enforce complete coverage and Menu's 80/400 UTF-16-unit
label/help limits; no translated setting keys or values are introduced.
The installer places it in `platform/steam/ue4ss/Mods/PBZForewarnHooks/` and
ships `Scripts/settings-config.lua`, but deliberately never ships a live
`PBZForewarnHooks.config.json`. Lua creates that JSON beside `Scripts/` on
first startup, importing the legacy Saved TXT once and verifying the write.
Existing JSON bytes are never rewritten during startup. JS and Lua use the JSON
on subsequent starts. All 16 editable settings also update after a complete Menu
save notice. Seven reserved controls remain startup-only. Lua startup can
precede or follow JS: on first migration JS can still read the same legacy
values, and the next full restart uses JSON throughout. Menu and Bridge are
optional third-party downloads, not archive contents.

Run `node src/js/tests/runtime.test.js` and
`python src/lua/tests/test_settings.py` for authority/migration regressions,
then the full Build gate. These mocks do not prove actual Menu discovery,
Bridge saves, translations, controller use, or the resulting sound/glyph output.
Keep existing TXT as a downgrade backup; JSON edits are not synchronized back.
Test.2 introduced the notification route; test.3 extends it to every editable
setting. JS and Lua each check the small `PBZModsMenuBridge/events-PBZForewarnHooks.txt` at most
once per 500 wall-clock milliseconds inside the existing JS tick (also while
paused). Only a complete higher Changed number triggers a canonical JSON read.
Missing/malformed/unreadable JSON retains current output values and retries the
notice. Neither live reader writes either config file. JS updates existing
scheduler options and stable-key recognition without resetting fired/past history.
Layout changes rebuild only the owned canvas. Observation enablement is reversible,
with listener disposal and distinct observer epochs. Lua owns one 500ms watcher,
coalesces game-thread transitions, and pauses capture/publication while disabled;
registered callbacks remain inert until terminal unload. Reserved values remain
startup snapshots; no scheduler restart or historical cue replay is introduced.
Output update calls and failures are retained in diagnostics under menuSettings,
config-saved and config-output-update. These are not audible/screen measurements
or application receipts shown by the third-party Menu. Strict edit-baseline
conflicts remain excluded. See `docs/VALIDATION.md` for current verification
limits and the root README for player instructions.

## Interface check

Before verification (including a rebuild from an extracted Source ZIP), prepare
its single pinned development-only checker:

```bash
npm --prefix tools/dev-types ci --include=dev --ignore-scripts --no-audit --no-fund
node tools/check-interfaces.cjs
python tests/interfaces/test_interfaces.py
```

Use the stated Node.js 24 and Python 3.12 environment. The full verifier passes
its resolved `--node` executable through `PBZ_NODE` to the Python checker suite;
for a standalone suite with a different PATH, set `PBZ_NODE` to that executable.
The local `tools/dev-types/package-lock.json` pins TypeScript 5.9.3 and its
registry integrity. `npm ci` is a development preparation step, never a player
installation step; it needs registry access or a populated npm cache. Missing or
wrong-version checker inputs fail explicitly with the preparation command.

The existing validator runs JavaScript syntax and mocked behavior checks; neither
checks call signatures, and no static type checker was present. The new dependency
provides this bounded increment: the real `audio-environment.js` is checked
against the handwritten `tools/dev-types/audio-environment.d.ts` probe contract.
The checker adds only its entry-parameter JSDoc in memory, checks the whole
module, maps diagnostics back to original source positions, and emits no files.
Runtime source bytes, settings and player dependencies remain unchanged.

The Python suite copies real source and original JS tests to a temporary folder.
It injects `adapter.path(cached, true)`: original syntax checks and unchanged JS
suites still pass, while the new check rejects it at the probe call with
`TS2554: Expected 1 arguments, but got 2`. A property-typo case and missing-checker
case also assert useful diagnostics and nonzero exits. To inspect an isolated
copy directly, use `node tools/check-interfaces.cjs --source <copy-path>`.

Scope is deliberately limited: adapter `valid`/`path` and optional UE object
lookup are described from local source/tests, not a redistributed official SDK.
Reflected values remain unknown until runtime guards inspect them. Other
unannotated helpers are not strict/whole-project coverage. This does not prove
game-build compatibility, runtime member availability or audible output; existing
capability checks and evidence requirements still apply. Compiler packages live
only in ignored `tools/dev-types/node_modules/`; Source ZIPs carry reproducibility
inputs and the project skill, while player archives carry neither.

## Project development skill

`.claude/skills/pbzforewarn-dev/SKILL.md` is the project-owned `pbzforewarn-dev`
skill. In a project-aware Claude Code session, invoke `/pbzforewarn-dev` or let
its warning-rule/settings/audio description select it. Other agents can read the
file directly. It routes each task to actual modules, existing regression tests
and authoritative evidence rules; it does not install a global skill or replace
`AGENTS.md`.

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
2. Extract only the Source ZIP into an empty directory. Supply audio and prepare
   the pinned interface checker plus Lua test dependency using the Build commands.
   Neither dependency is bundled in the source archive.
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
   For the stall and skip-reason comparison, the agent may additionally run
   `python tools/analyze-run.py --save E:/dev/pbz-runs`. That helper follows the
   checkout's `build_state.VERSION` and copies two JSON logs; it is neither the
   watcher nor a general acceptance test for other versions.
   Keep separate capture times distinct so a later snapshot cannot replace the
   evidence behind an earlier report.

`SemanticFallback=0` disables the new rules; this is the bounded observation
version's standard path, not a byte-identical 0.5 rollback. Reinstall the 0.5
archive for that. Editable Lua switches update after a successful Menu save in
test.3; manual JSON edits without a complete Menu notice still require restart.
