PBZForewarn 0.6.0-trial.1

Adds coloured “危” glyphs and in-game Wwise audio for supported red, blue and black warnings.
This trial keeps the 0.5 scheduling, presentation and audio modules, adds bounded.2 observation,
and tries two scoped QiShu_Huo red rules: fire ring and assault end.
Captured plans contain RedEye=3, but the old warning-resource recognizer did not schedule them.
The new rules check actor, ability, action class and unambiguous type. They do not enable all RedEye attacks.
A standard warning takes precedence on the same node. Switching that node's source keeps its identity.
Distinct nodes are not merged merely by colour or nearby timing. This trial still needs in-game testing.

Requirements and installation
PBZModLoader and PBZ-specific UE4SS are mandatory. The 0.5 tested versions were PBZModLoader 2.1.0
and PBZ-specific UE4SS v3.0.1-1195-g1ceefac8. Other distributions need separate validation.
Recommended Mod Manager: https://www.nexusmods.com/phantombladezero/mods/2
UE4SS release page: https://www.nexusmods.com/phantombladezero/mods/13
Manager: close the game, disable old Forewarn/AlertCue and external players, import the installer ZIP,
and enable all three parts (scripts, bank, Hooks).
Manual: with prerequisites already installed, merge ProjectPBZ and platform into the game root.
Keep every file. Fully restart; Alt+F5 does not reload Lua/audio. Alt+F9 previews the warning sound.

Settings
%LOCALAPPDATA%/ProjectPBZ/Saved/PBZForewarn.txt. Existing values stay; missing keys use defaults.
LeadMs=350 requests earlier notice relative to the original warning node, or action-plan start for the supplement.
Larger values request earlier cues; no guaranteed lead before impact or full coverage is claimed.
SemanticFallback=0 disables the two new rules, leaving the observation version's normal cue path.
OnlyLockedTarget=1 requires a confirmed lock; 0 supports unlocked play. SoundVolume is local volume (0–2).
ObserveAttacks and Diagnostics enable bounded read-only evidence. Restart after edits.
To return to the released 0.5 build, remove this trial and reinstall the original package.

Build from source
Git and Source ZIPs exclude WAV/BNK/WEM. Supply audio you have rights to use at
js-package/PBZForewarn/cue.wav: uncompressed 44100 Hz stereo 16-bit PCM, 0.01–30 seconds.
Only original 0.5 audio gets its verified 80 ms silence trim automatically; custom audio stays untrimmed.
Using Python 3.12 and Node.js 24, run from the source root:
  python -m pip install --target hooks-package/tests/lib -r requirements-test.txt
  python audio-bank/build_bank.py
  python verify.py --node <path-to-node-or-node-on-PATH>
  python package.py
Default output: dist/PBZForewarn-0.6.0-trial.1.zip. Add --source to also create an audio-free Source ZIP.
Only ProjectPBZ, platform and one bilingual README are installed. PACKAGE_CHECK.json stays outside the ZIP.
Edits to source, docs or audio invalidate verification. See DEVELOPMENT.md for the full workflow.

Validation and feedback
0.5 had a four-boss Steam build26367565 test. This does not validate the new trial or its lead times.
The captured build is metadata, not an enforced version lock. Full coverage, WeGame and locked-only mode remain unvalidated.
After reproduction, preserve the five pbzforewarn_*.json snapshots in Saved, loader.log and UE4SS.log,
plus the boss/move/time. New starts/reloads replace snapshots. No automatic upload occurs.

Uninstall and credits
Remove with Manager, or delete only ProjectPBZ/PBZModLoader/mods/PBZForewarn,
ProjectPBZ/Content/PBZForewarn and platform/steam/ue4ss/Mods/PBZForewarnHooks.
Keep shared loaders and saves. Avoid simultaneous extra-warning mods.
The “危” style is inspired by Sekiro: Shadows Die Twice, using PBZ's font without imported UI animation.
The local installer retains the 0.5 Sekiro warning sound. Third-party rights remain with their owners.
Source archives contain no audio. Thanks to loader/manager authors; AI assisted analysis and development.
