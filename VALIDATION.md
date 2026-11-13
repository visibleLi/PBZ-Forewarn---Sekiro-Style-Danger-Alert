# Validation / 自检边界

## 0.6.0-trial.1

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
