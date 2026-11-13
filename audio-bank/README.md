# Forewarn 独立 Wwise 音频银行

Git仓库及新生成的Source ZIP不附带WAV、BNK或WEM。先自行准备与0.5基线一致的音源，
放到仓库根目录下`js-package/PBZForewarn/cue.wav`，再于仓库根目录运行：

```powershell
python audio-bank/build_bank.py
```

输入格式为44100Hz、双声道、16bit PCM WAV、202860帧（4.6秒），
SHA256必须为`5ad6af4e012662d527e93c3044651c278536bac5498853eead4513f77928b7e8`。
当前冻结验证不接受任意替代音效。脚本输出`audio-bank/generated/PBZForewarn.bnk`
以及仅供检查的`audio-bank/generated/4275825761.wem`；二者均不提交Git。
玩家安装ZIP仍需要BNK；本地已有音频不删除，旧Source归档不因此改变。

The repository and newly built Source ZIPs exclude audio. Supply the exact baseline WAV at
`js-package/PBZForewarn/cue.wav`, then run the command above from the repository root.
The bank and inspection WEM are generated locally and ignored by Git. The player ZIP includes the bank.

`build_bank.py` 从自行提供的原 `cue.wav` 构造 `generated/PBZForewarn.bnk`。
fix7只去掉开头80ms近静音（3528帧），可播放部分为199332帧（4.52秒）。
44100Hz、双声道、16bit不变；余下PCM与原文件后缀逐字节一致，没有变速、变调、
重采样、额外PCM增益或淡入淡出。自行提供的原202860帧（4.6秒）WAV在本地保持原样，SHA-256不变。
构建时确认被移除的前缀峰值不超过32/32768，避免错误裁去有声起始。
WAV 容器改成 Wwise PCM RIFF；只构造三个独立对象：Event → PlayAction → Sound。
媒体内嵌 DIDX/DATA，不需要额外 WEM，也不覆盖游戏原音频或 Gold 的资源。

银行格式 version 154、Event bank type 30、project 13320、SFX language 393239870
来自本游戏已使用的银行兼容信息。输出总线 2463295413 是原预警声音容器引用的现有总线；
本银行仅引用，不定义或修改该总线。无衰减、空间化、效果器、状态或 RTPC。
trial.6已由用户确认战斗声音问题解决。fix7继续保持本音效Volume=+6dB，
Priority=100并覆盖父级优先级，只移除前导近静音。独立wwiser解析确认属性值。
较高优先级用于繁忙时保护预警声部，不代表已经证明上一版被其他声部抢占。
总线是否受游戏SFX音量控制，以及本次裁掉前导近静音后的战斗听感，仍需实机验证。

所有新对象 ID 由 `PBZForewarn_..._0504` 名称独立计算：

- Event / bank：1682749338
- Play action：183325257
- Sound：2806747881
- Media：4275825761

与已分析 Gold 音频银行中 27 个不同 HIRC ID 对比，无冲突；未扫描本体全部加密银行，
不能据此声称已排除全游戏 ID 冲突。

验证：

- `test_bank.py`检查银行边界、对象引用、媒体对齐、裁剪量、静音前缀与原音频后缀逐字节一致。
- 开发时由独立开源解析器 wwiser v20260808 完整解析无错误；`generated/parser.txt`是本地检查输出，不随Git仓库提供。
- vgmstream CLI r2168-26-g68021534将WEM解码为PCM，与原WAV移除3528帧后的PCM逐字节一致。
- 第三方工具只在开发 scratch 目录运行，不随安装包或源码包分发。

这些结果证明格式可解析且裁剪内容正确，不代替本次前导静音裁剪的PBZ战斗听感测试。
