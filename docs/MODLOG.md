# Development journal

## 2026-11-22: test.3 smoke acceptance and release preparation

- User authorizes conditional push/tag v0.7.0 and subsequent scoped-warning review. Session `mwrhcgk8-wkabhr6e` matches delivered runtime25/25; 17 save/runtime/output triples include15 font-size changes, four cues, zero runtime errors. Other15 editable controls were not changed in this session. Full evidence/limits are in VALIDATION.md.
- One observer write denial recovered after267ms; no persistent cue failure found. Retention and pause-related gaps limit claims. Corrected stale CONFIG_CREATED restart wording without changing behavior.
- Untracked third-party reference descriptions, raw logs and build output remain excluded from selective commits. Release requires a fresh gate and green remote CI; network/CLI availability is recorded in the external delivery report.

## 2026-11-22: combat toggle feedback and complete setting help

- User reports one actual test.2 fight with output-toggle combinations and normal game/mod operation. This is user observation, not an acoustic, screen or latency measurement. Preserved log audit and limits are recorded in VALIDATION.md.
- Test.3 supplies en/zh-Hans/zh-Hant labels and help for every setting, including all reserved read-only rows. Descriptions trace to consumers, explain application modes and dependencies, and retain setting identifiers/values. The user then authorized all editable controls live: update existing scheduler/adapters/layout and reversible observation/Lua lifecycle without replaying consumed cues. Seven reserved settings stay startup-only.
- Descriptor regressions require localized help/name coverage for every keyed row and respect Menu's actual 80/400 UTF-16-unit text limits. Full gate and packaging results are recorded with the local candidate.

## 2026-11-22: saved settings audit and limited live outputs

- User confirmed Menu discovery and requested immediate saving/application. Preserved session `mwrbqsef-e2fltjgn`: canonical JSON has GlyphOn=false and SemanticFallback=false, while the later runtime snapshot retained true for both. Bridge write logs confirm persistence; test.1 intentionally had no live application. No combat, acoustic or display-effect claim follows.
- Test.2 consumes complete monotonically increasing Menu Changed notices with 500ms bounded event-file checks. Only SoundOn, SoundVolume and GlyphOn mutate the existing output settings; scheduler, recognition, layout and Lua controls remain startup values. JS never writes settings; bad reads retain current values and retry.
- Save/update diagnostics distinguish file contents from output call results; output failures retain saved preferences. Strict edit-baseline conflict handling and Menu application receipts remain deferred. Full gate and game evidence limits are recorded in VALIDATION.md.

## 2026-11-22: restart-only optional Mods Menu preview

- User authorized unattended delivery of a reduced first preview; implementation is on `feat/mods-menu-settings`, version `0.7.0-test.1`. Original strict single-TXT/live-apply gate is superseded for this local preview only; fuller behavior remains deferred.
- Added project-owned UE4SS Menu metadata and a Lua startup settings helper. One JSON in the hook mod folder becomes authoritative after verified one-time migration; legacy TXT remains untouched. Installer deliberately carries no live JSON, so updates cannot seed defaults over user preferences.
- JS and Lua consume startup snapshots; every setting requires full restart. No new settings polling, live output seam, cue scheduling rule or third-party runtime is added. Reserved controls remain read-only in metadata.
- Owned runtime, migration and packaging tests exercise preservation and failure paths. Review corrected empty legacy EOF, numeric booleans, alias ordering, comments, numeric grammar, byte limits, Unicode, UTF-16 migration and invalid overwritten JSON members. Final verification/package evidence is recorded in VALIDATION.md; no game run or public release is claimed.

## 2026-11-21: research absorption baseline and Menu gate

