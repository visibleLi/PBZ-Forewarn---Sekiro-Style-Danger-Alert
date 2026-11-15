# Development journal

## 2026-11-15: dev.3 summary serialization repair

- Read C:/Users/lmany/.codex/AGENTS.md plus mod-any-game and reverse-engineering. Scope is the explicitly agreed summary overhead/data-loss repair and disabling unproven recovery by default; no BOSS rule or game setting change.
- Root cause in our summary: snapshot repeatedly serialized every retained actor after each whole-actor output eviction, left all data in memory, and counted the same omitted actors again on every snapshot. Actor capacity eviction also inspected wrapper.score rather than wrapper.value.score. These defects were reproduced offline.
- Schema 2 bounds data at record time using cached row byte counts. Skills lose detail before whole actors; actor and session counts remain separate from detail completeness. Snapshots perform no JSON.stringify; the final observation file is serialized once by the existing flush path. Fixed last warning evidence being replaced by passive noise, invalid owner/role attribution, and colors including non-cue observations.
- Kept private benchmark files outside the source checkout under outputs/PBZForewarn-摘要性能审计. Partial replay of 352 retained test.2 rows: old output kept 46/53 cues, new output keeps 53/53 and both GuiChai phases. Synthetic pressure is labelled 24 actors x 64 abilities, not a reconstruction of the evicted session.
- Complete observation snapshot/serialization mean: retained replay 11.44 -> 4.46 ms; pressure 181.94 -> 2.01 ms. Recording work is modestly increased and spread across incoming records; captured complete-record p99 was 0.77 ms, max 1.53 ms on the local benchmark. This does not certify Unreal performance or all tick-gap causality.
- LateDodgeRecovery is now false in defaults and generated configuration. An old explicit 1 remains opt-in; the installed user config is not changed. Standard cue, glyph, Wwise, cast rules and Lua gameplay hooks remain behaviorally unchanged.
- Development version is 0.6.1-dev.3, separate from immutable test.2 archives. Full offline validation passes 669 checks; an independent Source ZIP rebuild produced byte-identical installer and source archives (installer SHA256 `d01d15912c12b1ca05f2630fb793be492c53f70bdccde66bd1f76d5adde314a8`). It is a performance test candidate, not a publication.

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
