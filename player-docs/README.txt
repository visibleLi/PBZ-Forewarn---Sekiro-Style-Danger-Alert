PBZForewarn 0.6.1-dev.3 / 只狼风格“危”提示

中文
为已支持的红、蓝、黑光攻击显示“危”字和游戏内危音效。

0.6在0.5基础上增加：
- 灭法之法·炎茹：火环、突进收招红危。
- 三号·乐师偶·玉瓒：转圈施法前置黑危和声音。

原有0.5的普通危字、音效、调度、锁定选项和全部行为不变。
不是全招覆盖，不改变攻击或招架判定。

0.6.1-dev.3为开发源码，尚未交付安装包。
修正日志摘要反复序列化和超限丢掉整份BOSS记录的问题。
未证明收益的过期窗口补危默认关闭，普通提示继续使用0.6主链。

新增配置：
SemanticFallback=1
灭法之法·炎茹的两条补充危。设为0关闭。

YuZanCastWarning=1
三号·乐师偶·玉瓒的转圈施法前置危。设为0关闭。

YuZanCastLeadMs=350
三号·乐师偶·玉瓒施法危的独立提前量，数值越大越早。
它参照施法资源节点，不是命中时间。

LateDodgeRecovery=0
过期窗口补危研究开关，默认关闭，未证明覆盖收益。
旧配置若显式写了1仍会开启；此开发版不自动覆盖用户配置。

LateDodgeRecoveryMinRemainingMs=100
补危至少要求距离游戏给出的未来命中时间还有多少毫秒。

配置位置：%LOCALAPPDATA%\ProjectPBZ\Saved\PBZForewarn.txt
旧配置保留，缺少新项时使用默认值。修改后完整重启游戏。

前置必须安装PBZModLoader和PBZ专用UE4SS。
推荐使用Phantom Blade Zero - Mod Manager：
https://www.nexusmods.com/phantombladezero/mods/2

安装：
完全退出游戏，停用旧Forewarn/AlertCue和旧外置音效，导入
PBZForewarn-0.6.1-dev.3.zip，启用脚本、BNK音效和Hooks三部分。

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

0.6.1-dev.3 is development source with no delivered installer.
It repairs repeated summary serialization and loss of whole boss summaries at capacity.
Unproven late-window recovery defaults to off; ordinary cues keep using the 0.6 path.

New settings:
SemanticFallback=1
Acolyte Yanru's two supplementary warnings. Set to 0 to disable.

YuZanCastWarning=1
No. 3 Musician Puppet's cast warning. Set to 0 to disable.

YuZanCastLeadMs=350
Independent lead for that cast warning. Higher values fire earlier.
It targets the cast resource marker, not impact time.

LateDodgeRecovery=0
Experimental recovery, disabled by default; no in-game coverage benefit is proven.
An existing explicit value of 1 still enables it. User configuration is not overwritten.

LateDodgeRecoveryMinRemainingMs=100
Minimum reported time before the future hit for a recovery cue.

Settings: %LOCALAPPDATA%\ProjectPBZ\Saved\PBZForewarn.txt
Existing values are kept; missing keys use defaults. Fully restart after changes.

PBZModLoader and PBZ-specific UE4SS are required.
Recommended Phantom Blade Zero - Mod Manager:
https://www.nexusmods.com/phantombladezero/mods/2

Install:
Close the game, disable older Forewarn/AlertCue and external warning sounds,
import PBZForewarn-0.6.1-dev.3.zip, and enable scripts, BNK audio and Hooks.

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
