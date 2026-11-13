"""Offline validation only. Never starts PBZ or plays sound."""
from pathlib import Path
import argparse, subprocess, concurrent.futures, json, re, sys, shutil, hashlib

ROOT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--node', default=shutil.which('node'))
args = parser.parse_args()
if not args.node: parser.error('Node.js is required; pass --node PATH')
OUT = ROOT/'verification'; OUT.mkdir(exist_ok=True)
CASES = [
    ('core', 'js-package/PBZForewarn/core.test.js'),
    ('adapter', 'js-package/tests/adapter.test.js'),
    ('presentation', 'js-package/tests/presentation.test.js'),
    ('runtime', 'js-package/tests/runtime.test.js'),
    ('diagnostic-store', 'js-package/PBZForewarn/diagnostic-store.test.js'),
    ('wwise-audio', 'js-package/PBZForewarn/wwise-audio.test.js'),
    ('audio-bank', 'audio-bank/test_bank.py'),
    ('audio-environment', 'js-package/PBZForewarn/audio-environment.test.js'),
    ('target-filter', 'js-package/tests/target-filter.test.js'),
    ('attack-probe', 'js-package/tests/attack-semantics-probe.test.js'),
    ('hooks', 'hooks-package/tests/test_hooks.py'),
    ('hooks-entry', 'hooks-package/tests/test_entry.py'),
    ('observation-store', 'js-package/tests/observation-store.test.js'),
    ('native-observer', 'js-package/tests/native-attack-observer.test.js'),
    ('timeline-observer', 'js-package/tests/timeline-observation.test.js'),
    ('observation-hooks', 'hooks-package/tests/test_observation.py'),
]
def run(case):
    name, relative = case
    executable = sys.executable if relative.endswith('.py') else args.node
    command = [executable, str(ROOT/relative)]
    if relative.endswith('.ps1'):
        command = ['C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', '-NoProfile', '-NonInteractive',
                   '-ExecutionPolicy', 'Bypass', '-File', str(ROOT/relative)]
    result = subprocess.run(command, cwd=ROOT, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, encoding='utf8', errors='replace')
    (OUT/(name+'.txt')).write_text(result.stdout, encoding='utf8')
    count = len(re.findall(r'^PASS ', result.stdout, flags=re.MULTILINE))
    if name in ('hooks', 'observation-hooks') and result.returncode == 0: count = json.loads(result.stdout)['checks']
    return {'name': name, 'checks': count, 'exit': result.returncode}
with concurrent.futures.ThreadPoolExecutor(max_workers=9) as pool:
    suites = list(pool.map(run, CASES))
for source in (ROOT/'js-package/PBZForewarn').glob('*.js'):
    result = subprocess.run([args.node, '--check', str(source)], capture_output=True, text=True)
    if result.returncode: raise RuntimeError(result.stderr)
if any(x['exit'] or not x['checks'] for x in suites):
    print(json.dumps(suites, indent=2)); raise RuntimeError('Check failed; see verification/*.txt')
wav = ROOT/'js-package/PBZForewarn/cue.wav'
wav_hash = hashlib.sha256(wav.read_bytes()).hexdigest()
assert wav_hash == '5ad6af4e012662d527e93c3044651c278536bac5498853eead4513f77928b7e8'
bank_manifest = json.loads((ROOT/'audio-bank/generated/manifest.json').read_text(encoding='utf8'))
bank_config = subprocess.run([args.node, '-e', 'process.stdout.write(JSON.stringify(require("./js-package/PBZForewarn/wwise-bank-config")))'],
                             cwd=ROOT, check=True, capture_output=True, text=True)
assert json.loads(bank_config.stdout) == {'eventId': bank_manifest['ids']['event'], 'bankId': bank_manifest['ids']['bank'],
                                         'durationSeconds': bank_manifest['pcm']['durationSeconds'],
                                         'authoredGainDb': bank_manifest['authoredGainDb'], 'voicePriority': bank_manifest['voicePriority']}
report = {'version': '0.6.0-observe-bounded.2', 'distributionName': 'PBZForewarn-0.6.0-observe-bounded.2',
          'checks': sum(x['checks'] for x in suites), 'suites': suites,
          'javascriptSyntax': 'passed', 'originalWavSha256': wav_hash,
          'bankSha256': bank_manifest['bankSha256'], 'sourcePcmSha256': bank_manifest['sourcePcmSha256'],
          'playablePcmSha256': bank_manifest['pcm']['sha256'], 'audioTrimStartMs': bank_manifest['trimStartMs'],
          'scope': 'Offline mocked UE/Puerts/UE4SS, real Lua wire-fixture integration and binary bank checks. Predecessor bounded.1 completed a user long run; this new bounded.2 candidate is not in-game verified. No FG/RTSS fix or coverage certification.'}
(OUT/'summary.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(report, ensure_ascii=False, indent=2))
