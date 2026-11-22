# Validation / 自检边界

## 2026-11-22: 0.7.0 publication scope

Release build `0.7.0` integrates feature commit `b6fd692` from `dev`. The release
cut changes version carriers and release documentation only; warning rules,
settings logic, defaults and audio source are unchanged from the accepted
`0.7.0-test.3` candidate. Fresh offline gate and package evidence belong to this
release's `verification/summary.json` and `PACKAGE_CHECK.json`; CI installers use
a synthetic cue and are structural artifacts, not distributable release audio.
Local release gate on 2026-11-22, offline session `v070-publication-20261122`:
Python 3.12.16, Node 24.22.3 and lupa 2.8; all 26 suites exit zero with checks
above zero, 915 total. Real-audio bank build and installer/source packaging pass;
the installer contains 25 runtime files plus README. The final gate is rerun
after this evidence entry so the packaged input hashes include the record.

In-game evidence remains sessions `mwrhcgk8-wkabhr6e` (test.3 font-size changes)
and `mwrdgjsf-pzf6ps76` (test.2 output switches), detailed below. The former
matches 25/25 installed runtime files to its accepted package, not to a newly
installed 0.7.0 asset. No new 0.7.0 installation, game launch or acoustic/screen
measurement is claimed by the publication process. The recovered observer write
failure and all coverage/retention limits below remain open. In particular,
all 16 live settings, full language/input coverage, full move coverage, hit-time
lead and absence of stutter remain unverified in game. GitHub asset download
and integrity checks alone do not constitute installation or smoke acceptance.

## 2026-11-22: test.3 acceptance for the 0.7.0 release candidate

Observed build `0.7.0-test.3`, session `mwrhcgk8-wkabhr6e`, diagnostic interval
14:52:51.532–15:07:12.323 +08:00 (860.791 seconds). User reports no perceived
abnormality. All 25 installed runtime hashes match the delivered test.3 package;
all 23 canonical values equal final runtime, and all 16 editable values equal
menu saved state. Preserved evidence: local analysis folder
`menu-test3-acceptance-20261122-151250`, 45 source files with stable-copy hashes,
FINAL_REPORT.md, SUMMARY.json and MANIFEST.json. Raw logs remain outside Git.

There are 17 complete saved/runtime/output triples, 15 with changes, all for
GlyphFontSize (120 through values 30–135 and back to 120). The other 15 editable
settings were not hot-changed in this session. No retained config read/refresh
error or restart-required result. Log notice-to-read 131–529 ms and update-return
0–6 ms are software timestamps, not measured physical output latency. Runtime:
four cues (black two/red one/blue one), one cancel, zero missed/errors; audio four
played, zero dropped/errors. Fallback/cast cues are zero, so this session does not
validate those scoped extra rules. Final native listener cleanup is zero pending.
Lua timeline/observer registrations are two/six with no registration/capture errors.
Hook/observation-setting toggles were not exercised here.

One observer JSON write reports Permission denied, then recovery 267 ms later;
writeFailures=1, recoveries=1, currentlyFailing=false. Cause remains unknown and
no persistent cue failure is demonstrated. Recent retains115/115; activity drops
477/642 and observation events evict802/913. A 12047ms tick gap immediately precedes
a resumed state; no combat hitch attribution follows. UE4SS startup detour warnings
precede Forewarn registration and have no established causal link. A stale startup
message about restart-only edits is corrected before integration; behavior is unchanged.

Acceptance supports this smoke session and logged font-size updates together with
the earlier output-switch session and offline lifecycle matrix. It does not establish
all16 game settings, keyboard/controller/language coverage, acoustic/screen output,
full move coverage, hit-time lead or absence of stutter. Unexercised behavior remains
unverified in game. The final test.3 offline candidate passed26 suites/915 checks;
source gate/package must run again after this record and message correction.

## 2026-11-22: combat feedback and complete localized setting help

