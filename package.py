from pathlib import Path
import argparse
import hashlib
import json
import zipfile

from build_state import validated_inputs


ROOT = Path(__file__).resolve().parent
VERSION = '0.5.0-release.2'
parser = argparse.ArgumentParser(description='Build the Forewarn installer; source archive is opt-in.')
parser.add_argument('--output-dir', type=Path, default=ROOT / 'dist')
parser.add_argument('--source', action='store_true', help='also generate an audio-free source archive')
parser.add_argument('--check-baseline', action='store_true', help='require byte-identical original 0.5 runtime')
args = parser.parse_args()
destination = args.output_dir.expanduser().resolve()

report_path = ROOT / 'verification/summary.json'
if not report_path.is_file():
    raise SystemExit('Run python verify.py --node <node-path> before packaging.')
report = json.loads(report_path.read_text(encoding='utf8'))
if report.get('version') != VERSION or not report.get('suites') or any(
        suite.get('exit') != 0 or not suite.get('checks') for suite in report['suites']):
    raise SystemExit('Validation is missing or failed. Run verify.py again.')
try:
    current_inputs = validated_inputs(ROOT)
except FileNotFoundError as error:
    raise SystemExit('Build input missing; generate the bank and run verify.py again: ' + str(error))
if report.get('validatedInputs') != current_inputs:
    raise SystemExit('Source, audio or build scripts changed after validation. Run verify.py again.')

runtime = {}
scripts_prefix = 'ProjectPBZ/PBZModLoader/mods/PBZForewarn/'
for script_path in sorted((ROOT / 'js-package/PBZForewarn').glob('*.js')):
    if script_path.name.endswith('.test.js') or script_path.name == 'native-audio.js':
        continue
    runtime[scripts_prefix + script_path.name] = script_path.read_bytes()
runtime[scripts_prefix + 'wwise-bank-config.js'] = (ROOT / 'audio-bank/generated/wwise-bank-config.js').read_bytes()
runtime['ProjectPBZ/Content/PBZForewarn/PBZForewarn.bnk'] = (ROOT / 'audio-bank/generated/PBZForewarn.bnk').read_bytes()
hooks_prefix = 'platform/steam/ue4ss/Mods/PBZForewarnHooks/'
for script_name in ('main.lua', 'timeline-hooks.lua'):
    runtime[hooks_prefix + 'Scripts/' + script_name] = (ROOT / 'hooks-package' / script_name).read_bytes()
runtime[hooks_prefix + 'enabled.txt'] = b''

frozen = json.loads((ROOT / 'evidence/release2-tested-runtime-hashes.json').read_text(encoding='utf8'))
runtime_hashes = {name: hashlib.sha256(data).hexdigest() for name, data in runtime.items()}
matches_baseline = runtime_hashes == frozen
if args.check_baseline and not matches_baseline:
    raise SystemExit('This is a custom build; runtime hashes differ from the original 0.5 baseline.')

bank_manifest = json.loads((ROOT / 'audio-bank/generated/manifest.json').read_text(encoding='utf8'))
player_readme = (ROOT / 'player-docs/README.txt').read_text(encoding='utf-8-sig')
if not matches_baseline:
    player_readme = '''CUSTOM BUILD / 自行构建版
Runtime, audio or configuration differs from the tested 0.5 release.
运行文件、音源或配置与已测0.5不同；离线检查不等于实机验证。

''' + player_readme
files = dict(runtime)
files['README.txt'] = (chr(0xfeff) + (chr(13) + chr(10)).join(player_readme.splitlines()) + chr(13) + chr(10)).encode('utf8')
destination.mkdir(parents=True, exist_ok=True)
installer_name = 'PBZForewarn-0.5.zip' if matches_baseline else 'PBZForewarn-custom.zip'
installer = destination / installer_name
with zipfile.ZipFile(installer, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, data in sorted(files.items()):
        archive.writestr(name, data)
with zipfile.ZipFile(installer) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == set(files)
    assert {name.split('/')[0] for name in archive.namelist()} == {'ProjectPBZ', 'platform', 'README.txt'}
    for name, data in files.items():
        assert archive.read(name) == data

outputs = [installer]
if args.source:
    source = destination / 'PBZForewarn-0.5-Source.zip'
    excluded_names = {'results.json', 'launcher-results.json', 'entry-results.json', 'observer-results.json'}
    with zipfile.ZipFile(source, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for folder in ('js-package', 'hooks-package', 'audio-bank', 'player-docs', 'tests'):
            for source_path in sorted((ROOT / folder).rglob('*')):
                relative = source_path.relative_to(ROOT)
                if not source_path.is_file() or any(part in ('lib', '__pycache__', 'generated') for part in relative.parts):
                    continue
                if folder == 'player-docs' and relative.as_posix() != 'player-docs/README.txt':
                    continue
                if source_path.suffix.lower() in ('.wav', '.bnk', '.wem', '.exe', '.dll', '.pyd', '.pyc', '.log'):
                    continue
                if source_path.name in excluded_names:
                    continue
                archive.write(source_path, relative.as_posix())
        for name in ('package.py', 'verify.py', 'build_state.py', 'Run-Checks.ps1', 'requirements-test.txt',
                     '.gitignore', '.gitattributes', 'README.txt', 'README_EN.txt', 'DEVELOPMENT.md',
                     'CREDITS.md', 'CHANGELOG.txt', 'VALIDATION.md',
                     'evidence/release2-tested-runtime-hashes.json'):
            archive.write(ROOT / name, name)
    with zipfile.ZipFile(source) as archive:
        assert archive.testzip() is None
        assert not any(name.lower().endswith(('.wav', '.bnk', '.wem')) for name in archive.namelist())
    outputs.append(source)

validation = {'runtimeVersion': VERSION, 'runtimeFiles': len(runtime), 'installerFiles': len(files),
              'offlineChecks': report['checks'], 'matchesOriginalRuntime': matches_baseline,
              'customBuild': not matches_baseline, 'sourceArchiveGenerated': args.source,
              'audioDurationSeconds': bank_manifest['pcm']['durationSeconds'],
              'scope': 'Offline checks and ZIP integrity only; no new in-game test or publication is claimed.',
              'runtimeHashes': runtime_hashes,
              'archives': [{'name': output.name, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}
                           for output in outputs]}
(destination / 'PACKAGE_CHECK.json').write_text(json.dumps(validation, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({'output': str(destination), 'installer': str(installer),
                  'offlineChecks': report['checks'], 'matchesOriginalRuntime': matches_baseline,
                  'sourceArchiveGenerated': args.source}, ensure_ascii=False, indent=2))
