PBZForewarn 0.6.0-preview / 只狼风格“危”提示

中文
为已支持的红、蓝、黑光攻击显示“危”字和游戏内危音效。
0.6预览保留全部普通红蓝黑危，并补Acolyte Yanru（灭法之法·炎茹）两招与No. 3 Musician Puppet（三号·乐师偶·玉瓒）转圈施法前置黑色系危和声音，默认开启。
原有0.5调度、危字与Wwise音效模块继续使用。不是全招覆盖，不改变攻击或招架判定。

前置必须安装PBZModLoader和PBZ专用UE4SS。建议用Phantom Blade Zero - Mod Manager管理前置和本MOD：
https://www.nexusmods.com/phantombladezero/mods/2
Mod Manager：完全退出游戏，停用旧Forewarn/AlertCue及旧外置音效包，导入本ZIP并启用全部三部分。
手动安装：默认前置已装好。把包内ProjectPBZ和platform合并到游戏根目录，保留所有文件。
完全退出后重启；仅按Alt+F5不能重载Lua和音效。Alt+F9试听危音效。

配置：%LOCALAPPDATA%\ProjectPBZ\Saved\PBZForewarn.txt。旧配置保留；缺少新项时使用默认值。
LeadMs=350：目标提前量，越大越早；普通提示参照原提示节点，新补充参照该动作计划起点。
YuZanCastWarning=1：开启No. 3 Musician Puppet（三号·乐师偶·玉瓒）施法提醒；设0恢复原有提示。
YuZanCastLeadMs=350：独立目标提前量，只参照施法AOE资源节点，不代表命中/控制前350ms。
施法节点为零时长，危字到节点时可结束；音尾遵循原取消逻辑。旧配置缺新项时默认生效。
这不保证比命中早350ms，也不保证所有动作都来得及提前。
SemanticFallback=1：默认开启Acolyte Yanru（灭法之法·炎茹）两条补充；设0仅关闭这两条。
GenericAttack=0：trial.2观察开关；当前不会产生通用补充危，仅在日志中记录候选。
OnlyLockedTarget=0：无锁也提示；设1只提示游戏确认锁定的目标。
SoundVolume=0.8：本MOD音量（0—2）。ObserveAttacks=1：启用有限只读观察日志。
配置修改后完整重启。

卸载：管理器移除此MOD；手动只删以下三个目录：
ProjectPBZ\PBZModLoader\mods\PBZForewarn
ProjectPBZ\Content\PBZForewarn
platform\steam\ue4ss\Mods\PBZForewarnHooks
保留共用加载器、配置与存档。要恢复发布版0.5，请移除本版再装原0.5包。
Acolyte Yanru（灭法之法·炎茹）两条补充已实测：火环、突进收招均提交红危和音效请求。
本次新增观察只用于确认通用攻击的提示节点、原生来招和时间关系，不能当作已实装通用预警。
No. 3 Musician Puppet（三号·乐师偶·玉瓒）新增提醒表示危险施法开始，不预言后续控制一定发生。
本预览不是全招覆盖。YuCong短黑光、部分条件拒绝、已发弹体生命周期、WeGame和仅锁定模式仍需更多验证。

English
Adds a coloured “危” glyph and in-game warning sound for supported red, blue and black attacks.
0.6.0-preview keeps all ordinary red, blue and black warnings and adds the Acolyte Yanru (QiShu_Huo)
fire-ring and assault-end rules plus a cast warning for No. 3 Musician Puppet (YuZan), enabled by default.
The 0.5 scheduling, glyphs and Wwise audio remain in use. This is not full-move coverage,
and it does not change attacks or parry rules.
Requires PBZModLoader and PBZ-specific UE4SS. Mod Manager (link above) is recommended.
Manager: close the game, disable older Forewarn/AlertCue and external cue players, import this ZIP and enable all three parts.
Manual: with prerequisites installed, merge ProjectPBZ and platform into the game root. Keep all files.
Fully restart after changes. Alt+F9 previews the warning sound.
Settings: %LOCALAPPDATA%\ProjectPBZ\Saved\PBZForewarn.txt. Existing settings are preserved; missing keys use defaults.
LeadMs=350 targets earlier notice relative to the original warning node, or the action-plan start for the new rules.
A larger value requests earlier notice; it does not guarantee lead before impact.
SemanticFallback=0 disables the Acolyte Yanru rules. GenericAttack=0 keeps evidence collection non-cueing. OnlyLockedTarget=1 requires a confirmed lock. SoundVolume is local volume (0–2).
Remove only this mod's three folders listed above, keeping shared loaders and saves.
The captured build is Steam 26367565; no build lock is enforced. Full move coverage, WeGame and exhaustive lock mode are unvalidated.

来源 / Credits
“危”形式参考《只狼：影逝二度》(FromSoftware)，使用PBZ字体绘制。此处安装包沿用0.5的《只狼》危音效。
源码包不含音源和生成音效库；构建者须自备有权使用的音源。相关素材权利归权利人。
Sekiro-inspired presentation; the local installer retains the 0.5 Sekiro warning sound. Third-party rights remain with their owners.
