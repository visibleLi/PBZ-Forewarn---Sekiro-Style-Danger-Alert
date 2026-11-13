PBZForewarn 0.6.0-trial.1 — 只狼风格危字与音效提示

这版做什么
沿用0.5的调度、危字和游戏内Wwise音效，在observe-bounded.2的有界观察基础上，试接QiShu_Huo两条红危补充：火环、突进收招。
现有日志已读取到这两招的RedEye=3分类与动作计划，旧识别器只认提示资源，因此没有发危。
新规则同时核对角色、技能、动作类和分类，不全局开启所有RedEye或不可格挡动作。
标准提示在同一节点优先；同节点从补充转为标准来源时保留去重身份。不同节点不会仅因同色或时间接近而强行合并。
本trial尚待实机验证；不承诺全招覆盖。原光、原攻击、招架和伤害规则不变。

必装前置
必须安装PBZModLoader和PBZ专用UE4SS。0.5已测组合为PBZModLoader 2.1.0和UE4SS v3.0.1-1195-g1ceefac8。
推荐使用Phantom Blade Zero - Mod Manager管理前置和本MOD：
https://www.nexusmods.com/phantombladezero/mods/2
PBZ专用UE4SS发行页：https://www.nexusmods.com/phantombladezero/mods/13
已测Loader源码：https://github.com/KintaroModding/phantombladezero_pbzmodloader/releases/tag/v2.1.0
其他加载器发行版本须单独验证，不叠装两套加载器。

安装
管理器：完全退出游戏，停用旧Forewarn/AlertCue及旧外置音效包，导入PBZForewarn-0.6.0-trial.1.zip，启用主脚本、BNK音效、Hooks全部三部分。
手动：默认前置已装好。把ZIP内ProjectPBZ和platform合并到游戏根目录（能看到这两个文件夹的位置），保留全部文件。
完全退出后重启，Alt+F9试听危音效；Alt+F5不能代替Lua/音效重载。

配置
%LOCALAPPDATA%\ProjectPBZ\Saved\PBZForewarn.txt。保留旧值，缺少新项使用默认值。
LeadMs=350：数值越大，请求越早；普通来源参照原提示节点，补充来源参照动作计划起点，不是命中点。
SemanticFallback=1：启用两条QiShu_Huo补充。设0关闭新增规则，保留观察版原提示链路。
OnlyLockedTarget=0：无锁也提示；1只提醒已确认锁定目标。SoundVolume=0.8：本MOD音量0—2。
ObserveAttacks=1和Diagnostics=1启用有限只读观察；只记录，不驱动预警决策。
修改配置后完整重启。此处回退开关不代表逐字节回到0.5；要恢复0.5请移除本版再装发布包。

源码构建
Git和Source ZIP均不含WAV、BNK或WEM。自备有权使用的音源放到：js-package/PBZForewarn/cue.wav。
格式：44100Hz、双声道、16bit未压缩PCM WAV，0.01—30秒。
原0.5音源自动去掉已验证的开头80ms近静音；其他音源默认不裁剪。SHA256只作原音源识别，不锁定自备音频。
Python 3.12、Node.js 24，在仓库根目录运行：
  python -m pip install --target hooks-package/tests/lib -r requirements-test.txt
  python audio-bank/build_bank.py
  python verify.py --node <node.exe路径，或PATH里的node>
  python package.py
安装包输出dist/PBZForewarn-0.6.0-trial.1.zip；默认不打Source。要源码包运行python package.py --source。
安装ZIP只含ProjectPBZ、platform和一份中英README。外置PACKAGE_CHECK.json记录包与运行文件哈希，不需安装。
源码、文档、音频在验证后有变，必须重跑verify.py。完整流程和分支使用见DEVELOPMENT.md。

日志与测试
5个本MOD文件位于Saved：pbzforewarn_diagnostics.json、pbzforewarn_resources.json、pbzforewarn_hooks.json、pbzforewarn_observations.json、pbzforewarn_observer_hooks.json。
另有游戏根目录下ProjectPBZ/PBZModLoader/loader.log及platform/steam/ue4ss/UE4SS.log。
新启动/重载会覆盖快照；复现后退出并及时手动复制，附BOSS、动作与大概时间。日志不会自动上传。
0.5曾在Steam build26367565上完成四BOSS测试；这不能作为本trial新规则已实测的证据。
尚待核对两招是否发危、声字同步、时机、重复/误报、其他BOSS回归、性能和正常退出。

卸载
管理器移除本MOD；手动退出游戏后只删除：
  ProjectPBZ/PBZModLoader/mods/PBZForewarn
  ProjectPBZ/Content/PBZForewarn
  platform/steam/ue4ss/Mods/PBZForewarnHooks
保留共用加载器、Saved和存档。避免同时使用另一套额外危字或提前预警。

来源
“危”形式参考《只狼：影逝二度》，用PBZ字体绘制，未导入只狼UI动画。此处安装包沿用0.5的只狼危音效。
素材权利归原权利人；源码包不附素材，构建者自行处理音源权利。感谢加载器与管理器作者。
使用AI辅助分析、编码、调试和文档整理。
