PBZForewarn 0.8.0 — Sekiro-Style Danger Alert
只狼风格“危”预警

English
=======

WHAT'S NEW IN 0.8 — 0.8.0
- Keeps the optional live Menu and shared JSON settings introduced in 0.7.
- Replaces the two boss-scoped routes when GenericAttack is enabled, using shared
  bullet warning resources and grab-risk structure rather than boss names.
- Removes the three individual boss controls from Menu; GenericAttack remains
  editable and default off. Turn it off for the prior compatibility routes.
- Retains ordinary warning recognition across diagnostic-free recompiles, so an
  already delivered grab preparation can suppress its observed later black cue.

The dev.5 gameplay session recorded three complete grab cycles with one accepted
initial warning and no later Main/Success warning output. Independent warnings
also remained available in that sample. This is limited gameplay evidence, not
all-enemy/all-move coverage or an acoustic/screen timing measurement.

Generic cues use LeadMs and authored preparation coordinates, not measured impact
or original effect time. Grab risk does not guarantee a grab. A unique observed
same-actor/payload handoff can suppress later preparation and ordinary black cues;
ended-stage evidence expires after a 1 s observation gap. A new continuation
must follow its ability's ended Main into Success; other branches keep warnings.
Missing initial delivery or ambiguous stages keep the fallback. This is a
presentation association, not proven native attack identity. No native-crash
repair is claimed.

WHAT'S NEW IN 0.7
- Optional Mods Menu settings with English, Simplified and Traditional Chinese help.
- One JSON config imports the old TXT once and keeps it as a backup.
- 16 editable settings apply after a successful Menu save; seven rows stay read only.
- Includes the existing Acolyte Yanru and No. 3 Musician Puppet extra warnings.

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
import PBZForewarn-0.8.0.zip, and enable all of its parts.

Manual: with both requirements already installed, merge ProjectPBZ and platform
into the game root. Keep every file and fully restart.

Press Alt+F9 to preview the warning sound.

SETTINGS
0.8.0 includes English, Simplified Chinese and Traditional Chinese labels
and help for every setting, including read-only rows. Test sessions confirmed
saved output-switch changes and font-size updates in logs; the user reported normal
operation. Other settings have offline checks but were not all changed in game.
These observations are not acoustic/screen measurements or full language/input coverage.
Settings file (relative to game root):
platform\steam\ue4ss\Mods\PBZForewarnHooks\PBZForewarnHooks.config.json
On first launch, existing Saved\PBZForewarn.txt values are imported once. The old
TXT is left untouched as a backup; once JSON exists, editing TXT has no effect.
For manual edits, use JSON true/false for switches and numbers for numeric values.
All 14 editable settings apply after a successful Menu save, normally within
about 0.5 s (game stalls may delay this). The six reserved rows remain read only.
Timing changes affect pending warnings without replaying consumed cues. Eligibility
changes can withdraw current warnings. Glyph layout rebuilds only this mod's canvas.
Disabling Lua hooks pauses capture/publication; inert registrations remain until
final unload. Game-thread scheduling may delay Lua transitions.
Disabling sound stops Forewarn's audio; enabling it does not replay old warnings.
Enabling glyphs can show only a warning window that is still active.

Optional in-game settings: install Mods Menu (Nexus mod 149) and its UE4SS Bridge.
After the first launch creates the JSON, open Settings > Mods Menu > UE4SS Mods >
Forewarn. If the entry is missing, close and reopen settings or restart the game.
Without Mods Menu, edit the JSON while the game is closed. Neither Menu nor its
Bridge is bundled. Do not edit JSON externally while saving through the menu;
stale same-field edits are not protected. Menu save status confirms persistence,
not sound/display success. If an output fails to update, fully restart; the saved
value is retained. Without a complete Menu notification, edits apply on restart.
Updating the mod does not replace your JSON. Back it up before uninstalling,
since it lives in the mod folder. To downgrade, fully exit and install the older
version; it reads the untouched Saved\PBZForewarn.txt, so newer JSON edits must be
copied back manually. Invalid JSON is preserved and reported; defaults are used
for that run. Restore a valid JSON while the game is closed.
The deprecated JSON keys SemanticFallback, YuZanCastWarning and YuZanCastLeadMs
remain internal compatibility settings for fallback comparison with GenericAttack=false.
They are ignored in generic mode and are not exposed in the Menu. Updates preserve
the existing JSON and its legacy values.

Warning timing and targets
- LeadMs=350 — how early the warning appears before the original warning node.
  Range: 0-1000 ms.
- RangeCm=3500 — maximum distance at which eligible enemies are detected.
  Range: 500-10000 cm.
- OnlyLockedTarget=0 — 0 = also warn in unlocked play; 1 = only the confirmed
  locked target.

Appearance and sound
- GlyphOn=1 — show the “危” glyph. 1 = on, 0 = off.
- BlackOn=1 — include black-light attacks. 1 = on, 0 = off.
- GlyphFontSize=120 — glyph size. Range: 30-240.
- GlyphY=0.32 — vertical glyph position. Range: 0.1-0.8.
- SoundOn=1 — play the warning sound. 1 = on, 0 = off.
- SoundVolume=0.8 — this mod's volume. Range: 0-2.

Diagnostics and observation
- Diagnostics=1 — save diagnostic snapshots. Set to 0 to reduce disk logging.
- ObserveAttacks=1 — collect limited read-only attack evidence. Set to 0 to
  disable.
- Hooks=1 — read the optional Lua observation hooks. Set to 0 to disable.
- GenericAttack=0 — experimental generic preparation replacement. 1 = trial on,
  0 = prior boss-scoped rules.
- ObservationFlushMs=20000 — minimum interval between observation-log writes.
  Range: 5000-60000 ms. It changes diagnostic file size and write frequency
  only, never warning or sound timing.

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

