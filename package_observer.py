"""Package the isolated observation trial; never writes to the game directory."""
from pathlib import Path
import hashlib, json, shutil, zipfile

ROOT = Path(__file__).resolve().parent
VERSION = '0.6.0-observe-bounded.1'
DEST = ROOT.parents[1] / 'outputs' / ('PBZForewarn-' + VERSION)
report = json.loads((ROOT / 'verification/summary.json').read_text(encoding='utf-8'))
baseline = json.loads((ROOT / 'baseline-manifest.json').read_text(encoding='utf-8'))
assert report['version'] == VERSION and all(case['exit'] == 0 and case['checks'] for case in report['suites'])
assert hashlib.sha256(Path(baseline['publishedArchive']).read_bytes()).hexdigest() == baseline['publishedArchiveSha256']
bounded_lua = json.loads((ROOT / 'bounded-candidate-manifest.json').read_text(encoding='utf-8'))
DEST.mkdir(parents=True, exist_ok=True)
runtime = {}
prefix = 'ProjectPBZ/PBZModLoader/mods/PBZForewarn/'
for path in (ROOT / 'js-package/PBZForewarn').glob('*.js'):
    if not path.name.endswith('.test.js') and path.name != 'native-audio.js':
        runtime[prefix + path.name] = path.read_bytes()
hooks = 'platform/steam/ue4ss/Mods/PBZForewarnHooks/'
for name in ('main.lua', 'timeline-hooks.lua', 'observation-hooks.lua'):
    runtime[hooks + 'Scripts/' + name] = (ROOT / 'hooks-package' / name).read_bytes()
runtime[hooks + 'enabled.txt'] = b''
runtime['ProjectPBZ/Content/PBZForewarn/PBZForewarn.bnk'] = (ROOT / 'audio-bank/generated/PBZForewarn.bnk').read_bytes()
old = {record['path']: record['sha256'] for record in baseline['publishedFiles'] if not record['path'].lower().startswith('readme')}
changed = [name for name, data in runtime.items() if name in old and hashlib.sha256(data).hexdigest() != old[name]]
added = sorted(set(runtime) - set(old))
removed = sorted(set(old) - set(runtime))
assert sorted(changed) == sorted([prefix + 'main.js', hooks + 'Scripts/main.lua']), changed
assert added == sorted([prefix + 'native-attack-observer.js', prefix + 'observation-store.js',
                        prefix + 'timeline-observation.js', hooks + 'Scripts/observation-hooks.lua']), added
assert not removed, removed
assert hashlib.sha256(runtime[hooks + 'Scripts/observation-hooks.lua']).hexdigest() == bounded_lua['candidateSha256']
assert report['bankSha256'] == hashlib.sha256(runtime['ProjectPBZ/Content/PBZForewarn/PBZForewarn.bnk']).hexdigest()
readme = '''PBZForewarn 0.6.0-observe-bounded.1 — Lua bounded observation trial / Lua观察器限频候选

中文
这版保留0.5已验证的危字和音效，记录攻击通知和招式起播；Lua观察器使用已短测的有界查找版本。
有界Lua短测未观察到原先卡顿；完整多阶段Boss长测尚需验证。这是公开前测试候选，不是N网正式发布包。
帧生成启动仍受RTSS顺序影响；本包不修改帧生成参数或RTSS设置。

强制前置：PBZModLoader及PBZ用UE4SS。
建议使用Phantom Blade Zero - Mod Manager管理：
https://www.nexusmods.com/phantombladezero/mods/2

管理器：完全退出游戏，禁用旧Forewarn及其他B隔离版，导入本ZIP并只启用这一版本。
手动：默认已装好前置。备份旧Forewarn文件夹，将ZIP的ProjectPBZ与platform目录合并到游戏根目录。
替换Lua后必须完全重启游戏，不能只按Alt+F5。

先测熟悉的Boss，尽量覆盖多个阶段、连续招、打断和飞弹，最终正常退出，观察卡顿与预警。
若FG启动时不工作，按已验证顺序：游戏内关RTSS，点OP调试启用FG，再开RTSS；确认FG保持后再测试。
结束后告知测试结果；本包不含收集脚本，不自动上传。
记录位于 %LOCALAPPDATA%\\ProjectPBZ\\Saved\\：
  pbzforewarn_observations.json（JS观测）
  pbzforewarn_observer_hooks.json（Lua调用观测）
原来的diagnostics/resources/hooks日志也继续生成。记录有限容量，丢失与不可用状态会保留。
接口缺失时观察可能降级，不能把缺记录等同于游戏没出招。
PBZForewarn.txt中的ObserveAttacks=0可关闭新观察；Diagnostics=0也会停用。修改后完全重启。
LeadMs仍是相对原光的目标提前量；Alt+F9仍为试听。

回滚：退出游戏，禁用本版并重新启用原0.5；自己的配置可保留。
手动用户恢复备份的Forewarn与ForewarnHooks目录。不要在未退出游戏时替换。

English
This candidate keeps 0.5's validated glyph/audio and read-only attack observations,
with the bounded Lua observer that passed a short in-game test. A longer multi-phase
Boss run remains to be validated. This is a pre-release test candidate, not the Nexus build.
Requires PBZModLoader and PBZ-specific UE4SS. Mod Manager is recommended (link above).
Close the game, disable old Forewarn, import this ZIP, and enable it alone.
Manual users with both loaders installed: back up the old mod folders, then merge
ProjectPBZ and platform into the game root. Fully restart after replacing Lua.
Test a familiar Boss through multiple phases, consecutive attacks, interruption and projectiles,
then exit normally. If FG is inactive on startup, use the tested in-game sequence: RTSS off,
enable FG in the OP UI, RTSS on. Report FG, stutter and cue behavior separately.
Local files are written under %LOCALAPPDATA%\\ProjectPBZ\\Saved as listed above;
no collector, upload tool, external player, executable, or loader is bundled.
Set ObserveAttacks=0 or Diagnostics=0 and fully restart to disable observations.
To roll back, disable this trial and restore/re-enable 0.5 with the game closed.

Credits / 来源
The danger glyph/style and warning sound originate from Sekiro: Shadows Die Twice
(FromSoftware / Activision). This is an unofficial fan mod, not affiliated with them.
Runtime developed independently; other reviewed mods' code/data are not bundled.
'''
archive = DEST / ('PBZForewarn-' + VERSION + '.zip')
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name, data in sorted(runtime.items()): z.writestr(name, data)
    z.writestr('README.txt', readme.encode('utf-8-sig'))
