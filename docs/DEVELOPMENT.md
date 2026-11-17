# PBZForewarn development workflow

## Branch and evidence

Develop release fixes on `feature/0.6.1`, branched from `v0.6.0-preview` at `257b421`.
The published `v0.5-preview` and `v0.6.0-preview` tags stay at their existing commits.
`feature/0.6.1-coverage-audit` is research-only: it contains the failed NativeRecovery experiment
and must not be used as a packaging base.
Current source is `0.6.1-dev.5`. Observation logging now runs on its own 20 s cadence
and skips unchanged content, so the main loop no longer serializes the whole observation
snapshot every 5 s. Observation buffers are smaller. Unproven late-window recovery has
been removed. No installer delivered. See ROADMAP.md and MODLOG.md.
Review status (2026-11-15): the summary and baseline regression are under validation. Do not infer
coverage from record retention and do not turn an unexplained past-window record into a cue rule.
The development baseline is `observe-bounded.2`; the first playable candidate is `0.6.0-trial.2-observe.4`;
`observe.5` added branch-transition and YuZan spell-warning resource evidence without adding a cue.
`observe.6` deduplicates those spell observations per task and phase; it still does not add a cue.
A candidate name is not a claim that combat testing has passed.

The two QiShu_Huo rules come from captured actor/ability/action/type facts in build 26367565.
The sanitized `js-package/tests/fixtures/qishu-captured-plans.json` stores their plan times and types.
It contains no full session or personal log. The plan start is not an impact or original-flash measurement.
Runtime still uses the current live task and its conditions, never a fixed schedule of future enemy choices.

## Build

Use Python 3.12, Node.js 24 and `lupa==2.8` for Lua mock tests.
Supply audio you have rights to use at `js-package/PBZForewarn/cue.wav`.
Supported input: uncompressed 44100 Hz stereo 16-bit PCM WAV, 0.01–30 seconds.
Only the known original 0.5 sound receives its verified 80 ms silence trim automatically.
Git/Source ZIPs exclude all WAV, BNK and WEM files and third-party runtimes.

```text
python -m pip install --target hooks-package/tests/lib -r requirements-test.txt
python audio-bank/build_bank.py
python verify.py --node <node-path-or-node-on-PATH>
python package.py
```

The packager outputs `dist/PBZForewarn-0.6.1-dev.5.zip`. This development checkpoint
is not a player release. Add `--source` for the optional source archive.
Use `--output-dir <new-folder>` to collect a candidate separately from older outputs.
`PACKAGE_CHECK.json` stays outside the installer. Only `ProjectPBZ/`, `platform/` and a bilingual README go to players.

`README.txt` at the repository root is the player document: it holds the Nexus description
verbatim, bilingual, and the packager copies it into the installer unchanged. Do not add a
second player copy under `docs/`; that is how the two used to drift apart. Everything under
`docs/` is developer-facing and never reaches a player.

`build_state.py` owns the source inventory, version and required test suites. The verifier hashes inputs
before and after checks; failure removes the old summary. The packager requires the complete suite list,
passed syntax and matching input hashes. Tests cover rejection of partial/failed reports and edits after validation.
ZIP time, permissions and platform metadata are fixed; text line endings are normalized.
Byte reproducibility is checked under the same Python/zlib environment, not promised across arbitrary compressors.
`--check-baseline` is an optional historical comparison; this 0.6 branch is expected to differ from 0.5.

## Candidate verification

1. Run offline suites and package integrity checks.
2. Extract only the Source ZIP into an empty directory. Supply audio and install the stated test dependency there.
3. Rebuild the bank, run full verification, and generate both ZIPs from the extracted source.
4. Compare runtime files and archive hashes with the candidate; preserve the report outside the installer.
5. Test the candidate in PBZ: QiShu_Huo's two moves, existing red/blue/black moves, sound, lock/unlocked,
   duplicate suppression, cancellation, performance, and normal exit. Save logs before starting another run.
6. Audit by actor and actual cue source, not just `missed=0`. Missing recognition can leave `missed=0`.
7. Run `python tools/analyze-run.py --save runs` straight after the session: it reads the
   logs the mod already wrote and prints a verdict per claim, so a run either supports the
   stall fix and the lead target or says which one it contradicts. It reads the files while
   the game is still running, so quitting is not required. `--save` matters because the mod
   rewrites both log files every session; without it the next run erases the evidence.

`SemanticFallback=0` disables the new rules; this is the bounded observation version's standard path,
not a byte-identical 0.5 rollback. Reinstall the 0.5 archive for that. Lua-side switches need a full restart.

## Git and distribution

Review both the full diff against `v0.5-preview` and the incremental runtime diff against bounded.2.
Commit source/test/docs on the feature branch; exclude audio, generated banks, dist, dependencies and personal captures.
Push that branch when reviewed. Create a trial tag only after its candidate has been verified; do not move old tags.
Nexus gets the tested installer ZIP, with an optional audio-free source download. A trial test is required before
calling the new rules fixed or replacing the stable 0.5 download. No publication is performed by the build scripts.