- Implementation started from clean `dev` commit `755398f` on `feat/research-absorption`. The developer-support and optional Menu specifications remain independently scoped; no third-party compatibility matrix is part of this work.
- Fresh baseline gate: Python 3.12.16, Node 24.22.3, `lupa==2.8`; audio build, all 23 suites / 684 checks, and packaging passed. Python 3.12 was installed through the existing interpreter manager because the default Python 3.14 cannot load the required wheel. Explicit interpreter paths were used; global Python/Node defaults were not changed.
- Baseline installer: 24 files, SHA-256 `f8b8eb3521515e38f064e5975be2097c054ff7a27e8764f74efdd96ba1e7de82`; sorted extracted-file hash manifest digest `500b815c589d4f188b8be9de4d48dc42745c037a277ac50e52e5c380826d9138`. These identify a local offline build, not a new player release or in-game validation.
- The optional Menu gate did not pass. Static inspection of the reviewed Menu 1.1.0/API 4 shows native registration selects a different settings directory. The shared-hub consumer does not establish publisher attach/detach; its fresh-read revision/retry path does not preserve the user's original edit baseline; its ordinary apply error reports "Not saved", which cannot by itself describe saved-but-live-apply-failed. A public toast is only an unverified feedback candidate.
- A proposed isolated execution of third-party Menu source was denied by the permission layer. Investigation was restricted to static inspection, without executing that source through another route. The exact blockers and alternatives are in the local Menu tracker gate report; no Menu production runtime, second config authority or third-party modification was introduced.
- Developer support now includes the project `pbzforewarn-dev` skill, a bounded real-source interface check and one pinned development-only dependency, TypeScript 5.9.3. The handwritten probe declarations do not redistribute a game SDK. No runtime JS/Lua or audio source changed.
- The added checker rejects a two-argument `adapter.path` call that the unchanged 17 JS suites / 502 checks and 36 syntax checks accept. Two other cases cover misspelled members and explicit failure when compiler preparation is missing. Valid source remains unchanged; normal verification discovers the new suite and passes 24 suites / 687 checks.
- Source inventory, CI/release preparation and extracted-source instructions include the exact checker inputs. Archive assertions exclude compiler packages from Source ZIPs and all developer tooling from installers. An independent extracted-source rebuild passes 24 suites / 687 checks and reproduces both archive bytes under the same Python/zlib. The player installer retains the baseline SHA-256 above.
- Independent review identified a portability issue in skill references to local-only tracker/domain guides. They are now optional with distributed-document fallbacks; private local guides were not added to the archives. A second review finding was that a clean-checkout full gate would skip the new checker preparation; the canonical gate, agent gateway command block and `Run-Checks.ps1` now run the pinned `npm ci` step, and the rule baseline is updated to 24 suites / 687 checks.
- No game was launched, installed MODs were not changed, and player logs were not inspected. The original behavior debt and legacy third-party compatibility questions remain separate; this record is not a new support claim.

## 2026-11-18: dev.6 third session, 214 cues

- `mwm40tnt-sv9ktdi1`, build `0.6.1-dev.6`, 20:40:57–22:56:15. 214 cues (red 59 / blue 96 / black 59), lead median 328 ms (179–350), 2 missed, 20 `condition-not-met`, 37 cancels (35 duplicate suppressed), 0 errors; `analyze-run.py` verdict PASS on all seven claims.
- The 20 skips are two new `require-tags` families: `GA_WuXuan_Skill_01_C` / `_Loop_C` requiring `btk` (16) and `GA_GuWanYue_GEx_04_C` requiring `CharacterState.AbilityState.Common.Hidden` (4). Both requirements are read from the resource catalog; `lateBy` 82–130 ms is when the scheduler noticed them, not why they were skipped.
- Both misses are `past-window`. `GA_EMei_Sword_Special_04_C` is the first record with `endedBeforeObservation=true` (observed 2.316 s against a node that ended at 1.975 s); `GA_SpearMan_Ride_Skill_05_C` was still running when noticed 418 ms after start.
- Loop health: 82 tick-gap records, 27 spanning pauses, 4.5–6.5 s cadence share 3.8 % (test.2 96.6 %), observation serialize peak 7 ms (test.2 403 ms). Two played-time `loopStopped` spans: 17.4 s at session start and 13.2 s after a BossRush autosave plus a `BindBellDelegate` rebind; no level-load trace exists.
- Retention: `recent` 1386/2048 entries with 0 dropped; activity lane 181 of 9834 retained (byte cap); resource catalog 128 of 1759 retained.
- Evidence: `E:/dev/pbz-runs/mwm40tnt-sv9ktdi1/` with `FINAL_REPORT.md` and `WATCH_NOTES.md`.

## 2026-11-18: dev.6 in-game skip classification

