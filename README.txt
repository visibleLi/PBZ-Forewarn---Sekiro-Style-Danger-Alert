PBZForewarn 0.9.0 — Sekiro-Style Danger Alert
只狼风格“危”预警

English
=======

WHAT'S NEW IN 0.9 — 0.9.0
- Enables generic preparation once on upgrade, including old saved 0/false values.
  After the upgrade marker is saved, a later manual false remains respected.
- The old boss/ability-name warning routes are removed; no switch restores them.
- Menu contains only eight everyday controls: lead, range, locked target, sound,
  volume, glyph visibility, size and vertical position. No third-party patch needed.
- Black warnings and diagnostic features remain available internally, not as Menu
  rows. Startup backs up pre-upgrade JSON before updating the same config file.
- Adds the overlap-bullet Start-resource preparation route. One test.2 session
  recorded six red cues accepted by the audio interface; this is limited evidence,
  not all-move coverage or a native-crash repair.

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
import PBZForewarn-0.9.0.zip, and enable all of its parts.

Manual: with both requirements already installed, merge ProjectPBZ and platform
into the game root. Keep every file and fully restart.

Press Alt+F9 to preview the warning sound.

SETTINGS
The eight Menu controls have English, Simplified and Traditional Chinese labels
and help. Existing output and font-size settings have limited earlier gameplay
observations; this new compact layout/migration has offline checks only.
Settings file (relative to game root):
platform\steam\ue4ss\Mods\PBZForewarnHooks\PBZForewarnHooks.config.json

Install/update as usual; no extra patch or manual configuration step is required.
On first start, Forewarn imports the old Saved\PBZForewarn.txt if no JSON exists.
On upgrade, the existing JSON is backed up as
PBZForewarnHooks.config.json.pre-generic-default.bak. Old flat JSON is also grouped:
eight public settings stay at the top, internal values move into _internal, and
unknown values stay in _extra. The three retired boss keys are not executed.
This upgrade enables generic preparation once, including old GenericAttack=0/false
from TXT or test.1 JSON. Other settings are preserved. The reserved numeric marker
_extra.PBZForewarnGenericAttackEpoch=1 records the upgrade; keep it when later
setting _internal.GenericAttack=false manually. That later false is respected on
restart. No switch restores the deleted boss rules; no third-party patch is needed.

Optional in-game settings: install Mods Menu (Nexus mod 149) and its UE4SS Bridge.
Open Settings > Mods Menu > UE4SS Mods > Forewarn after the first launch. Neither
Menu nor Bridge is bundled or modified. The eight controls apply after a successful
Menu save, normally within about 0.5 s; game stalls may delay this. Menu saves keep
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

Internal features (not Menu controls)
Black warnings, generic preparation recognition and diagnostic/observation hooks
remain implemented. Their values remain under _internal; only the old generic
off value is enabled once by this upgrade. Later marked false is respected.
The obsolete per-boss configuration is no longer read.

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

0.9 更新内容 — 0.9.0
- 升级时将旧GenericAttack=0/false开启一次，保存升级标记后再手动关闭会保留，不每次强开。
- 旧Boss/技能名专属预警路径已移除，任何开关都不能恢复旧特判。
- 菜单只保留8项日常设置：提前量、距离、仅锁定、声音、音量、显示危字、大小、垂直位置。
- 黑危、诊断和观察等功能仍在，仅移出菜单。无需第三方菜单补丁或额外安装步骤。
- 启动时备份升级前JSON，更新同一配置文件；除通用旧关闭值升级开启外，其他设置保留。
- 新增重叠弹体Start资源准备路径；test.2一场记录6条红危获音频接口接受，只是有限证据，
  不代表全招支持或原生崩溃修复。

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
PBZForewarn-0.9.0.zip，并把包内全部部分启用。

手动：前置已装好的情况下，把包内 ProjectPBZ 和 platform 合并到游戏根目录。
保留全部文件并完全重启。

按 Alt+F9 试听危音效。

设置
菜单8项设置提供英文、简中、繁中名称与说明。旧版部分输出与字号设置有有限实机记录；
本次精简布局和迁移仅离线检查，尚未实机验收。
配置位置（相对游戏根目录）：
platform\steam\ue4ss\Mods\PBZForewarnHooks\PBZForewarnHooks.config.json

正常安装/更新即可，无额外补丁或手动配置步骤。没有JSON时，首次启动会导入旧的
Saved\PBZForewarn.txt。本次升级先备份既有JSON为
PBZForewarnHooks.config.json.pre-generic-default.bak；旧平铺配置同时归整为公开8项顶层、
内部值_internal和未知数据_extra。三个旧首领键不参与执行。
本次升级将旧TXT或test.1 JSON中的GenericAttack=0/false统一开启一次，其他设置保留。
保留标记_extra.PBZForewarnGenericAttackEpoch=1（数字）后，若再手动把_internal.GenericAttack
改为false，后续重启会尊重这个关闭值，不反复强开。关闭也不能恢复已删除的首领特判。
无需第三方补丁。

可选菜单：安装Mods Menu（Nexus mod 149）及其UE4SS Bridge，首次启动后进入
设置 > 模组菜单 > UE4SS 模组 > Forewarn。本包不附带或修改菜单/Bridge。
8项设置在菜单保存成功后通常约半秒内应用，游戏停顿可能延迟；保存会保留_internal和_extra。
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

内部功能（不在菜单展示）
黑危、通用准备识别、诊断及观察钩子仍保留；值在_internal中，仅旧通用关闭值本次升级开启一次，
带升级标记后再手动false会保留。
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