Observed build: `0.7.0-test.2`. The user reports one actual fight, testing output
on/off combinations during play, with normal game and mod behavior. This is a
single user-observed session, not an acoustic/screen measurement, exhaustive
combination matrix, measured apply latency or general compatibility guarantee.
Preserved session: `mwrdgjsf-pzf6ps76`, cutoff 2026-11-22 13:10:57.030 +08:00.
Retained config-saved/output-update pairs: seven, comprising one startup notice
without changes and six actual changes (SoundOn four, GlyphOn two); UE4SS retains
six canonical writes. SoundVolume stayed 0.8. Final saved/runtime settings agree.
Every output update returned unverified, with no restart-required field. Runtime
stats: 13 cues (black 8/red 3/blue 2), two cancels, zero missed and errors. Six
conditions-not-met are editor-preview exclusions. Missed=0 is not move coverage.
There are 18 nonzero-PlayingID play calls (11 previews/seven combat), 11 disabled
drops (five previews/six combat), and 16 successful stop returns (10 new-cue/four
paused/two cancelled). Disabled drops occur in SoundOn=false intervals; one
combat play call follows re-enable. There is no retained sound-setting stop, so
stopping an already playing sound specifically by the switch is not proven.
Recent retains all 174 rows; activity retains 133/272 and observer events 115/545.
No retained owned sound/HUD failures are present, but evicted activity is incomplete.
The 16-file snapshot manifest hashes were independently checked. Evidence: local
`menu-combat-evidence-20261122-131846-204082` analysis folder, with FINAL_REPORT.md,
SUMMARY.json, MANIFEST.json and raw files. This is not a live watch or atomic
cross-file snapshot; logs remain outside Git.

New build: `0.7.0-test.3`, offline session `menu-help-offline-20261122`.
All 23 keyed settings, including seven reserved read-only rows, have English,
Simplified Chinese and Traditional Chinese labels/help. Text describes effects,
units/ranges where applicable, dependencies, application mode and read-only
limits. FontPath explicitly remains fixed and ignores manual replacement; generic
attack timing policies remain empty. The user additionally authorized every
editable setting live. All 16 editable values update after complete Menu notices;
seven reserved values remain startup-only. Existing scheduler/adapters are updated
without resetting fired/past history, layout rebuilds only the owned canvas, and
observation/Lua toggles have reversible lifecycles. Lua disables capture/publication
while registrations remain inert until terminal unload. JS and Lua independently
validate the same canonical JSON on bounded notifications; cross-runtime updates
are not atomic and no per-output receipt is displayed by third-party Menu.
Timing changes affect pending warnings, filters can withdraw active warnings,
and none of these changes promise replay of disabled, ended or consumed cues.
Expanded live settings are not covered by the test.2 game session above.

Descriptor regressions require complete label/help coverage, preserve reserved
row types and numeric bounds, and enforce the inspected Menu's 80/400 UTF-16-unit
label/help limits. The targeted descriptor suite passes four checks, including
exact runtime/descriptor editable-key agreement. Independent JS review reproduced
two lifecycle defects: disabling capture lost dirty observations, and failed native
listener retirement was discarded before re-enable. The corrections flush an
explicit disabled boundary (retryable at shutdown), retain the observer/cleanup
queue across suspend/resume, and block new listener bindings until cleanup drains.
Native cleanup may remain pending if the engine continues rejecting EndAction;
stale callbacks are guarded, and the final unload performs cleanup attempts.
Targeted checks pass under Python 3.12.16 / Node 24.22.3: runtime 142, native
observer 40, presentation 25, diagnostic store 13; Lua settings 157, timeline 57,
observation 68, entry 30. These include initially disabled enablement, repeated
toggles, queued unload, read/scheduling failure retry, reserved isolation and
retained evidence. This is owned-code validation, not execution of third-party
Menu. Full gate/package results below must correspond to the final source hashes.
Actual translated
layout, overflow, help visibility and language switching of test.3 remain
**unverified in game**. Full gate/package evidence is retained in the candidate's
external PACKAGE_CHECK.json and verification/summary.json.