0.8 更新内容 — 0.8.0
- 保留0.7引入的可选即时菜单与统一JSON设置。
- GenericAttack开启时，按共享弹体告警资源与抓取风险结构替代两位首领专属路径，
  不再按Boss名字决定通用提示。
- 菜单移除三个逐首领设置；GenericAttack可编辑、默认关闭，关闭可恢复旧兼容路径。
- 普通告警来源在不采集诊断的重编译中仍保留，首次抓取准备提示送达后可抑制已关联的后续黑危。

dev.5一场实机记录中，三轮完整抓取周期仅保留首次已接受的准备提示，后续Main/Success
节点未输出；同场独立攻击仍有预警。这是有限实机证据，不代表全敌人、全招覆盖，
也不是声学或屏幕时间测量。

通用提示统一使用LeadMs和作者准备坐标，不是实测命中或原特效时间；抓取风险不保证
实际抓取。唯一观测到的同角色/同载荷交接可抑制后续准备与普通黑危；结束证据最多
保留1秒观测空档。跨时间轴须为所属能力已结束的Main转入Success，其他分支保留预警。
首次输出失败或阶段有歧义时保留后续提示。这是展示关联，不是已证明的原生攻击身份。
本版不宣称修复原生崩溃。

0.7 更新内容
- 可选 Mods Menu 设置页，包含英文、简中、繁中逐项说明。
- 设置统一到一个 JSON，首次导入旧 TXT 并保留原件备份。
- 16个可编辑设置在菜单保存成功后应用，7个保留项仍只读。
- 包含已有炎茹火环/突进收招补充危，以及玉瓒转圈施法提示。

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
PBZForewarn-0.8.0.zip，并把包内全部部分启用。

手动：前置已装好的情况下，把包内 ProjectPBZ 和 platform 合并到游戏根目录。
保留全部文件并完全重启。

按 Alt+F9 试听危音效。

设置
0.8.0 的所有设置（含只读项）均提供英文、简中、繁中名称与说明。
测试会话日志确认输出开关保存与字号更新，用户反馈运行正常；其他设置虽有离线检查，
尚未逐项在游戏中切换。这些观察不是声画测量或完整语言、操作方式覆盖。
配置位置（相对游戏根目录）：
platform\steam\ue4ss\Mods\PBZForewarnHooks\PBZForewarnHooks.config.json
首次启动会一次性导入 Saved\PBZForewarn.txt 的旧设置；旧 TXT 原样保留作备份。
JSON 存在后，不再读取旧 TXT；手改开关使用 JSON 的 true/false，数值使用数字。
全部14个可编辑设置在菜单保存成功后通常约半秒内应用，游戏停顿可能延迟；6个保留项仍只读。
提前量更新影响待发预警，不补播已消费预警；筛选变更可撤回当前预警。危字布局只重建本MOD显示层。
关闭Lua钩子会暂停捕获和发布，惰性注册保留到最终卸载；游戏线程调度可能延迟Lua切换。
关声停止本MOD音效，开声不补播旧预警；开字只显示仍有效的预警窗口。

可选菜单：安装 Mods Menu（Nexus mod 149）及其 UE4SS Bridge。
首次启动生成 JSON 后，进入 设置 > 模组菜单 > UE4SS 模组 > Forewarn。
没出现时关闭重开设置或重启游戏。未装菜单仍可在退出游戏后手改 JSON。
本包不附带菜单或 Bridge。不要同时用菜单和编辑器修改配置；首版不保护同字段
旧编辑冲突。菜单保存状态只确认文件，不确认声画效果。若输出未更新，请完全重启；
已保存值会保留。没有完整菜单通知的手改仍在重启后应用。
更新本 MOD 不会替换 JSON；卸载前请备份，因为它放在 MOD 文件夹里。
降级须先退出游戏再安装旧版；旧版仍读保留的 Saved\PBZForewarn.txt，
新 JSON 中的改动需手动抄回。JSON 损坏时原件保留并记录错误，本次使用默认值；
请退出游戏后恢复有效 JSON。
已弃用的 JSON 键 SemanticFallback、YuZanCastWarning、YuZanCastLeadMs
仅保留作内部兼容，在 GenericAttack=false 时用于旧路径对照；通用模式忽略它们，
菜单不再提供这些设置。更新会保留现有 JSON 及其中的旧值。

提示时间与目标
- LeadMs=350 — 相对游戏原预警节点的提前量，范围 0-1000ms。
- RangeCm=3500 — 可识别敌人的最大距离，范围 500-10000cm。
- OnlyLockedTarget=0 — 0 为无锁也提示；1 为只提示确认锁定的目标。

显示与声音
- GlyphOn=1 — 显示危字，1 开启，0 关闭。
- BlackOn=1 — 是否包含黑光攻击，1 开启，0 关闭。
- GlyphFontSize=120 — 危字大小，范围 30-240。
- GlyphY=0.32 — 危字垂直位置，范围 0.1-0.8。
- SoundOn=1 — 播放危音效，1 开启，0 关闭。
- SoundVolume=0.8 — 本 MOD 音量，范围 0-2。

诊断与观察
- Diagnostics=1 — 保存诊断快照；设为 0 可减少磁盘日志。
- ObserveAttacks=1 — 收集有限的只读攻击证据；设为 0 关闭。
- Hooks=1 — 读取可选的 Lua 观察 Hooks；设为 0 关闭。
- GenericAttack=0 — 通用准备阶段替代试验。1=试验开启，0=旧首领专属规则。
- ObservationFlushMs=20000 — 观察日志的最小写入间隔，范围 5000-60000ms。
  只影响诊断文件的体积和写入频率，不影响危字或音效时机。

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
