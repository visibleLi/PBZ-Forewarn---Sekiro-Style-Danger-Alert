PBZForewarn 0.6.1-test.2 / 只狼风格“危”提示

中文
为已支持的红、蓝、黑光攻击显示“危”字和游戏内危音效。

0.6在0.5基础上增加：
- 灭法之法·炎茹：火环、突进收招红危。
- 三号·乐师偶·玉瓒：转圈施法前置黑危和声音。

原有0.5的普通危字、音效、调度、锁定选项和全部行为不变。
不是全招覆盖，不改变攻击或招架判定。

0.6.1开发测试增加：普通时间轴预警已经错过，但游戏随后送来同一敌人、
技能、激活、时间轴和动作的“只能闪避”来招帧时，补一次当刻危。
只匹配已经确认过期的预警，不按名字猜。这不是提前350ms的保证；
未来命中时间必须至少还剩100ms。

新增配置：
SemanticFallback=1
灭法之法·炎茹的两条补充危。设为0关闭。

YuZanCastWarning=1
三号·乐师偶·玉瓒的转圈施法前置危。设为0关闭。

YuZanCastLeadMs=350
三号·乐师偶·玉瓒施法危的独立提前量，数值越大越早。
它参照施法资源节点，不是命中时间。

LateDodgeRecovery=1
已错过时间轴预警＋后续只能闪避来招帧的保守补危。
需要ObserveAttacks和Diagnostics同时开启。设为0关闭。

LateDodgeRecoveryMinRemainingMs=100
补危至少要求距离游戏给出的未来命中时间还有多少毫秒。

配置位置：%LOCALAPPDATA%\ProjectPBZ\Saved\PBZForewarn.txt
旧配置保留，缺少新项时使用默认值。修改后完整重启游戏。

前置必须安装PBZModLoader和PBZ专用UE4SS。
推荐使用Phantom Blade Zero - Mod Manager：
https://www.nexusmods.com/phantombladezero/mods/2

安装：
完全退出游戏，停用旧Forewarn/AlertCue和旧外置音效，导入
PBZForewarn-0.6.1-test.2.zip，启用脚本、BNK音效和Hooks三部分。

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

The 0.6.1 development test adds one conservative recovery: a cue is issued only
when an ordinary warning was already missed and the game later supplies a
dodge-only frame for the same enemy, ability, activation, timeline and action.
It does not guess from names, does not guarantee 350 ms of lead, and requires at
least 100 ms before the game-reported future hit time.

New settings:
SemanticFallback=1
Acolyte Yanru's two supplementary warnings. Set to 0 to disable.

YuZanCastWarning=1
No. 3 Musician Puppet's cast warning. Set to 0 to disable.

YuZanCastLeadMs=350
Independent lead for that cast warning. Higher values fire earlier.
It targets the cast resource marker, not impact time.

LateDodgeRecovery=1
Enables the conservative recovery. ObserveAttacks and Diagnostics are required.
Set to 0 to disable.

LateDodgeRecoveryMinRemainingMs=100
Minimum reported time before the future hit for a recovery cue.

Settings: %LOCALAPPDATA%\ProjectPBZ\Saved\PBZForewarn.txt
Existing values are kept; missing keys use defaults. Fully restart after changes.

PBZModLoader and PBZ-specific UE4SS are required.
Recommended Phantom Blade Zero - Mod Manager:
https://www.nexusmods.com/phantombladezero/mods/2

Install:
Close the game, disable older Forewarn/AlertCue and external warning sounds,
import PBZForewarn-0.6.1-test.2.zip, and enable scripts, BNK audio and Hooks.

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
