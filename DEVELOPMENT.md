# Build PBZForewarn 0.5

## Requirements

- Python 3.12
- Node.js 24
- `lupa==2.8` for Lua tests
- A locally supplied, legally obtained warning sound WAV at `js-package/PBZForewarn/cue.wav`

The audio is deliberately excluded from Git and Source ZIPs. This does not grant rights to Sekiro assets. The original 0.5 sound hash is `5ad6af4e012662d527e93c3044651c278536bac5498853eead4513f77928b7e8`; it is not a universal build requirement. Any supported custom sound creates a custom, untested build.

Supported input: uncompressed 44100 Hz stereo 16-bit PCM WAV, 0.01 to 30 seconds. Audio is checked for clipping after the bank gain and default volume. Non-baseline audio receives no automatic silence trim; use `--trim-start-ms N` only when the leading samples are verified silence.

## Build and check

Run from the repository root in PowerShell or Git Bash:

```text
python -m pip install --target hooks-package/tests/lib -r requirements-test.txt
python audio-bank/build_bank.py
python verify.py --node <path-to-node>
python package.py
```

The default package command creates only `dist/PBZForewarn-0.5.zip`. The installer contains the `ProjectPBZ/` and `platform/` runtime trees plus one bilingual `README.txt`. `PACKAGE_CHECK.json` is a separate build report.

To also create an audio-free source archive, pass `--source`. To explicitly check the original 0.5 runtime, pass `--check-baseline` to both `verify.py` and `package.py`. Custom audio or runtime changes cannot inherit the original four-Boss in-game test claim.

Build outputs, verification snapshots, generated bank files and personal release notes remain local and are ignored by Git. The original runtime hash manifest is retained in `evidence/` as the optional baseline check.
