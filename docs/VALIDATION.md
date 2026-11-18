# Validation / 自检边界

## 0.6.1-dev.5

Observation logging moved off the main loop's 5 s snapshot: it now flushes on its own
20 s cadence and writes nothing when the content is unchanged. Observation buffers are
halved (raw events 512 KiB to 256 KiB, compact evidence 256 KiB to 128 KiB), and no
correlation is recomputed when nothing new arrived. The unproven late-window recovery
stays removed.

The trigger was the user's live log: 116 tick gaps exactly 5 s apart, matching the
observation save period, with that file around 840 KB and its own serialization peak at
403 ms. That is correlation between our write cadence and the gaps, not proof that every
gap was caused by this module.

Offline validation passes 682 checks across 23 suites.

**In-game run on 2026-11-17**, session `mwkibq6i-e0av2xfn`. Two saved captures
from this same run have seven passing checks in their saved analysis reports.
They are not independent test runs:

| Diagnostics capture (UTC+08:00) | Saved directory | Retained tick gaps | Observation writes |
|---|---|---:|---:|
| 2026-11-17 18:10:41.455 (`at=1794910241455`) | `E:/dev/pbz-runs/mwkibq6i-e0av2xfn/` | 50 | 59 |
| 2026-11-17 18:19:48.343 (`at=1794910788343`) | `E:/dev/pbz-forewarn/runs/mwkibq6i-e0av2xfn/` | 53 | 61 |

The earlier capture is the approximately 24.5-minute span reviewed in `FINDINGS.md`;
the later capture spans approximately 34 minutes. Counts in this table come from
each diagnostics snapshot; the observation JSON has its own capture timestamp.
Neither snapshot is overwritten or substituted for the other. Shared metrics:

| Claim | test.2 | dev.5 |
|---|---|---|
| tick gaps 4.5–6.5 s apart | 96.6 % | **0.0 %** |
| peak observation serialize | 403 ms | **7 ms** |
| median cue lead | 285 ms | **334 ms** |
| cues | 26 | 37 (red 24, blue 7, black 6) |
| runtime errors | 0 | 0 |

The 37 cues split into 29 standard, 5 `semantic-fallback` (Acolyte Yanru) and 3
`cast-warning` (No. 3 Musician Puppet), so both 0.6 additions fired in a real session.
Lead ranged 118–350 ms over those 37 retained cues. The 334 ms median is a
game-clock estimate relative to the warning node, not a screen/audio measurement
or a guaranteed lead for every attack.

This is one session on one machine, not a distribution. In the earlier capture,
manual review correlated seven long gaps with world/player resets and one with
a nearby pause. Those associations do not establish the cause of every gap.
The analyzer's duration categories do not prove that gaps of 2000 ms or more are
loads/menus, and a 7 ms serialization peak cannot exclude all other causes of a
long game-thread delay. Its 1528 ms maximum refers only to the 250–2000 ms category.

`tools/analyze-run.py` answers both from the logs the mod already writes, while the game
is still running:

```text
python tools/analyze-run.py                  # reads %LOCALAPPDATA%\ProjectPBZ\Saved
python tools/analyze-run.py --save runs      # also keep the logs and the report
python tools/analyze-run.py --json
```

The mod rewrites `pbzforewarn_diagnostics.json` and `pbzforewarn_observations.json` under
the same names every session, so starting a second run erases the first. `--save DIR`
copies both logs plus `analysis.txt` and `analysis.json` into `DIR/<session>/`; without it
a verdict only describes whatever session is currently on disk.

It prints one verdict per claim — `PASS`, `PARTIAL`, `FAIL` or `UNVERIFIED` — and exits
non-zero on any `FAIL`. `UNVERIFIED` means the session did not exercise the claim (no
combat, no usable timestamps), which is not a failure. The comparison point is the
user's own test.2 session `mwhygcbb-hczgj5hb`: 26 cues, median lead 285 ms, 351 tick-gap
records of which 96.6 % sat 4.5–6.5 s apart, peak observation serialize 403 ms. Those are
one session's figures, not a distribution.

Two of its checks deliberately refuse to guess. A log whose tick-gap timestamps are
absent or repeated reports `UNVERIFIED` rather than scoring 0 % periodic, because 0 %
would read as "the cadence is gone" when the clock simply was not recorded. A session
with no cues reports `UNVERIFIED` for lead rather than passing.

