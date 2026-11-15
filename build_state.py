"""One source inventory for validation and the audio-free source archive."""
from pathlib import Path
import hashlib


VERSION = '0.6.1-dev.1'
TEST_CASES = (
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
    ('semantic-fallback', 'js-package/tests/semantic-fallback.test.js'),
    ('generic-attack', 'js-package/tests/generic-attack.test.js'),
    ('cast-warning', 'js-package/tests/cast-warning.test.js'),
    ('cast-followup', 'js-package/tests/cast-followup.test.js'),
    ('observation-hooks', 'hooks-package/tests/test_observation.py'),
    ('build', 'tests/test_build.py'),
)
SOURCE_ROOT_FILES = (
    'package.py', 'verify.py', 'build_state.py', 'Run-Checks.ps1', 'requirements-test.txt',
    '.gitignore', '.gitattributes', 'README.txt', 'README_EN.txt', 'DEVELOPMENT.md',
    'CREDITS.md', 'CHANGELOG.txt', 'PBZForewarn.example.txt', 'VALIDATION.md',
    'MODDING_PLAN.md', 'ROADMAP.md', 'MODLOG.md',
    'evidence/release2-tested-runtime-hashes.json',
)


def source_paths(root):
    root = Path(root)
    paths = {root / name for name in SOURCE_ROOT_FILES}
    patterns = (
        ('js-package', ('*.js', '*.json')),
        ('hooks-package', ('*.lua', '*.md', '*.py', '*fixture.json')),
        ('audio-bank', ('*.py', '*.md')),
        ('tests', ('*.py',)),
    )
    for folder, globs in patterns:
        for pattern in globs:
            for path in (root / folder).rglob(pattern):
                if not any(part in ('lib', '__pycache__', 'generated') for part in path.relative_to(root).parts):
                    paths.add(path)
    paths.add(root / 'player-docs/README.txt')
    return sorted(paths)


def validated_inputs(root):
    root = Path(root)
    paths = set(source_paths(root))
    for name in ('js-package/PBZForewarn/cue.wav', 'audio-bank/generated/PBZForewarn.bnk',
                 'audio-bank/generated/manifest.json', 'audio-bank/generated/wwise-bank-config.js'):
        paths.add(root / name)
    return {path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(paths)}