## 2026-11-22: Menu save evidence and limited live-output candidate

Observed build: `0.7.0-test.1`, game session `mwrbqsef-e2fltjgn`. The user
confirmed Forewarn discovery under UE4SS Mods and changed two settings without
combat. A preserved canonical JSON has GlyphOn=false and SemanticFallback=false;
the final Bridge write is 12:21:21 +08:00. The later 12:23:10.896 diagnostic
snapshot still has both true, demonstrating saved-vs-startup behavior, not a
failed save. Snapshot manifest and raw evidence are outside Git under local
`menu-save-evidence-20261122-123041-990451` in the analysis evidence store.
JSON SHA-256: `265b6a233a930b6dfd10ea1a559bbc5625c9b5f585b3990283f33eba674278fe`.
This confirms file persistence in one session. Restart application, combat,
keyboard/controller coverage, audibility and visible glyph effects are not proven.

New candidate: `0.7.0-test.2`, offline session `menu-live-offline-20261122`.
Only SoundOn, SoundVolume and GlyphOn update from the canonical JSON after a
complete higher Changed notice from the existing Menu. The existing JS tick
checks that small event file at most once per 500 wall-clock milliseconds; JSON
is read only on a new complete notice, with failed reads retaining values and
retrying. This is explicit event-file polling. Lua, recognition, timing and glyph
layout remain startup snapshots. No config writer or second authority is added.

Targeted runtime regressions cover the existing timer/scheduler, restart-only
field isolation, paused updates, notice cadence/deduplication, partial/missing/
malformed save retry, retained persistence on isolated output failure, and no
old-cue replay or expired-glyph resurrection. Existing Wwise checks exercise stop,
private volume and consumed-cue behavior; a glyph regression exercises re-enable
with current vs expired windows. These execute owned code with mocked APIs only.
Diagnostic update-returned statuses do not prove audible/visible application;
Menu save UI does not receive per-output application receipts. Strict stale-edit
conflicts remain deferred. Live sound/glyph effects of test.2 are **unverified in
game**. The first integrated gate passed **26 suites / 796 checks**, all exit
zero with positive counts, plus JavaScript syntax and version carriers, under
Python 3.12.16 / Node 24.22.3 / lupa 2.8. Focused independent review then caught
contained HUD failures being recorded as ordinary returns; presentation now
exposes failure status. The corrected targeted suites pass 131 runtime and 24
presentation cases. Original audio is unchanged. A fresh integrated gate and
package readback are required for the corrected candidate; final counts and
archive hashes live in verification/summary.json and external PACKAGE_CHECK.json.

## 2026-11-22: optional Mods Menu restart-only test build

Build: `0.7.0-test.1`, branch `feat/mods-menu-settings`. Session ID:
`menu-preview-offline-20261122`; no game session, installed-mod changes or player
log inspection. This is a local preview, not a published release.

The user authorized the reduced first preview after static inspection of an
independent UE4SS Menu adapter: project-owned `.modsmenu.json`, one canonical
`PBZForewarnHooks.config.json` created by Lua, and startup-only settings reads.
Existing Saved TXT is imported once and left untouched as a downgrade backup;
JSON is never bundled or overwritten on startup. The full earlier Menu spec's
strict edit-baseline conflicts, original TXT path, three live output changes and
per-output apply results are deferred, not claimed passed. Menu and Bridge remain
optional external downloads; no third-party implementation is redistributed.

Targeted owned-code tests cover authoritative JSON precedence, legacy import,
write/readback/rename failures, malformed/unreadable JSON preservation, both Lua
startup orders, no Menu dependency, restart snapshots, default/bounds behavior,
reserved-key metadata and existing cue/cancel behavior. Tests use mocked engine
and file APIs; they do not execute the third-party Menu or prove discovery,
Bridge save interaction, controller navigation, translated layout, sound or glyph
output in game. The first integrated gate found a faulty regex in the new
descriptor test; the assertion was corrected to inspect the complete defaults
object. A second gate caught the descriptor suite's mixed unittest/JSON output
being counted as zero; the suite now emits the standard PASS lines without
weakening its assertions.

