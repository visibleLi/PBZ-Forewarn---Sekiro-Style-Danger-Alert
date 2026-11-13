"""Build the observation candidate in outputs; never install or modify the game."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent
VERSION = '0.6.0-observe-bounded.2'
DEST = ROOT.parents[1] / 'outputs' / ('PBZForewarn-' + VERSION)
PREVIOUS = ROOT.parents[1] / 'outputs/PBZForewarn-0.6.0-observe-bounded.1/PBZForewarn-0.6.0-observe-bounded.1.zip'
sha = lambda data: hashlib.sha256(data).hexdigest()
report = json.loads((ROOT / 'verification/summary.json').read_text(encoding='utf-8'))
baseline = json.loads((ROOT / 'baseline-manifest.json').read_text(encoding='utf-8'))
replay = json.loads((ROOT / 'verification/observation-store-real-longrun-replay.json').read_text(encoding='utf-8'))
assert report['version'] == VERSION
assert replay['candidateSourceSha256'] == sha((ROOT / 'js-package/PBZForewarn/observation-store.js').read_bytes())
assert replay['candidate']['keyEvidence'] == replay['input']['keyEvidence']
assert replay['candidate']['retention']['bytes'] <= replay['candidate']['retention']['maxBytes']
assert all(suite['exit'] == 0 and suite['checks'] for suite in report['suites'])
assert sha(Path(baseline['publishedArchive']).read_bytes()) == baseline['publishedArchiveSha256']
assert sha(PREVIOUS.read_bytes()) == 'd38baf647b7ee87906625b8580c07f105d2f635e8d1fee6fa22d7d7410a9fd81'
runtime = {}
js = 'ProjectPBZ/PBZModLoader/mods/PBZForewarn/'
lua = 'platform/steam/ue4ss/Mods/PBZForewarnHooks/'
for path in (ROOT / 'js-package/PBZForewarn').glob('*.js'):
    if not path.name.endswith('.test.js') and path.name != 'native-audio.js':
        runtime[js + path.name] = path.read_bytes()
for name in ('main.lua', 'timeline-hooks.lua', 'observation-hooks.lua'):
    runtime[lua + 'Scripts/' + name] = (ROOT / 'hooks-package' / name).read_bytes()
runtime[lua + 'enabled.txt'] = b''
runtime['ProjectPBZ/Content/PBZForewarn/PBZForewarn.bnk'] = (ROOT / 'audio-bank/generated/PBZForewarn.bnk').read_bytes()
old = {r['path']: r['sha256'] for r in baseline['publishedFiles'] if not r['path'].lower().startswith('readme')}
changed = sorted(name for name, data in runtime.items() if name in old and sha(data) != old[name])
added = sorted(set(runtime) - set(old))
assert changed == sorted([js + 'main.js', lua + 'Scripts/main.lua'])
assert added == sorted([js + 'native-attack-observer.js', js + 'observation-store.js', js + 'timeline-observation.js', lua + 'Scripts/observation-hooks.lua'])
assert not (set(old) - set(runtime))
assert report['bankSha256'] == sha(runtime['ProjectPBZ/Content/PBZForewarn/PBZForewarn.bnk'])
with zipfile.ZipFile(PREVIOUS) as z:
    previous_changed = sorted(name for name, data in runtime.items() if z.read(name) != data)
assert previous_changed == sorted([js + 'main.js', js + 'native-attack-observer.js', js + 'observation-store.js',
    js + 'timeline-observation.js', lua + 'Scripts/main.lua', lua + 'Scripts/observation-hooks.lua'])
for name in (js + 'main.js', lua + 'Scripts/main.lua', lua + 'Scripts/observation-hooks.lua'):
    assert VERSION.encode() in runtime[name], name
readme = (ROOT / 'README.txt').read_bytes()
assert VERSION.encode() in readme
DEST.mkdir(parents=True, exist_ok=True)
archive = DEST / ('PBZForewarn-' + VERSION + '.zip')
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name, data in sorted(runtime.items()): z.writestr(name, data)
    z.writestr('README.txt', readme)
with zipfile.ZipFile(archive) as z:
    assert set(z.namelist()) == set(runtime) | {'README.txt'}
    for name, data in runtime.items(): assert z.read(name) == data
    assert not any(name.lower().endswith(('.cmd', '.bat', '.ps1', '.exe', '.dll')) for name in z.namelist())
source = DEST / ('PBZForewarn-' + VERSION + '-Source.zip')
with zipfile.ZipFile(source, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for folder in ('js-package', 'hooks-package', 'audio-bank'):
        for path in sorted((ROOT / folder).rglob('*')):
            if not path.is_file() or any(p in ('lib', '__pycache__') for p in path.relative_to(ROOT).parts): continue
            if path.suffix.lower() in ('.pyc', '.dll', '.pyd', '.exe'): continue
            z.write(path, path.relative_to(ROOT).as_posix())
    for name in ('verify.py', 'package_observer.py', 'baseline-manifest.json', 'README.txt'):
        z.write(ROOT / name, name)
    z.writestr('requirements-test.txt', 'lupa==2.8\n')
    z.writestr('BUILD.txt', 'Tests require Node.js, Python 3.12 and lupa 2.8. Install lupa into hooks-package/tests/lib.\n'
        'verify.py --node PATH runs mocked checks. observation-store.replay.js accepts a local capture directory; raw user captures are not bundled.\n'
        'Packaging additionally needs the preserved 0.5-preview and observe-bounded.1 archives and the local replay report.\n')
checks = DEST / '验证记录'
checks.mkdir(exist_ok=True)
for name in ('summary.json', 'observation-store-real-longrun-replay.json') + tuple(s['name'] + '.txt' for s in report['suites']):
    shutil.copy2(ROOT / 'verification' / name, checks / name)
manifest = dict(version=VERSION, stage='observation-only', installed=False, inGameVerified=False,
    offlineChecks=report['checks'], previousVersion='0.6.0-observe-bounded.1',
    previousLongInGameTestMinutes=138.7196, previousArchiveSha256=sha(PREVIOUS.read_bytes()),
    baselineArchiveSha256=baseline['publishedArchiveSha256'], runtimeFiles=len(runtime),
    changedBaselineFiles=changed, addedRuntimeFiles=added, changedPreviousRuntimeFiles=previous_changed,
    unchangedBaselineRuntimeFiles=len(runtime) - len(changed) - len(added),
    unchangedAudioBankSha256=report['bankSha256'],
    newLuaSha256=sha(runtime[lua + 'Scripts/observation-hooks.lua']),
    scope='Read-only observations; original scheduling, recognition, glyph and Wwise playback logic retained. New candidate has no in-game verification.',
    localReplayReport='验证记录/observation-store-real-longrun-replay.json',
    files=[dict(path=name, sha256=sha(data)) for name, data in sorted(runtime.items())],
    archives=[dict(name=p.name, bytes=p.stat().st_size, sha256=sha(p.read_bytes())) for p in (archive, source)])
(DEST / 'PACKAGE_CHECK.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
shutil.copy2(ROOT / 'README.txt', DEST / 'README.txt')
print(json.dumps({k: manifest[k] for k in ('version', 'runtimeFiles', 'offlineChecks', 'changedPreviousRuntimeFiles', 'archives')}, ensure_ascii=False, indent=2))
