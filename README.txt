PBZForewarn 0.6.1-dev.5 / 只狼风格“危”提示

为已支持的红、蓝、黑光攻击显示“危”字和游戏内危音效。

0.6在0.5基础上增加：
- 灭法之法·炎茹：火环、突进收招红危。
- 三号·乐师偶·玉瓒：转圈施法前置黑危和声音。

原有0.5的普通危字、音效、调度、锁定选项和全部行为不变。
不是全招覆盖，不改变攻击或招架判定。

0.6.1-dev.5为卡顿修复测试包：
- 观察日志改为20秒独立节奏、内容未变不写；主循环不再每5秒同步序列化整份数据。
- 观察缓冲上限下调，旧明细更早让位给计数摘要。
- 0.6.1-test.2的过期窗口补危已从源码移除。
- 危字、音效、调度和炎茹/玉瓒规则逻辑未改。

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

ObservationFlushMs=20000
观察日志的最小写入间隔，5000–60000毫秒。只影响诊断文件的体积和写入频率，
不影响危字或音效时机。想记录更细可调小，嫌卡顿可调大。

安装
前置必须安装PBZModLoader和PBZ专用UE4SS。
推荐使用Phantom Blade Zero - Mod Manager：
https://www.nexusmods.com/phantombladezero/mods/2

管理器安装：
完全退出游戏，停用旧Forewarn/AlertCue和旧外置音效，导入
PBZForewarn-0.6.1-dev.5.zip，启用脚本、BNK音效和Hooks三部分。

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
