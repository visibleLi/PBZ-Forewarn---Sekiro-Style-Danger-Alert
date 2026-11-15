PBZForewarn 0.6.1-dev.1

Shows the “危” glyph and in-game warning sound for supported red, blue and black attacks.

0.6 adds:
- Acolyte Yanru: red danger cues for the fire-ring and assault-end moves.
- No. 3 Musician Puppet: a black warning and sound before the spinning cast.

All ordinary 0.5 warnings, audio, scheduling, lock options and existing behavior remain unchanged.
This is not full-move coverage and does not change attacks or parry rules.

NEW SETTINGS
Settings file: %LOCALAPPDATA%\ProjectPBZ\Saved\PBZForewarn.txt
Existing values are kept; missing keys use defaults. Fully restart after changes.

SemanticFallback=1
Acolyte Yanru's two supplementary warnings. Set to 0 to disable.

YuZanCastWarning=1
No. 3 Musician Puppet's cast warning. Set to 0 to disable.

YuZanCastLeadMs=350
Independent lead for that cast warning. Higher values fire earlier.
It targets the cast resource marker, not impact time.

INSTALLATION
PBZModLoader and PBZ-specific UE4SS are required.
Recommended Phantom Blade Zero - Mod Manager:
https://www.nexusmods.com/phantombladezero/mods/2

Manager:
Close the game, disable older Forewarn/AlertCue and external warning sounds,
import PBZForewarn-0.6.1-dev.1.zip, and enable scripts, BNK audio and Hooks.

Manual:
With PBZModLoader and UE4SS already installed, merge ProjectPBZ and platform
into the game root and keep every file. Fully restart; Alt+F9 previews the sound.

UNINSTALL
Remove the mod in Manager, or delete only these folders:
ProjectPBZ\PBZModLoader\mods\PBZForewarn
ProjectPBZ\Content\PBZForewarn
platform\steam\ue4ss\Mods\PBZForewarnHooks

BUILD FROM SOURCE
The repository and Source ZIP exclude WAV, BNK and WEM files. Supply audio you
have rights to use at js-package/PBZForewarn/cue.wav: 44100 Hz stereo,
16-bit PCM, 0.01–30 seconds.

With Python 3.12 and Node.js 24, run from the repository root:
  python -m pip install --target hooks-package/tests/lib -r requirements-test.txt
  python audio-bank/build_bank.py
  python verify.py --node <path-to-node.exe>
  python package.py

The installer is written to dist. Add --source to create the source archive.
Rerun verify.py after changing source, documentation or audio.

CREDITS
The “危” style is inspired by Sekiro: Shadows Die Twice and drawn with PBZ's font.
The installer uses the same warning sound as 0.5. Third-party rights remain with their owners.
Thanks to the PBZModLoader, UE4SS and Mod Manager authors.
