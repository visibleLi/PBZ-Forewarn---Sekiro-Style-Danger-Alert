PBZForewarn 0.6.1-dev.5 / 只狼风格“危”提示

中文
为已支持的红、蓝、黑光攻击显示“危”字和游戏内危音效。

0.6在0.5基础上增加：
- 灭法之法·炎茹：火环、突进收招红危。
- 三号·乐师偶·玉瓒：转圈施法前置黑危和声音。

原有0.5的普通危字、音效、调度、锁定选项和全部行为不变。
不是全招覆盖，不改变攻击或招架判定。

0.6.1-dev.5为卡顿修复测试包。
观察日志改为20秒独立节奏、内容未变不写，主循环不再每5秒序列化整份数据。
观察缓冲上限下调。未证明收益的过期窗口补危已从源码移除。
危字、音效、调度和炎茹/玉瓒规则逻辑未改。

新增配置：
SemanticFallback=1
灭法之法·炎茹的两条补充危。设为0关闭。

YuZanCastWarning=1
三号·乐师偶·玉瓒的转圈施法前置危。设为0关闭。

YuZanCastLeadMs=350
三号·乐师偶·玉瓒施法危的独立提前量，数值越大越早。
它参照施法资源节点，不是命中时间。

配置位置：%LOCALAPPDATA%\ProjectPBZ\Saved\PBZForewarn.txt
旧配置保留，缺少新项时使用默认值。修改后完整重启游戏。

前置必须安装PBZModLoader和PBZ专用UE4SS。
推荐使用Phantom Blade Zero - Mod Manager：
https://www.nexusmods.com/phantombladezero/mods/2

安装：
完全退出游戏，停用旧Forewarn/AlertCue和旧外置音效，导入
PBZForewarn-0.6.1-dev.5.zip，启用脚本、BNK音效和Hooks三部分。

手动安装：
默认PBZModLoader和UE4SS已经装好。把包内ProjectPBZ和platform
合并到游戏根目录，保留全部文件。完整重启；Alt+F9试听危音效。

卸载：
管理器用户直接移除此MOD。手动用户退出游戏后只删除：
ProjectPBZ\PBZModLoader\mods\PBZForewarn
ProjectPBZ\Content\PBZForewarn
platform\steam\ue4ss\Mods\PBZForewarnHooks

English
Shows the “危” glyph and in-game warning sound for supported red, blue and black attacks.

0.6 adds:
- Acolyte Yanru: red danger cues for the fire-ring and assault-end moves.
- No. 3 Musician Puppet: a black warning and sound before the spinning cast.

All ordinary 0.5 warnings, audio, scheduling, lock options and existing behavior remain unchanged.
This is not full-move coverage and does not change attacks or parry rules.

0.6.1-dev.5 is a stall-fix test build.
Observation logging now uses its own 20 s cadence and skips unchanged content.
Observation caps are lower; unproven late-window recovery is removed.
Glyph, audio, scheduling and Yanru/YuZan rules are unchanged.

New settings:
SemanticFallback=1
Acolyte Yanru's two supplementary warnings. Set to 0 to disable.

YuZanCastWarning=1
No. 3 Musician Puppet's cast warning. Set to 0 to disable.

YuZanCastLeadMs=350
Independent lead for that cast warning. Higher values fire earlier.
It targets the cast resource marker, not impact time.

Settings: %LOCALAPPDATA%\ProjectPBZ\Saved\PBZForewarn.txt
Existing values are kept; missing keys use defaults. Fully restart after changes.

PBZModLoader and PBZ-specific UE4SS are required.
Recommended Phantom Blade Zero - Mod Manager:
https://www.nexusmods.com/phantombladezero/mods/2

Install:
Close the game, disable older Forewarn/AlertCue and external warning sounds,
import PBZForewarn-0.6.1-dev.5.zip, and enable scripts, BNK audio and Hooks.

Manual install:
With PBZModLoader and UE4SS already installed, merge ProjectPBZ and platform
into the game root and keep every file. Fully restart; Alt+F9 previews the sound.

Uninstall:
Remove the mod in Manager, or delete only these folders:
ProjectPBZ\PBZModLoader\mods\PBZForewarn
ProjectPBZ\Content\PBZForewarn
platform\steam\ue4ss\Mods\PBZForewarnHooks

Credits:
The “危” style is inspired by Sekiro: Shadows Die Twice.
The installer uses the same warning sound as 0.5.
Third-party rights remain with their owners.