The initial integrated gate passed **26 suites / 780 checks**, all exit zero and
all with positive counts, on Python 3.12.16, Node 24.22.3 and lupa 2.8. Final
review then identified three more parser parity cases. The corrected targeted
suites pass 124 actual-JS runtime cases and 83 Lua settings checks. The packaged
source is subject to a fresh integrated gate, with final suite/check totals kept
in verification/summary.json and the external PACKAGE_CHECK.json. Review corrections
cover empty legacy EOF vs read errors, numeric boolean forms, deterministic
case-alias ordering, legacy inline comments, numeric-string grammar, a shared
64-KiB UTF-8 bound and lone-surrogate rejection. The actual Lua entry/helper/both
hooks are loaded together under functioning engine stubs with disabled/enabled
controls, rather than relying solely on missing APIs to disable hooks.
The final parity corrections decode BOM-marked UTF-16LE/BE legacy files, refuse
truncated/invalid legacy encoding without creating a default replacement, normalize
ECMAScript Unicode whitespace, and validate overwritten JSON members as well as
final values so duplicates cannot hide nested objects, infinities or lone surrogates.

Installer and Source ZIP packaging succeeds. The installer contains the descriptor
and helper, excludes a seeded live JSON and excludes third-party Menu/Bridge and
development tools. Archive integrity and exact per-file readback are checked by
the packager. Outputs and their final hashes are retained in the external local
candidate folder's PACKAGE_CHECK.json. Runtime discovery, actual Bridge saving,
keyboard/controller layout and sound/glyph behavior remain **unverified in game**.

## 2026-11-21: research absorption implementation boundary

Build: `0.6.1-dev.6`, feature branch based on `755398f`. Session: offline
implementation only; no PBZ session, installed-mod change or player-log reading.

A fresh pre-change gate on Python 3.12.16, Node 24.22.3 and `lupa==2.8`
passes all 23 suites / 684 checks and packaging. This is an offline baseline,
not a new game compatibility or audio/screen result. Global interpreter
defaults were not changed; the required Python was installed separately.

The optional Menu single-config integration gate has **not passed**. Native
registration selects another settings path, and the reviewed shared-hub
consumer does not establish publisher lifecycle or preserve an edit-time
revision for the required stale-field conflict handling. Its ordinary error
channel says "Not saved", so it cannot by itself describe verified persistence
followed by live-application failure. A possible public-toast workaround and
additional file capabilities remain unverified.

An isolated third-party-source execution request was denied by the permission
layer. Investigation remained static and was not rerouted through tests or
another executor. Per the specification's failure gate, no production Menu
adapter, second settings authority or partial live-apply path was added.
The local tracker gate report records the exact evidence and alternatives.
Nothing here proves all possible Menu integration strategies impossible.

Developer-support result: a project-owned skill and a real-source interface
checker were added without changing the runtime source. TypeScript 5.9.3 is
the single pinned development-only dependency, with a lockfile and no install
scripts; the small handwritten probe contract is not a game SDK. The checker
annotates the actual audio-environment probe in memory, emits no code and checks
that bounded interface surface, not the whole project in strict mode.

The isolated `adapter.path(cached, true)` mutation passes the unchanged
17 JS suites / 502 assertions and all 36 JS syntax checks, but the new checker
rejects it at the actual call with `TS2554` (one argument expected, two supplied).
A misspelled adapter member is also rejected, and an absent compiler exits
nonzero with the exact preparation command instead of skipping the check.
The original runtime source is unchanged after the mutation tests.

