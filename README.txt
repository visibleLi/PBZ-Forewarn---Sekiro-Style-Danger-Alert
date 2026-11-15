PBZForewarn 0.6.1-dev.3 / 只狼风格“危”提示

为已支持的红、蓝、黑光攻击显示“危”字和游戏内危音效。

0.6在0.5基础上增加：
- 灭法之法·炎茹：火环、突进收招红危。
- 三号·乐师偶·玉瓒：转圈施法前置黑危和声音。

原有0.5的普通危字、音效、调度、锁定选项和全部行为不变。
不是全招覆盖，不改变攻击或招架判定。

0.6.1-dev.3仅为开发源码，尚未交付安装包：
- 修正日志摘要反复序列化与超限丢掉整份BOSS记录的问题。
- 未证明收益的过期窗口补危默认关闭，普通提示继续使用0.6主链。

新增配置
配置文件：%LOCALAPPDATA%\ProjectPBZ\Saved\PBZForewarn.txt
旧配置保留，缺少新项时使用默认值。修改后完整重启游戏。

SemanticFallback=1
灭法之法·炎茹的两条补充危。设为0关闭。

YuZanCastWarning=1
三号·乐师偶·玉瓒的转圈施法前置危。设为0关闭。

YuZanCastLeadMs=350
三号·乐师偶·玉瓒施法危的独立提前量，数值越大越早。
它参照施法资源节点，不是命中时间。

LateDodgeRecovery=0
过期窗口补危研究开关，默认关闭。实机尚未证明它有覆盖收益。
旧配置若显式写了1仍会开启；此开发版不自动覆盖用户配置。

LateDodgeRecoveryMinRemainingMs=100
补危至少要求距离游戏给出的未来命中时间还有多少毫秒。

安装
前置必须安装PBZModLoader和PBZ专用UE4SS。
推荐使用Phantom Blade Zero - Mod Manager：
https://www.nexusmods.com/phantombladezero/mods/2

管理器安装：
完全退出游戏，停用旧Forewarn/AlertCue和旧外置音效，导入
PBZForewarn-0.6.1-dev.3.zip，启用脚本、BNK音效和Hooks三部分。

手动安装：
默认PBZModLoader和UE4SS已经装好。把包内ProjectPBZ和platform
合并到游戏根目录，保留全部文件。完整重启；Alt+F9试听危音效。

卸载
管理器用户直接移除此MOD。手动用户退出游戏后只删除：
ProjectPBZ\PBZModLoader\mods\PBZForewarn
ProjectPBZ\Content\PBZForewarn
platform\steam\ue4ss\Mods\PBZForewarnHooks

源码构建
仓库和Source ZIP不含WAV、BNK或WEM。构建前自备有权使用的
js-package/PBZForewarn/cue.wav：44100Hz、双声道、16bit PCM，
时长0.01—30秒。

Python 3.12、Node.js 24，在仓库根目录运行：
  python -m pip install --target hooks-package/tests/lib -r requirements-test.txt
  python audio-bank/build_bank.py
  python verify.py --node <node.exe路径>
  python package.py

安装包输出到dist。需要源码包时运行python package.py --source。
源码、文档或音频在验证后改变，必须重跑verify.py。

来源
“危”形式参考《只狼：影逝二度》，使用PBZ字体绘制。
安装包沿用0.5的只狼危音效。相关素材权利归原权利人。
感谢PBZModLoader、UE4SS和Mod Manager作者。
