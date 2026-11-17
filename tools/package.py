from pathlib import Path
import argparse
import hashlib
import json
import re
import zipfile

from build_state import VERSION, test_cases, source_paths, validated_inputs

ROOT = Path(__file__).resolve().parent.parent
ZIP_TIMESTAMP = (2026, 11, 13, 0, 0, 0)


def archive_bytes(path):
    # Normalize text checkout line endings; bank bytes are read separately.
    return path.read_bytes().replace(b'\r\n', b'\n')


def write_archive(path, files):
    with zipfile.ZipFile(path, 'w') as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, ZIP_TIMESTAMP)
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    with zipfile.ZipFile(path) as archive:
        if archive.testzip() is not None or set(archive.namelist()) != set(files):
            raise RuntimeError('ZIP integrity check failed: ' + str(path))
        for name, data in files.items():
            if archive.read(name) != data:
                raise RuntimeError('ZIP read-back mismatch: ' + name)


parser = argparse.ArgumentParser(description='Build the Forewarn installer; source archive is opt-in.')
parser.add_argument('--output-dir', type=Path, default=ROOT / 'dist')
parser.add_argument('--source', action='store_true', help='also generate an audio-free source archive')
parser.add_argument('--check-baseline', action='store_true', help='require byte-identical original 0.5 runtime')
args = parser.parse_args()
destination = args.output_dir.expanduser().resolve()
report_path = ROOT / 'verification/summary.json'
if not report_path.is_file():
    raise SystemExit('Run python tools/verify.py --node <node-path> before packaging.')
report = json.loads(report_path.read_text(encoding='utf8'))
suites = report.get('suites')
expected = [name for name, _ in test_cases(ROOT)]
if (report.get('version') != VERSION or report.get('distributionName') != 'PBZForewarn-' + VERSION
        or report.get('javascriptSyntax') != 'passed' or not isinstance(suites, list)
        or any(not isinstance(suite, dict) for suite in suites)
        or [suite.get('name') for suite in suites] != expected
        or any(type(suite.get('exit')) is not int or suite['exit'] != 0
               or type(suite.get('checks')) is not int or suite['checks'] <= 0 for suite in suites)
        or type(report.get('checks')) is not int
        or report['checks'] != sum(suite['checks'] for suite in suites)):
    raise SystemExit('Validation is missing, incomplete or failed. Run tools/verify.py again.')
try:
    current_inputs = validated_inputs(ROOT)
except FileNotFoundError as error:
    raise SystemExit('Build input missing; generate the bank and run tools/verify.py again: ' + str(error))
if report.get('validatedInputs') != current_inputs:
    raise SystemExit('Source, audio or build scripts changed after validation. Run tools/verify.py again.')

runtime = {}
scripts_prefix = 'ProjectPBZ/PBZModLoader/mods/PBZForewarn/'
for script_path in sorted((ROOT / 'src/js/PBZForewarn').glob('*.js')):
    if not script_path.name.endswith('.test.js'):
        runtime[scripts_prefix + script_path.name] = archive_bytes(script_path)
runtime[scripts_prefix + 'wwise-bank-config.js'] = archive_bytes(ROOT / 'tools/audio-bank/generated/wwise-bank-config.js')
runtime['ProjectPBZ/Content/PBZForewarn/PBZForewarn.bnk'] = (ROOT / 'tools/audio-bank/generated/PBZForewarn.bnk').read_bytes()
hooks_prefix = 'platform/steam/ue4ss/Mods/PBZForewarnHooks/'
for script_name in ('main.lua', 'timeline-hooks.lua', 'observation-hooks.lua'):
    runtime[hooks_prefix + 'Scripts/' + script_name] = archive_bytes(ROOT / 'src/lua' / script_name)
runtime[hooks_prefix + 'enabled.txt'] = b''
js_version = re.search(r'const VERSION = "([^"]+)";', runtime[scripts_prefix + 'main.js'].decode('utf8'))
lua_versions = {name: re.search(r'local VERSION = "([^"]+)"',
    runtime[hooks_prefix + 'Scripts/' + name].decode('utf8'))
    for name in ('main.lua', 'observation-hooks.lua')}
if (not js_version or js_version.group(1) != VERSION or
        any(not match or match.group(1) != VERSION for match in lua_versions.values())):
    raise SystemExit('Runtime version mismatch: JS, Lua and package version must be identical.')
frozen = json.loads((ROOT / 'evidence/release2-tested-runtime-hashes.json').read_text(encoding='utf8'))
runtime_hashes = {name: hashlib.sha256(data).hexdigest() for name, data in runtime.items()}
matches_baseline = runtime_hashes == frozen
if args.check_baseline and not matches_baseline:
    raise SystemExit('Runtime hashes differ from the original 0.5 baseline.')
bank_manifest = json.loads((ROOT / 'tools/audio-bank/generated/manifest.json').read_text(encoding='utf8'))
player_readme = (ROOT / 'docs/player/README.txt').read_text(encoding='utf-8-sig')
files = dict(runtime)
files['README.txt'] = ('\ufeff' + '\r\n'.join(player_readme.splitlines()) + '\r\n').encode('utf8')
source_files = {path.relative_to(ROOT).as_posix(): archive_bytes(path) for path in source_paths(ROOT)} if args.source else {}
# Detect edits between report verification and reading the bytes to be packaged.
if validated_inputs(ROOT) != current_inputs:
    raise SystemExit('Build inputs changed during packaging. Run tools/verify.py again.')
destination.mkdir(parents=True, exist_ok=True)
installer = destination / ('PBZForewarn-' + VERSION + '.zip')
write_archive(installer, files)
outputs = [installer]
if args.source:
    source = destination / ('PBZForewarn-' + VERSION + '-Source.zip')
    write_archive(source, source_files)
    outputs.append(source)
validation = {'runtimeVersion': VERSION, 'runtimeFiles': len(runtime), 'installerFiles': len(files),
              'offlineChecks': report['checks'], 'matchesOriginalRuntime': matches_baseline,
              'sourceArchiveGenerated': args.source, 'audioDurationSeconds': bank_manifest['pcm']['durationSeconds'],
              'scope': 'Offline checks and ZIP integrity only; no new in-game test or publication is claimed.',
              'runtimeHashes': runtime_hashes,
              'archives': [{'name': output.name, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}
                           for output in outputs]}
(destination / 'PACKAGE_CHECK.json').write_text(json.dumps(validation, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({'output': str(destination), 'installer': str(installer), 'offlineChecks': report['checks'],
                  'sourceArchiveGenerated': args.source}, ensure_ascii=False, indent=2))
