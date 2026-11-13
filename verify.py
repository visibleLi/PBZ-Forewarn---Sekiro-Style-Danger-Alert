"""Offline validation only. Never starts PBZ or plays sound."""
from pathlib import Path
import argparse
import concurrent.futures
import hashlib
import json
import re
import shutil
import subprocess
import sys
from build_state import VERSION, TEST_CASES, validated_inputs

ROOT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--node', default=shutil.which('node'))
parser.add_argument('--check-baseline', action='store_true', help='also require the original 0.5 audio')
args = parser.parse_args()
node = shutil.which(args.node) if args.node else None
args.node = node or args.node
if not args.node or not Path(args.node).is_file():
    parser.error('Node.js is required; pass --node PATH')
OUT = ROOT / 'verification'
OUT.mkdir(exist_ok=True)
summary_path = OUT / 'summary.json'
summary_path.unlink(missing_ok=True)
inputs_before = validated_inputs(ROOT)


def run(case):
    name, relative = case
    executable = sys.executable if relative.endswith('.py') else args.node
    result = subprocess.run([executable, str(ROOT / relative)], cwd=ROOT, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, encoding='utf8', errors='replace')
    (OUT / (name + '.txt')).write_text(result.stdout, encoding='utf8')
    count = len(re.findall(r'^PASS ', result.stdout, flags=re.MULTILINE))
    if name in ('hooks', 'observation-hooks') and result.returncode == 0:
        count = json.loads(result.stdout)['checks']
    return {'name': name, 'checks': count, 'exit': result.returncode}


with concurrent.futures.ThreadPoolExecutor(max_workers=9) as pool:
    suites = list(pool.map(run, TEST_CASES))
for source in (ROOT / 'js-package').rglob('*.js'):
    result = subprocess.run([args.node, '--check', str(source)], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
if any(suite['exit'] or not suite['checks'] for suite in suites):
    print(json.dumps(suites, indent=2))
    raise RuntimeError('Check failed; see verification/*.txt')
wav_hash = hashlib.sha256((ROOT / 'js-package/PBZForewarn/cue.wav').read_bytes()).hexdigest()
if args.check_baseline:
    assert wav_hash == '5ad6af4e012662d527e93c3044651c278536bac5498853eead4513f77928b7e8', 'Audio differs from the original 0.5 baseline'
bank_manifest = json.loads((ROOT / 'audio-bank/generated/manifest.json').read_text(encoding='utf8'))
bank_config = subprocess.run([args.node, '-e', 'process.stdout.write(JSON.stringify(require("./audio-bank/generated/wwise-bank-config")))'],
                             cwd=ROOT, check=True, capture_output=True, text=True)
assert json.loads(bank_config.stdout) == {'eventId': bank_manifest['ids']['event'], 'bankId': bank_manifest['ids']['bank'],
                                         'durationSeconds': bank_manifest['pcm']['durationSeconds'],
                                         'authoredGainDb': bank_manifest['authoredGainDb'], 'voicePriority': bank_manifest['voicePriority']}
inputs_after = validated_inputs(ROOT)
if inputs_before != inputs_after:
    raise RuntimeError('Build inputs changed during validation; run verify.py again.')
report = {'version': VERSION, 'distributionName': 'PBZForewarn-' + VERSION,
          'checks': sum(suite['checks'] for suite in suites), 'suites': suites,
          'javascriptSyntax': 'passed', 'originalWavSha256': wav_hash,
          'bankSha256': bank_manifest['bankSha256'], 'sourcePcmSha256': bank_manifest['sourcePcmSha256'],
          'playablePcmSha256': bank_manifest['pcm']['sha256'], 'audioTrimStartMs': bank_manifest['trimStartMs'],
          'scope': 'Offline mocked UE/Puerts/UE4SS, observation and semantic-fallback checks, plus binary bank checks. No game launch, in-game Wwise bank load, audible playback, lock-state or combat verification.',
          'validatedInputs': inputs_after}
summary_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({key: value for key, value in report.items() if key != 'validatedInputs'}, ensure_ascii=False, indent=2))
