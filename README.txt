PBZForewarn 0.9.1 — Sekiro-Style Danger Alert
只狼风格“危”预警

English
=======

WHAT'S NEW IN 0.9.1 — DIAGNOSTIC RECORDING SWITCH
- Menu adds one Diagnostic recording switch (nine controls total). It defaults
  off on new installs; an existing saved value is preserved and backed up on
  upgrade. No third-party Menu patch is needed.
- Turning it off stops periodic diagnostic, resource catalog and observation
  JSON writes. Active observation may save one last snapshot. Warning sound,
  glyphs and discovery hooks keep their own settings. Attack recognition is
  unchanged from 0.9.0.
- Offline checks pass for the switch, migration, and warning output. In-game
  Menu operation and frame-time impact are unverified in this build.

Generic cues use LeadMs and authored preparation coordinates, not measured impact
or original effect time. Grab risk does not guarantee a grab. An earlier dev.5
session recorded three complete first-only grab cycles; the latest test.2 session
did not exercise that chain. Short/late black warnings remain a known limit.
These are software-log observations, not acoustic/screen measurements or
all-enemy/all-move coverage.

All ordinary warnings from 0.5 remain. Not every move is covered.

WHAT IT DOES
Shows the Sekiro-style “危” warning and plays a warning sound for supported red,
blue and black attacks in Phantom Blade Zero. Attack timing and parry windows
are unchanged.

The warning appears earlier than the original warning effect. The color of the
glyph follows the supported attack type. The original flash is left in place.

HOW IT WORKS
The mod reads the warning and action information the game already exposes and
schedules its own warning ahead of the original warning node. It does not
replace attack animations, damage, timing or parry rules.

REQUIREMENTS
Both PBZModLoader and UE4SS are required.
- PBZModLoader: https://www.nexusmods.com/phantombladezero/mods/113
- UE4SS for Phantom Blade Zero: https://www.nexusmods.com/phantombladezero/mods/5
- Recommended Phantom Blade Zero - Mod Manager:
  https://www.nexusmods.com/phantombladezero/mods/2

INSTALL
Mod Manager: close the game, install both requirements, disable older Forewarn,
import PBZForewarn-0.9.1.zip, and enable all of its parts.

Manual: with both requirements already installed, merge ProjectPBZ and platform
into the game root. Keep every file and fully restart.

Press Alt+F9 to preview the warning sound.

SETTINGS
The nine Menu controls have English, Simplified and Traditional Chinese labels
and help. Settings file (relative to game root):
platform\steam\ue4ss\Mods\PBZForewarnHooks\PBZForewarnHooks.config.json

On first start, Forewarn imports the old Saved\PBZForewarn.txt if no JSON exists.
The diagnostic switch is stored as top-level Diagnostics. Upgrading an existing
0.9.0 JSON preserves the saved choice and backs up the original before moving the
setting out of _internal. The diagnostic backup ends in .pre-diagnostics-menu.bak.
If the older generic upgrade is also needed, both changes use the existing
.pre-generic-default.bak. Keep these backups. The numeric marker
_extra.PBZForewarnGenericAttackEpoch=1 keeps later _internal.GenericAttack=false
from being enabled again on restart. No switch restores the deleted boss rules.

Optional in-game settings: install Mods Menu (Nexus mod 149) and its UE4SS Bridge.
Open Settings > Mods Menu > UE4SS Mods > Forewarn after the first launch. Neither
Menu nor Bridge is bundled or modified. Controls apply after a successful Menu
save, normally within about 0.5 s; game stalls may delay this. Menu saves keep
_internal and _extra. Do not edit JSON concurrently with Menu saves.

Timing changes affect pending warnings without replaying consumed cues. Disabling
sound stops this mod's audio; enabling it does not replay old warnings. Glyph
changes affect only the mod's canvas and still-active warning windows.
Without Menu, edit JSON while the game is closed. Internal settings are under
_internal; use true/false or numbers and fully restart after manual edits. Back up
the config before uninstalling. To downgrade, exit and restore the pre-migration
JSON backup for versions that expect flat JSON. The reserved _internal and _extra
fields must be JSON objects; an older custom scalar with either name is not
automatically converted. Invalid/unreadable configuration is reported, left
unchanged on disk and uses defaults rather than importing stale TXT. No new
acoustic/screen result is implied.

