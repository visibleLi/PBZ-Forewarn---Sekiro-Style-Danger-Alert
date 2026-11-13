PBZForewarn 0.6.0-observe-bounded.2 / 定向观察测试版

中文
保留现有危字、提前量和游戏内音效，改进关键记录留存、起播/跳段/取消摘要。
重点核对：发现时已过窗口的招、很短的黑光、投掷取消后是否仍有危险。
新观察不参与发危；这版尚未证明补漏或更早提示，也不是N网正式发布包。

强制前置：PBZModLoader、PBZ用UE4SS。
建议用 Phantom Blade Zero - Mod Manager 管理前置和本MOD：
https://www.nexusmods.com/phantombladezero/mods/2

管理器安装：完全退出游戏，禁用其他Forewarn版本，导入本ZIP，只启用这一版。
手动安装：默认前置已装好。备份旧PBZForewarn及PBZForewarnHooks目录，
把本ZIP内ProjectPBZ和platform合并到游戏根目录。替换Lua后必须完整重启，Alt+F5不够。
升级保留原PBZForewarn.txt设置；LeadMs含义不变，Alt+F9试听不变。

测试：不用重跑两小时。先在熟悉战斗中短测危、声音、连续招、打断及正常退出；
若遇短黑光或投掷动作，请留意并告知敌人名称。具体未解招式由开发者结合记录核对。
本包不调整音效并发策略；此前相邻危可能截断前一声的限制仍在。

本地记录：%LOCALAPPDATA%\ProjectPBZ\Saved\
pbzforewarn_observations.json：原观察片段+紧凑关键摘要/路径字典/累计计数。
pbzforewarn_observer_hooks.json：Lua调用片段+三个重点招式的起播前后摘要。
diagnostics/resources/hooks文件沿用；记录都有容量限制，淘汰和不可用状态会显示。
ObserveAttacks=0或Diagnostics=0可停用新观察；修改配置后完整重启。
无收集脚本、自动上传、外置播放器或前置捆绑。Steam实测为前版，.2仍待实机验证。
回滚：退出游戏，禁用本包，重新启用.1或已发布0.5。手动用户恢复备份目录。

English
Keeps the existing glyph, lead setting and in-game Wwise sound. Adds compact
evidence, task start/seek/cancel context and focused Lua call summaries.
Observations never trigger cues. This is an unverified test build, not the Nexus release.
Requires PBZModLoader and PBZ-specific UE4SS; the Mod Manager above is recommended.
Close the game, disable other Forewarn versions, import this ZIP and enable it alone.
Manual users with both prerequisites installed: back up PBZForewarn/PBZForewarnHooks,
then merge ProjectPBZ and platform into the game root. Fully restart after replacing Lua.
Settings are preserved; Alt+F9 previews the sound. Test a familiar fight and normal exit;
there is no need to repeat the previous two-hour run. Audio concurrency is unchanged.
Records stay locally under the Saved directory above, with explicit capacity limits.
Set ObserveAttacks=0 or Diagnostics=0 and restart to disable optional observations.
To roll back, close the game and restore/re-enable the previous mod version.

Credits / 来源
The danger glyph/style and warning sound originate from Sekiro: Shadows Die Twice
(FromSoftware / Activision). Unofficial fan mod; not affiliated with them.
Runtime developed independently. Other reviewed mods' code/data are not bundled.