It also separates gap kinds instead of summing them. Gaps overlapping a recorded pause
are excluded, because resuming makes the first tick report the whole menu as one gap.
Remaining gaps are reported in duration bands (250–2000 ms and 2000 ms and up).
The label `loop-stopped` names the latter bucket; it is not a diagnosis of a
level load, menu, minimised window or mod-independent cause. Retain the long-gap
records and their context rather than treating the label as evidence of safety.

## 0.6.1-dev.4

Summary schema 2 enforces the 64 KiB actors-array JSON budget at record time,
caches actor headers and ability rows, and assembles snapshots without reserializing
all actors to repeatedly trim the output. Ability detail is retired before actor
counts; session counts and explicit eviction/unattributed counters remain available.
Colors count emitted warning-cue records only. Detail loss still means history is
partial. Owner/role candidates cannot impersonate a missing execution actor.

Offline comparison used 352 distinct retained records from test.2, not all 6811
original events. Old summary output retained 46 of 53 cues; revised output retains
53 and both boss phases. Synthetic pressure uses 24 actors x 64 abilities with long
paths. Full observation snapshot plus JSON serialization averaged 11.44 -> 4.46 ms
for retained input and 181.94 -> 2.01 ms for pressure on Node 22.15 / this host.
These are local benchmark results, not measured in-game frame times or proof that
every logged tick-gap was caused by this module.

The unproven late-window recovery has been removed. A stale `LateDodgeRecovery`
line in an existing user file is unknown and ignored. No installed game files or
historical ZIPs were modified for this source checkpoint.

## 0.6.1-test.2

Development-only source based on the published `v0.6.0-preview` commit `257b421`.
It does not include the failed NativeRecovery path from `0.6.1-test.1`.
The bounded encounter summary keeps per-actor and per-ability totals after detailed
history is evicted, including cue colours, missed windows, withdrawals, native
observations, latest timing/identity facts and explicit overflow.

The new late-window recovery is separate and narrowly gated. It requires all of:
an ordinary warning already recorded as `past-window`; a later incoming frame with
`IsDodge=true`, `IsHit=false`, finite game/hit times and at least 100 ms remaining;
and exact agreement of actor, ability, activation, timeline and action. It never
creates a cue from a BOSS name, ability suffix, missing activation or unrelated task.
The selected target filter still applies and one source/hit can emit once.

The complete offline suite passes 663 checks, including 109 runtime integration,
66 observation-store and 8 late-window-recovery checks. The preserved-diagnostic replay
is rerun after this feature.
Replaying the preserved test.1 diagnostics through
forced detail eviction retained all 124 emitted cues and five `OnlyDodge` past-window
records across three actors. This proves summary retention only. The five records are
not proof that the recovery frame appears before their hits. No installer or in-game
validation is claimed by the offline suite.

## 0.6.0-preview

In-game candidate basis: tested trial.4, Steam build 26367565, Windows x64,
PBZModLoader 2.1.0, PBZ-specific UE4SS v3.0.1-1195-g1ceefac8.
The tested installer had 23 runtime files matching trial.4. The session emitted
24 cues (17 black, 7 red), all with accepted non-zero Wwise PlayingIDs, no audio
or main-runtime errors. Four YuZan cast cues fired; two complete cast -> side Main
-> same-activation Success chains suppressed one later extra presentation each,
while two casts without an observed Success chain did not suppress anything.
Five scoped QiShu_Huo red cues also fired and ordinary warnings remained active.

This is a targeted functional test, not proof of all-boss coverage or audibility.
The close-out uses observed stage handoffs, not engine parent/strike IDs or proof of
control. YuCong's very short black marker still fires around its original node;
the public version must not claim that the short-entry problem is fixed.
YuZan Wuli_Skill_04 conditions-not-met samples were retained, not bypassed.
No broad all-spell classification is enabled. The generic timing policy remains empty.

Release validation covers source inventory, matching JS/Lua/package versions,
reproducible installer and audio-free Source ZIPs, no bundled audio/game assets,
installed-layout instructions and explicit rollback. The installer's development
observation remains opt-in/compact; no collector executable or upload path is shipped.

## Historical: 0.6.0-trial.4

Keeps the scoped YuZan cast cue from trial.3. It suppresses the later extra black
presentation only after an actually delivered cast cue, one observed side Main, and
the same-activation Success. This is an observed stage handoff, not an engine parent,
control proof or per-strike ID. Missing/ambiguous stages, delivery failure, cancellation,
activation/world changes and unrelated cues retain the original black warning.
The game's own VFX and attacks are unchanged. No global Success/black suppression.
Offline tests cover L/R, strict stage order, gaps, competing tasks, delivery, fallback,
lock/range/disabled switches, and standard-path regressions. No in-game claim.

