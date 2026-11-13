# Development archive / 源码包

This archive is optional and is not a second player mod. Do not copy the source archive into the game. The runtime code is frozen to the four-boss-tested release.2, identified by `evidence/release2-tested-runtime-hashes.json`.

## Requirements

Use a recent Node.js supporting the existing test code (Node24 was used), Python3.12, and `lupa==2.8` as listed in `requirements-test.txt`. The Lua test dependency is not bundled. Install development dependencies in an environment of your choice. Players need none of these tools.

## Verification and packaging

1. Supply `js-package/PBZForewarn/cue.wav` relative to the repository root. This exact 0.5 baseline is 44100 Hz, stereo, 16-bit PCM WAV, 202860 frames; SHA256 `5ad6af4e012662d527e93c3044651c278536bac5498853eead4513f77928b7e8`. Arbitrary replacement audio will fail the frozen checks.
2. Run `python -m pip install --target hooks-package/tests/lib -r requirements-test.txt` with Python 3.12. The ignored target directory matches the Lua test import paths.
3. Run `python audio-bank/build_bank.py` to generate `audio-bank/generated/PBZForewarn.bnk` and an inspection WEM.
4. Run `python verify.py --node <path-to-node.exe>`. These tests simulate UE/PuerTS/UE4SS and validate the bank; they do not start PBZ.
5. Run `python package.py` to build `PBZForewarn-0.5.zip` and `PBZForewarn-0.5-Source.zip` under `dist/` beside `package.py`. Use `python package.py --output-dir <path>` to choose another destination.
6. If you intentionally modify runtime code or audio, choose a new version and update the frozen evidence only after appropriate validation. The current release packer deliberately rejects changed runtime bytes.

The Git repository and newly built Source ZIPs exclude the WAV, BNK and WEM audio files. Existing local copies are left in place and ignored by Git. The player ZIP still contains the generated BNK; it is not an audio-free artifact. `.gitignore` alone does not control ZIP contents, so `package.py` explicitly excludes these audio files from Source ZIPs. Earlier archived ZIPs are not modified.

`audio-bank/build_bank.py` reconstructs the BNK and inspection WEM by trimming3528 frames (80ms); no Wwise authoring application is required for this format-specific script. External wwiser/vgmstream programs used for independent validation are not distributed here. The baseline BNK SHA256 is `f710b3bedad502aa2234c887da3d16630faefad13e61289ddf4b7a4e86282953`.

Player-facing documentation used by the installer is kept in `player-docs/`. Nexus/store descriptions, post copy and publication checklists under the local `publish-docs/` folder are not part of the source repository or build. `package.py` does not need an external previous player ZIP. The automated build checks use offline files only and do not install, launch or upload anything.

## Permission and limits

See `CREDITS.md` for the Sekiro warning/audio attribution and font implementation. The author's public code reuse license has not been specified; neither attribution nor providing source files grants a third-party asset license.

中文：开发验证依赖与普通玩家运行前置不同；源码包不含Python/Lua测试库或第三方解析器程序。打包器固定检查当前已测运行文件，改源码应另行验证和版本管理，不要用旧证据宣称改版也已实测。不要把本源码包当玩家安装包。

音频不随Git仓库或新生成的Source ZIP提供。请自行把与基线SHA256一致的音源放入仓库根目录下`js-package/PBZForewarn/cue.wav`，依次执行上面的依赖安装、音频生成、离线验证和打包命令。生成的BNK位于`audio-bank/generated/PBZForewarn.bnk`，只装入玩家包；已有本地音频不删除，旧归档ZIP也不会因此移除音频。任意其他WAV不能直接替代0.5基线，调整音源应作为另一个经过验证的版本。提供路径和构建说明不代表授予第三方素材使用或再分发许可。