Warning timing and targets
- LeadMs=350 — how early the warning appears before the original warning node.
  Range: 0-1000 ms.
- RangeCm=3500 — maximum distance at which eligible enemies are detected.
  Range: 500-10000 cm.
- OnlyLockedTarget=0 — 0 = also warn in unlocked play; 1 = only the confirmed
  locked target.

Appearance and sound
- GlyphOn=1 — show the “危” glyph. 1 = on, 0 = off.
- GlyphFontSize=120 — glyph size. Range: 30-240.
- GlyphY=0.32 — vertical glyph position. Range: 0.1-0.8.
- SoundOn=1 — play the warning sound. 1 = on, 0 = off.
- SoundVolume=0.8 — this mod's volume. Range: 0-2.

Diagnostic recording
- Diagnostics=false — Enable only when collecting troubleshooting data. When
  off, the periodic diagnostic JSON files stop updating; basic loader messages
  and the separate discovery bridge are not controlled by this switch.

Internal features (not Menu controls)
BlackOn, GenericAttack, ObserveAttacks and Hooks remain under _internal. An
explicit ObserveAttacks=false still disables combat observation even with
Diagnostics on. The obsolete per-boss configuration is no longer read.

NOTES
- 350 ms is a target, not a guarantee for every move. Very short attacks may
  receive little lead or a slightly late reminder.
- Interrupted or switched attacks withdraw their warning, sometimes producing a
  brief flash.
- No auto-parry or auto-counter.
- Do not use another extra-warning mod at the same time.
- Tested on Windows / Steam build 26367565. WeGame is not validated.

FEEDBACK
If you encounter any missing warnings or bugs, please let me know in the POSTS
tab. Your feedback helps improve the mod! Don't forget to Endorse if you like it.

UNINSTALL
Remove the mod through Mod Manager. If you installed manually, delete only:
  ProjectPBZ\PBZModLoader\mods\PBZForewarn
  ProjectPBZ\Content\PBZForewarn
  platform\steam\ue4ss\Mods\PBZForewarnHooks
Keep the shared loaders and game saves.

CREDITS
The “危” style and sound are inspired by Sekiro: Shadows Die Twice
(FromSoftware). The glyph is drawn with PBZ's in-game font.
Thanks to the PBZModLoader, UE4SS and Mod Manager authors.
AI assisted research, coding and debugging.


中文
====

0.9.1 更新内容 — 诊断记录开关
- 菜单新增一个「诊断记录」开关（共 9 项）。新安装默认关闭；已有保存值在升级时
  备份原文件并保留。不需要第三方菜单补丁。
- 关闭后停止 JS 诊断、资源目录、战斗观察及 Lua 观察快照的定时写盘；若正在观察，
  可能保存一次最后快照。危音效、危字和发现钩子仍按各自设置运行，招式识别与 0.9.0 相同。
- 开关、迁移和预警输出已通过离线检查；本版尚未实机验收菜单操作或帧时间变化。

通用提示使用LeadMs和作者准备坐标，不是实测命中或原特效时间；抓取风险不保证实际抓取。
此前dev.5一场记录曾有三轮完整首次抓取收口，最新test.2场次未覆盖该链。
部分短起手黑危仍可能偏晚。这些是软件日志观察，不是声学、屏幕或全敌人/全招测量。

0.5 的普通提示全部保留，但不是全招覆盖。

效果
为支持的红、蓝、黑光招式显示只狼风格“危”并播放危音效。
攻击时序和招架窗口不变。

危字会比游戏原预警效果更早出现，颜色跟随支持的攻击类型。
游戏原提示光保留。

实现方式
读取游戏已经提供的预警和动作信息，在原生预警节点之前安排本 MOD 的提示。
不替换攻击动画、伤害、时序或招架规则。

必装前置
PBZModLoader 和 UE4SS 都必须安装。
- PBZModLoader：https://www.nexusmods.com/phantombladezero/mods/113
- UE4SS for Phantom Blade Zero：
  https://www.nexusmods.com/phantombladezero/mods/5
- 推荐使用 Phantom Blade Zero - Mod Manager：
  https://www.nexusmods.com/phantombladezero/mods/2

安装
管理器：完全退出游戏，装好两个前置，停用旧 Forewarn，导入
PBZForewarn-0.9.1.zip，并把包内全部部分启用。