with zipfile.ZipFile(archive) as z:
    assert set(z.namelist()) == set(runtime) | {'README.txt'}
    for name, data in runtime.items(): assert z.read(name) == data
    assert not any(name.lower().endswith(('.cmd', '.bat', '.ps1', '.exe', '.dll')) for name in z.namelist())
source = DEST / ('PBZForewarn-' + VERSION + '-Source.zip')
with zipfile.ZipFile(source, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for folder in ('js-package', 'hooks-package', 'audio-bank'):
        for path in sorted((ROOT / folder).rglob('*')):
            if not path.is_file() or any(part in ('lib', '__pycache__') for part in path.relative_to(ROOT).parts): continue
            if path.suffix.lower() in ('.pyc', '.dll', '.pyd', '.exe'): continue
            z.write(path, path.relative_to(ROOT).as_posix())
    for name in ('verify.py', 'package_observer.py', 'baseline-manifest.json'):
        z.write(ROOT / name, name)
    z.writestr('requirements-test.txt', 'lupa==2.8\n')
    z.writestr('README.txt', readme.encode('utf-8-sig'))
checks = DEST / '验证记录'
checks.mkdir(exist_ok=True)
for name in ('summary.json',) + tuple(case['name'] + '.txt' for case in report['suites']):
    shutil.copy2(ROOT / 'verification' / name, checks / name)
manifest = {'version': VERSION, 'stage': 'observation-only', 'installed': False,
    'inGameVerified': False, 'offlineChecks': report['checks'], 'baselineArchiveSha256': baseline['publishedArchiveSha256'],
    'boundedLuaCandidateSha256': bounded_lua['candidateSha256'],
    'boundedLuaShortInGameTest': 'user-reported stutter absent; longer Boss run pending',
    'runtimeFiles': len(runtime), 'changedBaselineFiles': changed, 'addedRuntimeFiles': added,
    'unchangedBaselineRuntimeFiles': len(runtime) - len(changed) - len(added),
    'unchangedAudioBankSha256': report['bankSha256'],
    'files': [{'path': name, 'sha256': hashlib.sha256(data).hexdigest()} for name, data in sorted(runtime.items())],
    'archives': [{'name': p.name, 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in (archive, source)]}
(DEST / 'PACKAGE_CHECK.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
(DEST / 'README.txt').write_text(readme, encoding='utf-8-sig')
print(json.dumps({k: manifest[k] for k in ('version','runtimeFiles','offlineChecks','changedBaselineFiles','addedRuntimeFiles','archives')}, ensure_ascii=False, indent=2))