The integrated ordered gate passes **24 suites / 687 checks**, followed by
installer and Source ZIP packaging. An independent rebuild from only the
extracted Source ZIP, supplied audio and documented pinned development/test
dependencies also passes 24 suites / 687 checks. Both rebuilt archives have
identical extracted content and identical raw bytes under the same Python/zlib.
The Source ZIP includes checker inputs and the project skill, but no compiler
packages or audio. A review correction made excluded local tracker/domain
guides optional, with distributed-document fallbacks in the skill. A second
review correction adds checker preparation to the canonical gate, agent gateway
and PowerShell check wrapper; the development instructions match these entrypoints.

The player installer remains 24 files and byte-identical to the pre-change
local baseline: SHA-256
`f8b8eb3521515e38f064e5975be2097c054ff7a27e8764f74efdd96ba1e7de82`.
No development tools enter it. These are developer-tooling, source-rebuild and
archive assertions only: no new game run, audible result, screen measurement,
compatibility support, Menu implementation or public release is claimed.

## 0.6.1-dev.6

Diagnostic-only change; no cue, skip or cancellation decision was altered.
`condition-not-met` records now carry `eligibilityReason` (the scheduler's
tag-check reason), `lateBy`, `lateGrace` and `endedBeforeObservation`. The
purpose is to classify the six skipped `GA_GuiChai_Red_P1_GEx_01` records from
the dev.5 session on the next run instead of guessing.

`tools/analyze-run.py` now gates on the checkout's `VERSION` rather than a
hard-coded dev.5 string, and reports retained skip reasons. Its claims still
compare against the test.2 baseline.

**In-game runs on 2026-11-18** (dev.6 diagnostic build; all three sessions end
with the `analyze-run.py` verdict PASS for build identity, observation flush,
stall cadence, serialization peak, cue lead and zero errors):

| Session | Cues (red/blue/black) | Lead median (min–max) | `condition-not-met` | Skip reason | Errors |
|---|---|---:|---|---|---:|
| `mwlpnl9v-aqz64nw9` | 18 (11/6/1) | 331 ms (200–346) | 4 | `require-tags` ×4 | 0 |
| `mwlp07zq-xe9li6vx` | 9 (7/2/0) | 338 ms (322–342) | 5 | `require-tags` ×5 | 0 |
| `mwm40tnt-sv9ktdi1` | 214 (59/96/59) | 328 ms (179–350) | 20 | `require-tags` ×20 | 0 |

Every retained skip records `eligibilityReason=require-tags`; each names a tag
the node's asset requires, and the failing check is the adapter's
`HasAllMatchingGameplayTags` call. Three node families appear. The first two
sessions' nine skips are `GA_GuiChai_Red_P1_GEx_01_C` requiring `ddsd`. The
third session adds `GA_WuXuan_Skill_01_C` and `_Loop_C` requiring `btk`
(16 records) and `GA_GuWanYue_GEx_04_C` requiring
`CharacterState.AbilityState.Common.Hidden` (4 records). `ddsd` and `btk` are
debug-style values; the GuWanYue tag is a real character-state gate. The
recorded `lateBy` (82–130 ms against an 80 ms grace) is when the scheduler
noticed them past the window, not the cause of the skip. This resolves the six
dev.5 records cited above.

The third session is the first to separate the two `missed` shapes with the new
fields. Both are `past-window`. `GA_SpearMan_Ride_Skill_05_C` was noticed
418 ms after node start while the node was still running (end 1.443 s);
`GA_EMei_Sword_Special_04_C` was noticed 1080 ms after start, after the node
had already ended (end 1.975 s, observed 2.316 s), so it carries
`endedBeforeObservation=true`. Its two played-time `loopStopped` spans are
17.4 s at session start and 13.2 s directly after a BossRush autosave and a
`BindBellDelegate` UI rebind; no level-load trace exists, so that attribution
is adjacency, not proof.

Limits: three sessions on one machine and three bosses; log-level
classification only, no audio or screen measurement; `missed=0` means no queued
cue was missed, not full move coverage. The second session ended early when the
user's graphics change crashed the process; its counts cover the played span.
The third session's activity lane is byte-capped and retained 181 of 9834
records.

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
