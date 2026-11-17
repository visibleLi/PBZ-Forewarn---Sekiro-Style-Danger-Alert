PBZForewarn 0.6.1-dev.5 — Sekiro-Style Danger Alert
只狼风格“危”预警

English
=======

WHAT'S NEW IN 0.6
- Acolyte Yanru: danger cues for the fire-ring and assault-end moves.
- No. 3 Musician Puppet: a warning and sound before the spinning cast.

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
import PBZForewarn-0.6.1-dev.5.zip, and enable all of its parts.

Manual: with both requirements already installed, merge ProjectPBZ and platform
into the game root. Keep every file and fully restart.

Press Alt+F9 to preview the warning sound.

SETTINGS
Settings file: %LOCALAPPDATA%\ProjectPBZ\Saved\PBZForewarn.txt
Existing values are kept. Fully restart after editing.

Warning timing and targets
- LeadMs=350 — how early the warning appears before the original warning node.
  Range: 0-1000 ms.
- YuZanCastWarning=1 — No. 3 Musician Puppet's spinning-cast warning.
  1 = on, 0 = off.
- YuZanCastLeadMs=350 — separate lead time for that cast warning.
  Range: 0-1000 ms.
- SemanticFallback=1 — Acolyte Yanru's two extra warnings. 1 = on, 0 = off.
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
- GenericAttack=0 — reserved for generic attack observation. Leave at 0.
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

0.6 更新内容
- 灭法之法·炎茹：火环、突进收招红危。
- 三号·乐师偶·玉瓒：转圈施法前的黑危和声音。

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
PBZForewarn-0.6.1-dev.5.zip，并把包内全部部分启用。

手动：前置已装好的情况下，把包内 ProjectPBZ 和 platform 合并到游戏根目录。
保留全部文件并完全重启。

按 Alt+F9 试听危音效。

设置
配置位置：%LOCALAPPDATA%\ProjectPBZ\Saved\PBZForewarn.txt
旧配置保留，改完完全重启。

提示时间与目标
- LeadMs=350 — 相对游戏原预警节点的提前量，范围 0-1000ms。
- YuZanCastWarning=1 — 三号·乐师偶·玉瓒的转圈施法提示，1 开启，0 关闭。
- YuZanCastLeadMs=350 — 该施法提示的独立提前量，范围 0-1000ms。
- SemanticFallback=1 — 灭法之法·炎茹的两条补充危，1 开启，0 关闭。
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
- GenericAttack=0 — 通用攻击观察预留项，保持 0。
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