## Historical: 0.6.0-trial.3

Adds a supplementary black warning for one exact YuZan cast scope, using the AOE
resource plan as its reference. YuZanCastLeadMs is separate from the original LeadMs.
The scoped marker is a point, not a control/impact measurement or guaranteed Success.
Original warnings and the later Success cue remain intact. No all-spell classification.

Offline checks cover strict scope, tag/lock/range/hostility filtering, live resource
revalidation, repeated activations, cancellation, source provenance, separate lead,
the unchanged ordinary-warning path, and two-stage cast/Success output.
The cast fixture was sanitized from observe.6; ActivationRequirements were not captured
in the original candidate log and are checked live. No permissive fallback is used.
No new in-game validation, actual sound audibility, FPS or all-move coverage is claimed.
Suite counts and input hashes are generated by verification/summary.json.

## 0.6.0-trial.2-observe.6

This candidate retains observe.5's cue-disabled spell evidence and deduplicates each
spell candidate by task, resource and phase. It does not change warning decisions.

## 0.6.0-trial.2-observe.5

This candidate is observe.4 plus read-only evidence for timeline branch changes and two YuZan spell-warning resources.
Neither addition schedules a cue. The YuZan evidence requires both the exact effect path and the expected ability.
`Main -> Success` is retained with `branchConfirmed=false`; it does not prove that a control or hit succeeded.

## 0.6.0-trial.2-observe.4

This candidate builds on observe-bounded.2 and retains the 0.5 scheduler, glyph and Wwise audio modules.
Its new gameplay-facing behaviour is limited to two QiShu_Huo semantic red warnings.
The sanitized captured-plan fixture preserves the actual type fields, empty tag requirements and authored times:

| Ability | Type | Plan start | Plan end |
|---|---|---:|---:|
| GA_Qishu_Huo_RoundSkill_FireRing_C | RedEye=3 | 0.8014639616 | 1.3372839689 |
| GA_Qishu_Huo_SkillAttack_F_AssaultEnd_C | RedEye=3 | 3.8763465881 | 5.2415456772 |

These are plan facts, not measured flash times, impact times or certified executions.
The build label 26367565 records the evidence environment; it is not an enforced runtime build check.

Offline checks cover strict object/class matching, type conflicts and live revalidation, tag/role filtering,
standard-node precedence, source changes without duplicate cues, GUID duplicate handling, repeated activations,
normal warnings and mocked audio delivery, bounded JS/Lua observations, Lua unloading, audio bank integrity,
complete source inventory, validation-gate rejection and reproducible ZIP metadata.
The exact current suite/check counts and input hashes are in generated `verification/summary.json`.
They do not certify engine ABI, measured sound output, combat timing, coverage or performance.

The standalone source check extracts the Source ZIP to a new directory, supplies audio and test dependencies,
runs the full verifier, and rebuilds the archives. Audio and generated banks are excluded from source.
The installer has no tests, logs, SDK dump, Node/Python executable or data-collection script.

**中文：**当前完成的是离线代码与构建检查；新两招是否提示得准、会不会误报/双响、
是否影响其他招式、性能和退出仍须实机验证。`SemanticFallback=0`可关闭新增规则，
但观察模块仍保留；需要完整恢复0.5时应重新安装0.5发布包。

## Historical 0.5 evidence

The 0.5 release.2 baseline was tested on Windows/Steam build26367565 with PBZModLoader 2.1.0
and PBZ-specific UE4SS v3.0.1-1195-g1ceefac8. Four bosses produced 59 distinct automatic cues
(13 red, 8 blue, 38 black), plus four previews. No JS runtime errors or audio drops were recorded.
PlayingIDs indicate accepted audio requests, not independent acoustic measurements.
Some short warnings were late; one Lua write-open failure recovered. Whole-game coverage was never claimed.
This history validates the baseline only and cannot be assigned to the new trial automatically.

The local trial retains the same trimmed BNK SHA256:
`f710b3bedad502aa2234c887da3d16630faefad13e61289ddf4b7a4e86282953`.
Source contains no WAV/BNK/WEM. Full coverage, WeGame, other builds and every mod combination are unvalidated.
