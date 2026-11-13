PBZForewarn 0.5 / 只狼风格“危”提示

中文
为已支持的红、蓝、黑光攻击增加“危”字和游戏内音效。不是全招覆盖，不改变原攻击、招架或伤害规则。

前置
必须安装PBZModLoader和PBZ专用UE4SS。建议用Phantom Blade Zero - Mod Manager管理前置和本MOD：
https://www.nexusmods.com/phantombladezero/mods/2

Mod Manager：完全退出游戏，禁用旧Forewarn/AlertCue及外置音效包，导入本包并启用全部MOD部分。
手动安装：默认前置已安装。把包内ProjectPBZ和platform目录合并到游戏根目录，保留所有文件。
完整重启游戏；替换Lua/音效后仅按Alt+F5不够。可控场景按Alt+F9试听。

设置位于%LOCALAPPDATA%\ProjectPBZ\Saved\PBZForewarn.txt。
LeadMs=350是相对原光的目标提前量，不保证短起手也有350ms。
OnlyLockedTarget=0支持无锁；设为1只提示已锁定目标。SoundVolume调节本MOD音量。

卸载：用Mod Manager移除此MOD；手动用户只删Forewarn自己的脚本、音频、Hooks目录。保留共用加载器和存档。
仅Windows/Steam build26367565的有限BOSS样本做过实机测试；不承诺全招覆盖或WeGame兼容。

English
Adds a “危” danger glyph and in-game sound for supported red, blue and black attacks.
Not every move is covered. Original attacks, parry rules and damage are unchanged.
Requires PBZModLoader and PBZ-specific UE4SS. Mod Manager is recommended (link above).
Manager: close the game, disable older Forewarn/AlertCue and external cue-player mods, import this package and enable all its parts.
Manual: with both prerequisites installed, merge ProjectPBZ and platform into the game root. Keep every file.
Fully restart after replacing Lua or audio. Alt+F9 previews the sound.
Settings: %LOCALAPPDATA%\ProjectPBZ\Saved\PBZForewarn.txt. LeadMs is target lead relative to the original flash;
short attacks may provide less time. OnlyLockedTarget=1 requires a confirmed lock.
Remove this mod with the manager or delete only its own scripts, bank and UE4SS Hooks folders.
Limited Windows/Steam testing only; full move coverage and WeGame are not claimed.

来源 / Credits
“危”风格参考《只狼：影逝二度》(FromSoftware)。游戏安装包内的音效由发布者提供；相关素材权利归权利人。
The style is inspired by Sekiro: Shadows Die Twice (FromSoftware). The publisher supplies the runtime audio asset; third-party rights remain with their owners.
