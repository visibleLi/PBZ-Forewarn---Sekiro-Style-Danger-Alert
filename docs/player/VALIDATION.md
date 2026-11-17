# Validation / 实测与离线验证

Public version `0.5`; runtime `0.5.0-release.2`; public test build.

## In-game evidence

On2026-11-11 the user removed Forewarn/AlertCue deployment and their Saved configuration/runtime files, ran the game without a warning mod, then installed the exact release.2 package with PBZ Mod Manager and tested four bosses. This is a clean first-install test with the loaders and other mods retained; it is not an otherwise unmodified game or a manual-install game run.

The15 deployed runtime files matched the tested release.2 archive by hash. Four actors produced59 distinct automatic cues (13 red,8 blue,38 black). Each submitted one audio request;4 previews made63 total. There were no audio drops, duplicate audio IDs or JS runtime errors. Accepted PlayingIDs alone are not acoustic output measurements; this log audit complements the user's audible/visual testing.

All22 actually used resource detail records remained available, with399 essential events retained and no essential-history eviction. Lua had one open failure followed by recovery about55ms later; failure/recovery counters preserved the incident. It would be incorrect to describe the entire Lua chain as error-free or all sharing conflicts as fixed.

## Timing and coverage limitations

- Nine cues were not early relative to recorded original warning nodes: eight YuCong black cues were roughly14–25ms late because the node lies only24.84ms after task start; one ChiLian black cue was roughly38ms late.
- One past-window record belongs to a new task observed after the node; the previous task of the same ability had already cued that resource. Start-offset parameters were not logged, so this is neither certified as a separate missed attack nor dismissed as harmless.
- Sixteen unmet conditions include four editor-preview nodes and twelve IgnoreTags cases. The latter need comparison against the game's actual node Begin events; eligibility metadata is not an independent record of final execution.
- Lead values are estimates from node time and observed rate, not measured screen/audio timing or guaranteed lead before impact.
- Confirmed-lock-only mode, all bosses, other builds, WeGame and all mod combinations remain unverified.

## Offline validation

349 checks passed across scheduler, adapter, presentation, runtime integration, bounded diagnostic retention, Wwise audio, binary bank, environment probe, target filter, attack probe and Lua hooks/entry. All JavaScript syntax checks passed. The independent bank parser and media decoder confirmed the bank and80ms prefix trim, with remaining PCM identical to the original suffix.

Independent folder fixtures verified the installation layout and preservation of unrelated files/settings. They do not substitute for an actual manual-install game run. The player package is checked to contain no loader DLL, executable, collector CMD/BAT/PowerShell script, tests, raw personal logs or source WAV.

## Tested environment

Windows x64 / Steam build26367565; KintaroModding PBZModLoader2.1.0; PBZ-specific UE4SS v3.0.1-1195-g1ceefac8. The original full WAV is preserved in the optional source archive. The installed trimmed BNK is unchanged from fix7:

`f710b3bedad502aa2234c887da3d16630faefad13e61289ddf4b7a4e86282953`

中文：本版已完成首次安装与四BOSS实测，不能继续写“候选尚未实机测试”；同样不能扩大成“所有招式都提前／全部条件正确／所有平台兼容”。日志显示的晚提示、条件分支、续播记录及Lua短暂故障均保留在说明中。发布素材来源见CREDITS.md。