手动：前置已装好的情况下，把包内 ProjectPBZ 和 platform 合并到游戏根目录。
保留全部文件并完全重启。

按 Alt+F9 试听危音效。

设置
菜单9项设置提供英文、简中、繁中名称与说明。
配置位置（相对游戏根目录）：
platform\steam\ue4ss\Mods\PBZForewarnHooks\PBZForewarnHooks.config.json

没有 JSON 时，首次启动会导入旧的 Saved\PBZForewarn.txt。诊断开关保存在 JSON 顶层的
Diagnostics。升级已有的 0.9.0 配置时，会保留原来的开关状态，备份原文件后把该值移出
_internal。诊断迁移的备份以 .pre-diagnostics-menu.bak 结尾；若同时需要旧版通用升级，
两项改动共用 .pre-generic-default.bak。请保留备份。带数字标记
_extra.PBZForewarnGenericAttackEpoch=1 的配置，手动设为 _internal.GenericAttack=false
后不会在重启时再被开启。关闭也不能恢复已删除的首领特判。

可选菜单：安装 Mods Menu（Nexus mod 149）及其 UE4SS Bridge，首次启动后进入
设置 > 模组菜单 > UE4SS 模组 > Forewarn。本包不附带或修改菜单/Bridge。
菜单保存成功后通常约半秒内应用，游戏停顿可能延迟；保存会保留 _internal 和 _extra。
不要同时用菜单和编辑器修改JSON。提前量更新不补播已消费提示；关声停止本MOD音效，
开声不补播旧危；危字变化只作用于本MOD显示层和仍有效的提示窗口。

未装菜单时，退出游戏后可手改JSON。内部设置在_internal中，开关用true/false，数值用数字，
手改后完全重启。卸载前备份配置；降级到读取平铺JSON的旧版时，退出后恢复迁移前备份。
保留字段_internal与_extra必须是JSON对象；旧自定义同名数值不自动转换。非法或不可读配置会报错，
原文件保持不变并使用默认值，不转读旧TXT。菜单保存成功不等于声画结果验证。

提示时间与目标
- LeadMs=350 — 相对游戏原预警节点的提前量，范围 0-1000ms。
- RangeCm=3500 — 可识别敌人的最大距离，范围 500-10000cm。
- OnlyLockedTarget=0 — 0 为无锁也提示；1 为只提示确认锁定的目标。

显示与声音
- GlyphOn=1 — 显示危字，1 开启，0 关闭。
- GlyphFontSize=120 — 危字大小，范围 30-240。
- GlyphY=0.32 — 危字垂直位置，范围 0.1-0.8。
- SoundOn=1 — 播放危音效，1 开启，0 关闭。
- SoundVolume=0.8 — 本 MOD 音量，范围 0-2。

诊断记录
- Diagnostics=false — 仅在排查问题时开启。关闭后相关诊断 JSON 不再定时更新；
  加载器日志和独立的预警发现桥不受这个开关控制。

内部功能（不在菜单展示）
BlackOn、GenericAttack、ObserveAttacks 和 Hooks 仍在 _internal。若显式设置
ObserveAttacks=false，即使打开 Diagnostics 也不会采集战斗观察记录。
已退役的逐首领设置不再读取。

注意
- 350ms 是目标值，不保证每招都够早。短起手可能提前不足，极短招式可能稍晚。
- BOSS 被打断或切换动作后会撤回提示，可能出现短闪。
- 不包含自动招架或自动反击。
- 请勿同时使用其他额外预警 MOD。
- 已测 Windows/Steam build 26367565，WeGame 未验证。

反馈
如果遇到未生效的招式或发现 Bug，请在 POSTS 区留言告诉我！
如果觉得好用，别忘了点赞（Endorse）支持一下。

卸载
管理器用户直接移除 MOD。手动安装的用户只删除：
  ProjectPBZ\PBZModLoader\mods\PBZForewarn
  ProjectPBZ\Content\PBZForewarn
  platform\steam\ue4ss\Mods\PBZForewarnHooks
保留共用加载器和存档。

致谢
“危”风格与音效参考《只狼：影逝二度》（FromSoftware），
危字使用 PBZ 游戏内字体绘制。
感谢 PBZModLoader、UE4SS 和 Mod Manager 作者。
AI 辅助研究、编码与调试。
