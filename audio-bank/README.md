# Forewarn Wwise bank

Git and Source ZIPs exclude WAV/BNK/WEM. Supply audio you have rights to use at
`js-package/PBZForewarn/cue.wav`: uncompressed 44100 Hz stereo 16-bit PCM, 0.01–30 seconds.
Run `python audio-bank/build_bank.py` from the source root.

The original 0.5 WAV SHA256 is `5ad6af4e012662d527e93c3044651c278536bac5498853eead4513f77928b7e8`.
It identifies the original input; other valid audio is accepted. Original audio receives its verified
80 ms silent-prefix trim (3528 frames), leaving 199332 frames / 4.52 s. Custom audio is untrimmed
unless `--trim-start-ms N` explicitly requests a checked silent prefix. Clipping checks still apply.

Generated output: `audio-bank/generated/PBZForewarn.bnk`, matching `wwise-bank-config.js`, manifest
and an inspection WEM. The WEM is embedded in the bank and is not separately installed.
The installer includes the BNK and config, no source WAV. No game's bank is replaced.

The bank uses version 154 and a dedicated Event → PlayAction → Sound chain, the existing game bus
2463295413, +6 dB authored gain and priority 100. Runtime playback is Wwise (`wwise-audio.js`).
This trial retains the original 0.5 bank when built from that input, SHA256:
`f710b3bedad502aa2234c887da3d16630faefad13e61289ddf4b7a4e86282953`.

`test_bank.py` checks structure, references, timing config and PCM content. Historical independent
wwiser/vgmstream checks parsed and decoded the original bank. Those tools are not distributed.
Local output, clipping safety and mock playback do not certify arbitrary custom audio in-game.
All third-party rights remain with their owners.
