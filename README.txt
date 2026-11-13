PBZForewarn 0.5 — 只狼风格危字与音效提示

介绍
为《影之刃零》支持的红、蓝、黑光攻击增加对应颜色的“危”字和危音效，让危险动作更容易注意到。原游戏提示光、攻击时序和招架窗口不变。
默认目标提前量350ms，短起手可能来不及提前。默认支持无锁玩法，可配置只提醒当前锁定目标。

源码仓库与音频
Git源码仓库不包含cue.wav、PBZForewarn.bnk及生成的WEM；本地已有文件会保留，但不提交。
从源码构建完整安装包，需要自行提供与0.5基线一致的音源：
  放置位置（相对仓库根目录）：js-package/PBZForewarn/cue.wav
  格式：44100Hz、双声道、16bit PCM WAV，202860帧（4.6秒）
  SHA256：5ad6af4e012662d527e93c3044651c278536bac5498853eead4513f77928b7e8
当前验证锁定该文件，不能随意换一份WAV或通过重命名MP3代替；使用不同音源需另行修改并验证构建。
在仓库根目录执行：
  python -m pip install --target hooks-package/tests/lib -r requirements-test.txt
  python audio-bank/build_bank.py
  python verify.py --node <node.exe的实际路径>
  python package.py
安装包输出到dist/PBZForewarn-0.5.zip；该目录已由.gitignore排除。
开发环境为Python 3.12和Node.js 24。第二条命令生成audio-bank/generated/PBZForewarn.bnk；
BNK用于玩家安装包，Source ZIP继续排除WAV、BNK和WEM。打包器仍锁定已测0.5运行文件，
源码改动后不能沿用旧实测哈希。更多说明见DEVELOPMENT.md。
音频自备说明不授予第三方素材使用或再分发许可。玩家安装方式见下方。

必装前置
- PBZModLoader（已测2.1.0）
  https://github.com/KintaroModding/phantombladezero_pbzmodloader/releases/tag/v2.1.0
- UE4SS（已测PBZ专用v3.0.1-1195-g1ceefac8）
  N网同一发行线路：https://www.nexusmods.com/phantombladezero/mods/13
  https://github.com/KintaroModding/ue4ss/releases/tag/v3.0.1-1195-g1ceefac8

以上是本MOD已测的具体组合，管理器和手动安装均可使用。N网mods/5的自定义UE4SS包、mods/113的原作Loader1.0.2尚未完成本MOD组合实测，不能直接承诺等价兼容。两套Loader或两套UE4SS包不要叠装。

推荐使用 Phantom Blade Zero - Mod Manager 管理上述前置和本MOD：
https://www.nexusmods.com/phantombladezero/mods/2

Mod Manager安装（推荐）
1. 完全退出游戏，在管理器中安装PBZModLoader和UE4SS。
2. 停用旧Forewarn、AlertCue及旧外置音效包，导入PBZForewarn-0.5.zip。
3. 包内三项全部启用：PBZForewarn主程序、PBZForewarn.bnk音效、PBZForewarnHooks。
4. 完整启动游戏，进入可控场景按Alt+F9试听，再试战斗。

手动安装
以下默认你已安装好PBZModLoader和UE4SS。
1. 完全退出游戏，解压PBZForewarn-0.5.zip。
2. 把包内ProjectPBZ和platform两个文件夹合并到游戏根目录（能看到这两个文件夹的位置）。
3. 保留全部文件，不要只拿main.js，也不要把BNK放到Paks/~mods。
4. 启动游戏，在可控场景按Alt+F9试听。

配置
首次运行生成：%LOCALAPPDATA%\ProjectPBZ\Saved\PBZForewarn.txt
LeadMs=350：目标提前量；SoundVolume=0.8：音量（0—2）。
OnlyLockedTarget=0：无锁也提示；改为1只提示游戏确认锁定的目标，未锁定时不报。
替换MOD文件后完整重启。Alt+F5只重载JS，不能代替重启。

升级与卸载
升级前先停用／移除旧版本，保留自己的配置，再安装新包。
管理器用户直接移除本MOD；手动用户退出后只删除以下三个目录：
  ProjectPBZ\PBZModLoader\mods\PBZForewarn
  ProjectPBZ\Content\PBZForewarn
  platform\steam\ue4ss\Mods\PBZForewarnHooks
保留其他MOD共用的加载器，不要删除整个Saved或存档。

已知问题
- 已测Windows／Steam build26367565和4个BOSS，尚未覆盖全部招式；WeGame未实测。
- 极短起手可能只起到补充提醒，甚至稍晚于原光。只锁定模式尚需更多测试。
- BOSS取消／切换动作时会撤回提示，可能出现短闪。
- 不建议同时启用另一套额外危字／提前预警；修改技能和提示资源的MOD可能影响识别。

日志与反馈
日志自动记录，不需要运行收集脚本。反馈时附BOSS、动作、问题和大致时间，退出后手动复制：
  %LOCALAPPDATA%\ProjectPBZ\Saved\pbzforewarn_diagnostics.json
  %LOCALAPPDATA%\ProjectPBZ\Saved\pbzforewarn_resources.json
  %LOCALAPPDATA%\ProjectPBZ\Saved\pbzforewarn_hooks.json
  <游戏根>\ProjectPBZ\PBZModLoader\loader.log
  <游戏根>\platform\steam\ue4ss\UE4SS.log
新启动或热重载会覆盖记录，及时保存。日志包含本地路径及可能的其他MOD输出，分享前可检查；不会自动上传。

致谢与声明
“危”提示形式参考《只狼：影逝二度》，危音效来自《只狼》游戏原声（FromSoftware）。
危字使用PBZ游戏内字体绘制，未使用《只狼》原版UI动画素材。相关素材权利归原权利方所有。
感谢PBZModLoader、UE4SS及Phantom Blade Zero - Mod Manager的作者。
使用AI辅助分析、编码、调试和文档整理。

玩家包：PBZForewarn-0.5.zip
可选源码：PBZForewarn-0.5-Source.zip（不是另一个必装包）
运行版本：0.5.0-release.2
