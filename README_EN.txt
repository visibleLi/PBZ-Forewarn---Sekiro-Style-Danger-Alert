PBZForewarn 0.5
Peril Glyph and In-Game Warning Audio
Runtime: 0.5.0-release.2

DESCRIPTION

Adds a colored “危” danger glyph and a warning sound for supported red, blue and black attacks. Original warning effects, attack timing and parry windows stay unchanged. Black warnings use charcoal text with a light outline.

The default target lead is 350 ms. Short attacks may provide less lead or a slightly late reminder. Attacks that are cancelled or switched withdraw their warning.

SOURCE REPOSITORY / AUDIO INPUT

The Git source repository excludes cue.wav, PBZForewarn.bnk and generated WEM files.
Existing local copies are kept but must not be committed. Supply audio you have rights to use at:
  js-package/PBZForewarn/cue.wav
Format: uncompressed 44100 Hz stereo 16-bit PCM WAV, 0.01 to 30 seconds.
The original 0.5 hash is 5ad6af4e012662d527e93c3044651c278536bac5498853eead4513f77928b7e8;
it identifies the baseline, not a universal build requirement. Other valid audio
produces a custom build without the original in-game test claim.
Original 0.5 audio trims its verified silent first 80 ms; custom audio is untrimmed
by default. Use --trim-start-ms N only for verified leading silence.
With Python 3.12 and Node.js 24 available, run from the repository root:
  python -m pip install --target hooks-package/tests/lib -r requirements-test.txt
  python audio-bank/build_bank.py
  python verify.py --node <actual-path-to-node.exe>
  python package.py
By default the installer is dist/PBZForewarn-0.5.zip for the exact original baseline,
or PBZForewarn-custom.zip for custom builds. Each contains only ProjectPBZ, platform
and a short bilingual README. Use --source to also create a source archive.
Bank and runtime duration configuration are generated together. Changing source or
audio after verification requires rerunning verify.py. Exact original hashes are
optional via --check-baseline on verify.py and package.py. See DEVELOPMENT.md.
Providing your own audio does not grant rights to third-party assets.

PLAYER REQUIREMENTS

Both PBZModLoader and UE4SS are mandatory. Tested versions:
- PBZModLoader 2.1.0:
  https://github.com/KintaroModding/phantombladezero_pbzmodloader/releases/tag/v2.1.0
- PBZ-specific UE4SS v3.0.1-1195-g1ceefac8:
  Nexus page for the same release line: https://www.nexusmods.com/phantombladezero/mods/13
  https://github.com/KintaroModding/ue4ss/releases/tag/v3.0.1-1195-g1ceefac8

These exact versions were tested with this mod and can also be installed manually. The custom UE4SS package at Nexus mods/5 and original PBZModLoader1.0.2 at mods/113 have not been tested as a Forewarn combination. Do not stack two editions of either loader.

Recommended: Phantom Blade Zero - Mod Manager to install/manage the requirements and this mod:
https://www.nexusmods.com/phantombladezero/mods/2

INSTALL WITH MOD MANAGER

1. Close the game. Use Mod Manager to install PBZModLoader and UE4SS.
2. Disable older Forewarn, AlertCue and external cue-player packages.
3. Import PBZForewarn-0.5.zip and enable all three parts: Forewarn scripts, Forewarn.bnk and ForewarnHooks.
4. Restart the game fully. In a controllable scene, hold Alt and press F9 to preview sound.

MANUAL INSTALL

PBZModLoader and UE4SS must already be installed.

1. Close the game and extract PBZForewarn-0.5.zip.
2. Copy ProjectPBZ and platform into the game root, the folder containing those two directories. Merge the folders; do not add an enclosing folder.
3. Restart fully and test Alt+F9. Keep every script module; do not put the BNK in Paks/~mods.

SETTINGS

First launch creates:
%LOCALAPPDATA%/ProjectPBZ/Saved/PBZForewarn.txt

LeadMs=350 sets the target lead. SoundVolume=0.8 adjusts this mod’s audio (0–2). OnlyLockedTarget=0 supports unlocked play; 1 requires a confirmed lock. Existing settings are preserved. Restart after editing; changing Lua/audio files always requires a full restart.

REMOVE / NOTES

Close the game. Remove this package with Mod Manager, or delete only:
ProjectPBZ/PBZModLoader/mods/PBZForewarn
ProjectPBZ/Content/PBZForewarn
platform/steam/ue4ss/Mods/PBZForewarnHooks

Keep shared loaders. Do not run multiple extra-warning mods together.
Tested on Windows / Steam build 26367565 with four bosses. All-move coverage, WeGame and locked-only mode are not fully validated. No automatic parry or counterattack is included. PBZForewarn-0.5-Source.zip is optional developer source, not another required install.

LOGS / FEEDBACK

Logs are automatic. After reproducing a problem, copy these files and include the boss, move and approximate time:
%LOCALAPPDATA%/ProjectPBZ/Saved/pbzforewarn_diagnostics.json
%LOCALAPPDATA%/ProjectPBZ/Saved/pbzforewarn_resources.json
%LOCALAPPDATA%/ProjectPBZ/Saved/pbzforewarn_hooks.json
<game root>/ProjectPBZ/PBZModLoader/loader.log
<game root>/platform/steam/ue4ss/UE4SS.log

New starts/reloads replace snapshots. Review local paths before sharing; nothing is uploaded automatically.

CREDITS

The “危” presentation is inspired by Sekiro: Shadows Die Twice; the warning sound is sourced from that game (FromSoftware). The glyph uses PBZ’s in-game font; no original Sekiro UI animation was imported.
Thanks to PBZModLoader, UE4SS and Mod Manager authors. AI assisted research, coding, debugging and documentation.
