# Phantom Blade Zero / PBZForewarn modding plan

## Fingerprint

- Game: *Phantom Blade Zero*, Steam app `4115450`.
- Install: `D:\steam\steamapps\common\PBZ`.
- Shipping process: `platform\steam\PBZ.exe`, product version
  `CL-302256_JKS-17280`, 498,913,272 bytes.
- Engine: Unreal Engine `5.7`, Shipping x64. UE4SS detected this directly from the live
  executable; this is stronger evidence than a folder name or store metadata.
- Code model: native shipping engine with game logic in Puerts JavaScript under
  `ProjectPBZ\Content\JavaScript`, plus a UE4SS Lua/reflection surface.
- Network / protection: single-player. Steam does not list an anti-cheat. The Steam
  executable is Denuvo-protected; the tested route leaves the executable untouched and
  loads community tools through proxy DLLs beside it.

## Current project architecture

| Layer | Role | Location |
|---|---|---|
| PBZModLoader | Native bootstrap for game JavaScript and module discovery | `ProjectPBZ\PBZModLoader` |
| Puerts JavaScript | Attack/resource scanning, scheduling, HUD, Wwise playback | `ProjectPBZ\PBZModLoader\mods\PBZForewarn` |
| UE4SS Lua | Optional native function hooks and read-only evidence | `platform\steam\ue4ss\Mods\PBZForewarnHooks` |
| Wwise BNK | Packaged warning sound loaded by the game's Wwise integration | `ProjectPBZ\Content\PBZForewarn` |
| Python tooling | Generate BNK, validate source, package reproducible ZIPs | repository root and `audio-bank` |

The repository has no C++ source, Visual Studio project, CMake project, or compiled
plugin of its own. Its runtime is JavaScript plus Lua; the Python files are build and
test tooling.

## Working loader chain

- PBZModLoader `2.1.0`.
- PBZ-specific UE4SS `v3.0.1-1195-g1ceefac8`; the live log reports
  `v3.0.1 Beta #0 - Git SHA #1ceefac8`.
- `PBZ.exe` is reached through `version.dll`; UE4SS is reached through `dwmapi.dll`.
- PBZModLoader's log confirms `script validation adapters installed`, embedded
  bootstrap execution, `changed game scripts=allowed`, and loading the Forewarn
  JavaScript module.
- UE4SS registers the Forewarn Lua hooks for
  `/Script/LegoAbility.LegoAbility:PlayTimeline` and `PlayTimelineByName`.
- Forewarn JavaScript starts before native task discovery and remains responsible for
  warning decisions and Wwise playback.

## Logs and runtime data

- PBZModLoader: `ProjectPBZ\PBZModLoader\loader.log`.
- UE4SS: `platform\steam\ue4ss\UE4SS.log`.
- Forewarn snapshots: `%LOCALAPPDATA%\ProjectPBZ\Saved\pbzforewarn_*.json`.
- Configuration: `%LOCALAPPDATA%\ProjectPBZ\Saved\PBZForewarn.txt`.
- Game saves: under `ProjectPBZ\Saved\SaveGames\Steam\<steamid64>`, not the usual
  `%LOCALAPPDATA%` Unreal location. Back these up before gameplay-mod experiments.

## Recommended route for PBZForewarn

Use **PBZModLoader + Puerts JavaScript as the primary route**, with **UE4SS Lua as the
low-level observation layer**.

1. Keep gameplay recognition, timing, scheduling, glyph rendering and Wwise playback in
   JavaScript. This is the narrowest layer that can make warning decisions while
   reusing the game's loaded assets and audio system.
2. Use Lua only for events JavaScript cannot see reliably: native timeline calls,
   function entry/exit, and read-only capture of action/task relationships.
3. Pass observations from Lua to JavaScript through a bounded JSON snapshot. The
   JavaScript side must retain final authority over whether a cue is emitted.
4. Keep the Wwise event bank as an independent asset with its own stable event ID. Do
   not replace a game bank or copy game audio into the mod.
5. Treat the normal attack warning resource as the preferred trigger. Add narrowly
   scoped semantic rules only when a live execution has an unambiguous actor, ability,
   action, timing and warning path.
6. For multi-stage attacks, model the phase explicitly. YuZan's cast is
   `GA_YuZan_Skill_03_C.Main`; its black warning belongs to a later
   `GA_YuZan_Skill_03_A_R_Start_C.Success` branch. A single global lead value cannot
   turn a post-control execution warning into a pre-cast warning.

This route avoids pak replacement, keeps compatibility with model and texture mods,
and allows fast iteration without recompiling native code.

## Alternative routes

| Route | Use when | Tradeoff |
|---|---|---|
| JS-only | All needed data is already visible through Puerts or PBZModLoader hooks | Simplest distribution; misses some native callbacks |
| Lua-only | A warning can be derived entirely from UE4SS UFunction hooks | No JavaScript/PBZModLoader dependency; weaker asset and Wwise integration |
| Pak / asset replacement | A static UI, animation or asset value is the real target | Requires matching UE5.7 cooking; breaks across updates; conflicts with other paks |
| UE4SS C++ mod | A proven native callback or hot-path operation is unavailable in JS and Lua, and profiling shows Lua is unsuitable | Hardest ABI, build and support burden; justified only by a measured gap |

Native C++ is the last resort, not the default. The current JavaScript and Lua layers
already reach the live task, action, resource, timing and Wwise APIs needed by this
mod. Moving a working path to C++ would add version-specific signatures and binary
compatibility work without proving better detection.

## Safe lab plan

- Back up `ProjectPBZ\Saved\SaveGames\Steam\<steamid64>` and
  `%LOCALAPPDATA%\ProjectPBZ\Saved` before save-affecting experiments.
- Prefer a separate Mod Manager profile with only PBZModLoader, UE4SS and the candidate
  Forewarn package enabled.
- Preserve `loader.log`, `UE4SS.log`, and the five `pbzforewarn_*.json` snapshots before
  another launch overwrites them.
- Use repeatable Boss Rush encounters where possible. Record boss, action, phase,
  cancellation and whether the player was hit.
- Validate offline first, then test one boss and one scenario per change.
- Never use a global `LeadMs` increase to mask a structurally late trigger.

## Unknowns to resolve before adding more gameplay rules

- Which warning resources are shared by several attacks versus unique to one action?
- For each candidate, does the resource precede the dangerous phase, or only decorate
  a branch that runs after the player is already controlled?
- Can the cast phase be distinguished from harmless spell setup across more enemies?
- Does the same semantic rule survive enemy phase transitions and repeated activations?
- Is any desired signal unavailable through both Puerts and UE4SS? Only that measured
  gap can justify native C++.

## Sources

- Live install, executable metadata, `UE4SS.log`, and `loader.log` on this machine.
- Repository `README.txt`, `DEVELOPMENT.md`, JavaScript modules, Lua hooks and tests.
- Universal Modder field note:
  `knowledge/games/phantom-blade-zero/hold-start-hud-toggle-and-per-group-combat-vfx-switches-ue4s.md`.
- Universal Modder Unreal playbook and safety rules.
