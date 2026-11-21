"""One source inventory for validation and the audio-free source archive."""
from pathlib import Path
import hashlib


VERSION = '0.6.1-dev.6'

# Every suite is discovered, not listed: a new test file runs automatically.
# Order is deterministic (sorted by path) so verification summaries are stable.
SUITE_GLOBS = (
    ('src/js', '*.test.js'),
    ('src/js', 'tests/*.js'),
    ('src/lua', 'tests/test_*.py'),
    ('tools/audio-bank', 'test_*.py'),
    ('tests', '**/*.py'),
)
PYTHON_SUITE_PREFIX = ('src/lua/tests/', 'tools/audio-bank/', 'tests/')


def _suite_name(relative):
    name = relative.replace('\\', '/').rsplit('/', 1)[-1]
    for suffix in ('.test.js', '.js', '.py'):
        if name.endswith(suffix):
            name = name[: -len(suffix)]
            break
    return name


def test_cases(root):
    root = Path(root)
    found = {}
    for folder, pattern in SUITE_GLOBS:
        for path in sorted((root / folder).glob(pattern)):
            relative = path.relative_to(root).as_posix()
            found.setdefault(_suite_name(relative), relative)
    return tuple(sorted(found.items(), key=lambda item: item[1]))


def is_python_suite(relative):
    return any(relative.startswith(prefix) for prefix in PYTHON_SUITE_PREFIX)


SOURCE_ROOT_FILES = (
    'tools/package.py', 'tools/verify.py', 'tools/build_state.py', 'tools/analyze-run.py',
    'tools/regen-gold.js', 'tools/set_version.py', 'Run-Checks.ps1',
    'requirements-test.txt', '.gitignore', '.gitattributes',
    'tools/check-interfaces.cjs',
    'tools/dev-types/package.json', 'tools/dev-types/package-lock.json',
    'tools/dev-types/.gitignore', 'tools/dev-types/audio-environment.d.ts',
    '.claude/skills/pbzforewarn-dev/SKILL.md',
    'README.txt', 'AGENTS.md', 'evidence/release2-tested-runtime-hashes.json',
    '.agent/rules/gates.md',
    'docs/CHANGELOG.txt', 'docs/CREDITS.md', 'docs/DEVELOPMENT.md',
    'docs/PBZForewarn.example.txt', 'docs/VALIDATION.md', 'docs/MODDING_PLAN.md',
    'docs/ROADMAP.md', 'docs/MODLOG.md',
)


def source_paths(root):
    root = Path(root)
    paths = {root / name for name in SOURCE_ROOT_FILES}
    patterns = (
        ('src/js', ('*.js', '*.json')),
        ('src/lua', ('*.lua', '*.md', '*.py', '*fixture.json')),
        ('tools/audio-bank', ('*.py', '*.md')),
        ('tests', ('*.py',)),
        ('.agent/rules', ('*.md',)),
    )
    for folder, globs in patterns:
        for pattern in globs:
            for path in (root / folder).rglob(pattern):
                if not any(part in ('lib', '__pycache__', 'generated') for part in path.relative_to(root).parts):
                    paths.add(path)
    return sorted(paths)


def validated_inputs(root):
    root = Path(root)
    paths = set(source_paths(root))
    for name in ('src/js/PBZForewarn/cue.wav', 'tools/audio-bank/generated/PBZForewarn.bnk',
                 'tools/audio-bank/generated/manifest.json',
                 'tools/audio-bank/generated/wwise-bank-config.js'):
        paths.add(root / name)
    return {path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(paths)}