- Both dev.6 sessions are classified: `mwlpnl9v-aqz64nw9` (18 cues, red 11 / blue 6 / black 1, lead median 331 ms, 4 skips, 2 cancels) and `mwlp07zq-xe9li6vx` (9 cues, red 7 / blue 2, lead median 338 ms, 5 skips; ended by the user's graphics-settings crash). Zero errors in both; `analyze-run.py` verdict PASS for both.
- Every retained `condition-not-met` record is `GA_GuiChai_Red_P1_GEx_01_C` with `eligibilityReason=require-tags`, and the same sessions' resource catalogs list that node requiring the gameplay tag `ddsd`. The six dev.5 records were therefore asset-requirement exclusions, not late-window decisions; `lateBy` 84–119 ms is when the scheduler noticed them past the window.
- Evidence: `E:/dev/pbz-runs/mwlpnl9v-aqz64nw9/` and `E:/dev/pbz-runs/mwlp07zq-xe9li6vx/`, copied to `G:/PBZForewarn-evidence/runs/`.

## 2026-11-18: dev.6 skip-reason diagnostics

- `condition-not-met` now records `eligibilityReason` (from the adapter's tag check), `lateBy`, `lateGrace` and `endedBeforeObservation`. No scheduling or cue decision changed.
- The first target is GuiChai P1 `GA_GuiChai_Red_P1_GEx_01`: the dev.5 captures have six `conditions-not-met` records, all 86–117 ms after the node start against an 80 ms grace, but the old payload dropped the tag-check reason.
- `analyze-run.py` follows `build_state.VERSION` and prints retained skip reasons; its tests use the same version source.
- Version bumped to `0.6.1-dev.6`; offline 684 checks, then the two in-game sessions above.

## 2026-11-18: workflow-audit corrections

- Corrected the version-bump instructions to match the existing two-step tool: edit `tools/build_state.py:VERSION`, then run `tools/set_version.py --previous <old-version>`.
- Added the omitted `tools/set_version.py` to the Source ZIP inventory. Archive tests now check the gateway/rules boundary and execute the extracted version checker, including a mismatched-carrier rejection.
- The 50/59 and 53/61 readings below are two capture times from the same dev.5 session, not conflicting counts. Neither raw snapshot was replaced. The earlier correction that treated 53/61 as a transcription error was mistaken.
- GitHub branch protection remains unverified. NativeRecovery investigation history is recoverable from the archived bundle, not an assumed current investigation branch.
- Restored the agreed Live log watch workflow in the evidence guidance. It is agent-operated; the dev.5 analyzer is optional and is not a universal release gate. No gameplay behavior or version change is part of this correction.

## 2026-11-18: engineering close-out and project rules

- `AGENTS.md` is now a gateway; the rules live in twelve modules under `.agent/rules/`. `docs/DEVELOPMENT.md` only carries build, verify and package steps.
- `dev` was branched from `feature/0.6.1` at `16517a0`; `feature/0.6.1` stays as the historical 0.6.1 line. `main` remains `257b421` (0.6.0-preview).
- The Source ZIP includes `AGENTS.md` and `.agent/rules/`; the Nexus installer still excludes them. The source inventory is `tools/build_state.py`.
- Gate: 23 suites / 682 checks; installer unchanged except `README.txt`; CI green on `dev`.
- Open: GuiChai P1 `GEx` `condition-not-met` (6), the 118 ms observation-delay case, the observation-chain default (D1), the same-map long-stall run, and the six legacy CRLF blobs.

## 2026-11-17: dev.5 in-game result

- Session `mwkibq6i-e0av2xfn`, build `0.6.1-dev.5`. Installed runtime was compared with `dist/PBZForewarn-0.6.1-dev.5.zip` across all 23 runtime files. Two saved captures cover approximately 24.5 and 34 minutes of this same session; these are capture spans, not separate test runs. The game root recorded in the log is `D:/steam/steamapps/common/PBZ`.
- Earlier capture: `E:/dev/pbz-runs/mwkibq6i-e0av2xfn/pbzforewarn_diagnostics.json`, `at=1794910241455` (2026-11-17 18:10:41.455 UTC+08:00), 50 retained tick-gap records and 59 observation writes. This is the capture used by the accompanying `FINDINGS.md`.
- Later capture: `E:/dev/pbz-forewarn/runs/mwkibq6i-e0av2xfn/pbzforewarn_diagnostics.json`, `at=1794910788343` (2026-11-17 18:19:48.343 UTC+08:00), 53 retained tick-gap records and 61 observation writes. Do not replace one capture with the other or mix their counts and time spans.
- Both saved analysis reports show 0.0% of consecutive tick-gap intervals in the 4.5–6.5 s band, versus 96.6% in the test.2 baseline. Both captures record a 7 ms peak observation serialization time, versus 403 ms in that baseline.
- 37 cues: 29 standard, 5 `semantic-fallback` (Acolyte Yanru), 3 `cast-warning` (No. 3 Musician Puppet). Both 0.6 additions fired in a live session. Colours red 24, blue 7, black 6. Median lead 334 ms, range 118–350 ms, against 285 ms on test.2. `missed=0`, `conditionsNotMet=6`, 2 cancels, 2 duplicate cancels suppressed, 0 errors.
- The earlier capture's manual review associated seven long gaps with world/player resets and one with a nearby pause. This is correlation, not proof of cause. The analyzer separates pause-overlapping records and duration bands; its 2000 ms threshold alone cannot prove a gap was loading rather than a stall, and the measured 7 ms serialization peak does not bound all game-thread work. The reported 1528 ms maximum applies only to its 250–2000 ms category.
- Scope: one session, one machine, one build. It shows these two numbers for this session, not a distribution, and it does not re-test coverage of every enemy or move.

## 2026-11-17: one player document

- The repository carried three overlapping player texts: `README.txt`, `docs/README_EN.txt` and a `docs/player/` tree (`README.txt`, `README_EN.txt`, `CHANGELOG.txt`, `CREDITS.md`, `VALIDATION.md`). The packager read `docs/player/README.txt`, so editing the root README changed nothing a player saw, and the two copies had already diverged: root described the dev.5 stall fix, the packaged copy described it in shorter form, and `docs/README_EN.txt` was a third English wording.
- The user's rule: one player document, matching the Nexus description, plus developer docs that never ship. Root `README.txt` is now that document, bilingual, and `tools/package.py` copies it verbatim. The five `docs/player/` files and `docs/README_EN.txt` are deleted; `docs/` keeps only developer material (`CHANGELOG`, `CREDITS`, `DEVELOPMENT`, `MODDING_PLAN`, `MODLOG`, `ROADMAP`, `VALIDATION`, `PBZForewarn.example.txt`).
- `test_default_produces_only_installer_and_external_report` now asserts the packaged README equals the repository README byte for byte after line-ending normalization. Swapping the packager back to any second source fails it (verified by pointing it at `docs/CHANGELOG.txt`).
- Installer content is unchanged except `README.txt`: 24 files, runtime hashes identical to the archived dev.5 build, 665 offline checks over 22 suites. `matchesOriginalRuntime` stays false because this dev line has never matched the frozen 0.5 baseline; that flag is not a regression signal here.

## 2026-11-15: dev.3 summary serialization repair

- Read C:/Users/lmany/.codex/AGENTS.md plus mod-any-game and reverse-engineering. Scope is the explicitly agreed summary overhead/data-loss repair and disabling unproven recovery by default; no BOSS rule or game setting change.
- Root cause in our summary: snapshot repeatedly serialized every retained actor after each whole-actor output eviction, left all data in memory, and counted the same omitted actors again on every snapshot. Actor capacity eviction also inspected wrapper.score rather than wrapper.value.score. These defects were reproduced offline.
- Schema 2 bounds data at record time using cached row byte counts. Skills lose detail before whole actors; actor and session counts remain separate from detail completeness. Snapshots perform no JSON.stringify; the final observation file is serialized once by the existing flush path. Fixed last warning evidence being replaced by passive noise, invalid owner/role attribution, and colors including non-cue observations.
- Kept private benchmark files outside the source checkout under outputs/PBZForewarn-摘要性能审计. Partial replay of 352 retained test.2 rows: old output kept 46/53 cues, new output keeps 53/53 and both GuiChai phases. Synthetic pressure is labelled 24 actors x 64 abilities, not a reconstruction of the evicted session.
- Complete observation snapshot/serialization mean: retained replay 11.44 -> 4.46 ms; pressure 181.94 -> 2.01 ms. Recording work is modestly increased and spread across incoming records; captured complete-record p99 was 0.77 ms, max 1.53 ms on the local benchmark. This does not certify Unreal performance or all tick-gap causality.
- Correction after inspecting the live user file: the user's PBZForewarn.txt still has only 0.5-era keys and no LateDodgeRecovery line, so test.2 enabled the feature through the default rather than an explicit override. The earlier claim that only explicit values could enable it was wrong.
- dev.4 therefore removes the recovery module, its config keys, tests, diagnostics field and runtime path entirely. A stale line in an old config is now an unknown key and is ignored. No automatic recovery cue can run.
- Standard cue, glyph, Wwise, cast rules and Lua gameplay hooks remain behaviorally unchanged. Development version is 0.6.1-dev.4, separate from immutable test.2 archives. No publication.
- Full offline validation for dev.4 passes 658 checks. An independent Source ZIP rebuild produced byte-identical archives; installer SHA256 `83e8132070e9337bddfc9baf0a3bab26a310b89f9bc6decfc563219ecc9fc00c`, 24 runtime files, zero recovery modules.
- Live-session reading works while PBZ is running: Saved JSON plus loader and UE4SS logs are readable without quitting. The 22:59-23:22 session on test.2 showed 10 further cues across SpearMan_Rider, QinNv, HuaShan and DaTouWaWa; recovery matched zero times again.

## 2026-11-15: 0.6.1-test.2 new-boss audit

- Installed runtime was verified against the test ZIP: all 25 files matched; session `mwhlia37-q8iyj0l7`, version `0.6.1-test.2`.
- New main boss was `GuiChai_Red`: P1 emitted 9 cues (red 8, blue 1, black 0); P2 emitted 18 cues (red 7, blue 3, black 8). The whole 67.4-minute session emitted 53 cues (red 24, blue 21, black 8).
- The scoped recovery did not fire: 0 `past-window`, 0 matched, 0 recovery cues. This run neither demonstrates a positive recovery benefit nor a duplicate false positive.
- Five red `GA_GuiChai_Red_P1_GEx_01` nodes required tag `ddsd`, expired while still ineligible, and were followed by the same task's `OnCancelled`. They are correctly excluded, not `past-window` misses.
- No JS, HUD, Wwise or observation write errors. All 53 requests obtained non-zero PlayingIDs; 18 sounds were stopped and 10 superseded by later cues.
- Performance remains unresolved: 396 tick-gaps were recorded, including a stable roughly 340-460 ms cadence during the boss fight. Observation steps peaked at 11 ms, and a separate observation serializer reached 524 ms once near session teardown, so these logs do not attribute that cadence to test.2 and do not establish performance acceptance.

## 2026-11-15: clean 0.6.1 encounter-evidence line

- Started `feature/0.6.1` from the published `v0.6.0-preview` commit `257b421`; the failed NativeRecovery experiment remains isolated on `feature/0.6.1-coverage-audit` and is not part of this branch.
- Route remains PBZModLoader/Puerts plus the existing time-axis cue pipeline. This slice adds an observation-only, bounded per-actor/ability summary after raw events and compact evidence evict; it does not generate, delay or suppress a cue.
- The summary keeps warning, miss, withdrawal, native-frame and task counts, red/blue/black totals, the latest timing/identity fact, and explicit actor/ability/snapshot overflow.
- Replayed the preserved test.1 diagnostics through intentionally evicted detail lanes: all 124 emitted cues and all 5 `Luanshi_SpecialAttack_08_OnlyDodge` past-window records remained grouped under three actors. This proves evidence retention, not that those five were player-visible misses.
- The five `OnlyDodge` records are not a four-task sampling backlog: the preserved run reports `deferredTaskSamples=0`. Each task was first observed at timeline 1.25-1.288 seconds, after its 0.338-0.953 second warning window, with `discoverySource=current`. No safe production rule follows without evidence that this task represents the visible attack.
- Offline validation passed 653 checks, including 66 observation-store and 107 runtime integration checks. Source was labelled `0.6.1-dev.1` at this checkpoint; no installer, push, tag or publication was performed.

## 2026-11-15: scoped late-window dodge recovery

- Independent evidence: AutoPerfectDefense reads `ReceiveFrames.IsDodge` and `HitGameTime` as game-provided dodge-only/future-hit facts; its published notes also state that `_OnlyDodge` attacks must be dodged. The preserved PBZForewarn run separately shows five `Luanshi_SpecialAttack_08_OnlyDodge` warning nodes that arrived after their timeline window.
- Added `late-window-recovery.js`: an expired `past-window` node and a later incoming `IsDodge=true`, `IsHit=false` frame can produce one immediate cue only when actor, ability, activation, timeline, action and optional current task agree.
- Recovery uses the expired node's original red/blue/black colour. It rejects `ineligible-through-window`, non-future hits, less than 100 ms remaining, target-filter rejection and duplicate source/hit identities.
- Added 8 focused module checks plus runtime coverage for enabled and disabled paths. The cue enters the existing scheduler, so the glyph and Wwise path remain the same as ordinary cues.
- This is a late recovery, not a 350 ms guarantee. It still needs one normal-play in-game check to prove that a matching frame arrives with usable time remaining; no installer or publication is claimed yet.
- Full offline validation passes 663 checks: 109 runtime, 66 observation-store, 8 late-window-recovery and all existing suites. Source is labelled `0.6.1-dev.2`.

## 2026-11-14: trial.3 vertical slice

- Baseline: tested observe.6 installer, SHA256 BA90D93F6AC40AAE3D463B0C1977129BDFCDF148BB714B500E1BB4C943119450. Kept unchanged.
- Working branch: feature/trial2-generic-attacks; trial.2 changes remain uncommitted. No automatic push/tag/publication.
- Route: existing PBZModLoader/Puerts JS adapter + scheduler; existing UE4SS hooks and Wwise bank.
- Evidence: work/observe6-yuzan-20261114-1612. Two cast plans, one later Success task. AOE marker start 0.7387645244598389s; zero duration. Plans are not proof of rendered FX or successful control.
- Scope: BP_Monster_FemaleVessel_YuZan_C / GA_YuZan_Skill_03_C.Main / GAAction_WeaponParticleFrame_C / exact NS_YuZan_Warning_AOE_101 resource. Match class and numbered instances strictly.
- Decision: supplementary black cast danger cue, independent YuZanCastWarning and YuZanCastLeadMs settings. Preserve later standard Success black cue; explicitly document two stages. Do not predict that Success will execute.
- Inherit tag, hostility, range, lock, cancellation, world/pause and repeat-activation handling. Live-recheck cast scope/resource before cue. No game writes, asset loads, extra broad scans or new Lua hooks.
- Preserve point timing: no invented attack duration; glyph can end at cast marker. Separate lead override affects only cast events.
- Lab: no game launch, input automation, install or saves/config changes in this coding turn. User performs targeted combat test after offline validation.
- Implemented: scoped pure cast matcher; adapter opt-in with live tag/resource/scope checks; independent event lead in scheduler; source/phase/rule diagnostics and castCues counter. Standard cue pipeline and later Success warnings remain separate.
- Added tests: strict scope, sanitized real plan, per-event lead/rate, cast output, switch/config fallback, tags, changed resources/branch, cancellation/reactivation, two-stage output, lock/range/hostility, and observation-off operation. Full check count is in verification/summary.json.
- Self-review also corrected an inverted genericAttack constructor flag; the runtime already configures it explicitly and its timing-policy table remains empty. This does not enable generic cues.
- Packaging checklist: complete verifier, audio-free Source extraction and rebuild, installer and Source hash comparison, incremental diff vs tested observe.6. Results are delivered outside the installer. No new in-game validation is claimed.
- Existing audio concurrency / projectile lifecycle issues and completed-glyph rewind tails are outside this slice. Test requirements are actual timing/audibility, repetition, cancellation, and ordinary-cue regression.

## 2026-11-14: trial.4 followup policy

- Trial.3 test: 22/22 runtime files matched. 6 cast cues, six distinct activations, accepted audio, estimated leads 317.0–346.8 ms. One later Success cue followed 3.71 game seconds later and stopped the prior sound tail. User judged the later cue unnecessary after losing actionable opportunity.
- Scope: only YuZan actor / cast Main / exact AOE, then one L-or-R side Main, then Success of that same ability activation. No time-window or global cooldown. The handoffs are observed evidence, not engine parent/strike IDs.
- Delivery gate: a cast must actually produce a rendered HUD cue or accepted Wwise request before it can suppress a later presentation. Disabled, withdrawn, unrendered/unplayed or ambiguous chains retain the original standard black cue.
- Safety: preserve competing-task ambiguity, world/actor/activation/task identity, pause/reset/cancel cleanup, tag/lock/range/hostility filtering, BlackOn/GlyphOn/SoundOn semantics, and ordinary warning behavior. No game VFX/attack writes.
- Validation: full 649 offline checks; source-only extraction/rebuild yields identical installer and source ZIP hashes. No in-game test or publication in this turn.
