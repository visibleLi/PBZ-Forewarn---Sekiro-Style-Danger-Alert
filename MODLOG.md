# Development journal

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
