from pathlib import Path
import hashlib


def validated_inputs(root):
    root = Path(root)
    paths = set()
    for folder, patterns in (('js-package', ('*.js',)),
                             ('hooks-package', ('*.lua', 'test_*.py')),
                             ('audio-bank', ('*.py',))):
        for pattern in patterns:
            for path in (root / folder).rglob(pattern):
                if not any(part in ('lib', '__pycache__') for part in path.relative_to(root).parts):
                    paths.add(path)
    for name in ('build_state.py', 'verify.py', 'package.py', 'requirements-test.txt',
                 'tests/test_build.py', 'js-package/PBZForewarn/cue.wav',
                 'audio-bank/generated/PBZForewarn.bnk', 'audio-bank/generated/manifest.json',
                 'audio-bank/generated/wwise-bank-config.js'):
        paths.add(root / name)
    return {path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(paths)}
