---
name: pbzforewarn-dev
description: Develop PBZForewarn warning rules, settings changes, or Wwise audio changes using the existing cue pipeline, configuration authority, and evidence boundaries.
---

# PBZForewarn development

## Route the task

1. Read `AGENTS.md` and the matching `.agent/rules/` entries. If present, use the
   local-only `docs/agents/issue-tracker.md` and `docs/agents/domain.md` guides;
   they are not distributed prerequisites. In a fresh clone or Source ZIP, use
   the task's supplied spec, `docs/ROADMAP.md` and `docs/MODDING_PLAN.md`, plus
   `GLOSSARY.md` / relevant `docs/adr/` records only when they exist. Do not
   create tracker or domain documents merely to run this skill. Finish with the
   requested behavior and acceptance seam identified; use the task entry below.
2. Inspect the named source and its existing tests before editing. Separate the
   requested behavior from prior regression protection. Finish with a small
   change boundary and a test that could fail for the requested change.
3. Use the targeted commands below, then the full workflow in
   `docs/DEVELOPMENT.md`. Record claims through `.agent/rules/evidence.md` in
   `docs/VALIDATION.md`; finish with check counts, evidence limits, and any
   unrun gate explicit. Offline checks are not an in-game result.

## Warning rules

- Recognition: `src/js/PBZForewarn/attack-recognition.js:recognizeWarning` and
  `core.js:classifyEffect`; `adapter.js:events` connects timeline actions to the
  existing warning pipeline. Scoped semantic/cast rules live in
  `semantic-fallback.js`, `generic-attack.js`, and `cast-warning.js`.
- Eligibility: `adapter.js:requirements`, `semanticFallbackEligibility`, and
  `castWarningEligibility`; target selection is `target-filter.js`. Trace the
  execution-time recheck in `main.js` as well as collection-time checks.
- Timing/cancellation: `core.js:Scheduler.step`, `stepEvents`, `cancelEvent`,
  `cancelTask`; `main.js:emit`, `cancelRecordAudio`, shutdown and delegate cleanup
  connect audio and glyph lifetimes. Reuse this route rather than emitting a cue
  directly from an observation callback.
- Observation is a separate boundary: `native-attack-observer.js`,
  `timeline-observation.js`, `attack-semantics-probe.js`, and
  `observation-store.js`. A captured plan, enum, or diagnostic-only candidate is
  not cue-producing timing evidence. Before promoting one, name its
  actor/ability/action scope, timing basis, eligibility, and cancellation evidence.
- Start with `node src/js/tests/core.test.js` and
  `node src/js/tests/adapter.test.js`; select the existing
  `semantic-fallback.test.js`, `generic-attack.test.js`, `cast-warning.test.js`,
  `cast-followup.test.js`, or `target-filter.test.js` for the touched route.
  `runtime.test.js` covers the wiring; observation tests cover observation only.
  Finish with a regression at the changed seam and the required gameplay evidence
  for any new warning claim, following `docs/VALIDATION.md`.

## Settings

- Start at `main.js:DEFAULTS`, `TEMPLATE`, `parseSettings`, `readText`,
  `writeText`, and `configPath`. `Saved/PBZForewarn.txt` is the current authority;
  an existing file is read, not regenerated on startup. Inspect
  `docs/PBZForewarn.example.txt` when an intentional setting changes.
- Follow each setting to its consumer: JS setup/update,
  `wwise-audio.js:update` or `presentation.js:update`, and the independent
  startup reads in `src/lua/timeline-hooks.lua` / `observation-hooks.lua`.
  Current manual edits use full-game-restart semantics. A consumer reading a
  shared object does not establish a persistence/live-apply API. For a Menu task,
  first read its current local spec and gate evidence; provider availability and
  live apply must be established, not inferred from this skill.
- Run `node src/js/tests/runtime.test.js` for parsing, bounds, existing-file
  preservation and stop/restart. For output settings also run
  `presentation.test.js` / `wwise-audio.test.js` under `src/js/tests/`; for Lua
  startup behavior use the relevant `src/lua/tests/test_*.py` and documented
  Python environment. These are existing protections, not newly delivered work.
  Finish with one authoritative persistence path, explicit restart/live behavior,
  and failure/preservation assertions for the requested change.

## Audio

- Read `.agent/rules/assets.md` before touching inputs. The current route is
  `wwise-audio.js:createNativeAudio`: private component/event, independent
  `PBZForewarn.bnk`, `prepare`, `post`, `update`, `stop`, and `dispose`.
  `wwise-bank-config.js` consumes generated bank metadata;
  `tools/audio-bank/build_bank.py` owns generation. Preserve that ownership.
- `audio-environment.js:createAudioEnvironmentProbe` reads configured AkSettings
  routing only. `sound-prepared`/`LoadData` returning is not confirmed bank
  readiness; a nonzero PlayingID and `sound-play` remain playback observations,
  not an acoustic measurement. Check existing claim limits in
  `docs/VALIDATION.md` before describing audibility or concurrency.
- Run `node src/js/tests/wwise-audio.test.js`,
  `node src/js/tests/audio-environment.test.js`, and the bank checks through
  `docs/DEVELOPMENT.md`. For lifecycle wiring run `runtime.test.js`. Finish with
  build/mock evidence separated from the in-game and audible-output evidence
  required by the changed claim.

## Developer interface slice

`tools/check-interfaces.cjs` checks the actual `audio-environment.js` probe with
its small handwritten `tools/dev-types/audio-environment.d.ts` contract. Setup,
commands and the original-check/mutant comparison are in the **Interface check**
section of `docs/DEVELOPMENT.md`. Run that slice when changing the probe or its
contract; `tests/interfaces/test_interfaces.py` is discovered by normal verify.
This is not a game SDK, complete interface coverage, or proof of Puerts
callability. Retain runtime capability/validity guards; use reflected declarations
only with their provenance, game-build and redistribution limits established.
