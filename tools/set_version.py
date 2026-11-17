"""Single place to bump the version.

`build_state.VERSION` is the authority. Everything else either derives from it at
build time or is rewritten here, so a version bump is two steps:

    edit tools/build_state.py   (one line)
    python tools/set_version.py --previous <old-version>

Without `--previous` it only reports which files disagree and exits non-zero when
any do; verify.py runs that check on every validation.
"""
from pathlib import Path
import argparse
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
from build_state import VERSION

# Runtime files that must declare VERSION; each regex has one capture group.
DECLARATIONS = (
    ('src/js/PBZForewarn/main.js', r'const VERSION = "([^"]+)";'),
    ('src/lua/main.lua', r'local VERSION = "([^"]+)"'),
    ('src/lua/observation-hooks.lua', r'local VERSION = "([^"]+)"'),
)
# Files that may mention the current build anywhere (templates, fixtures, prose).
MENTIONS = (
    'src/js/PBZForewarn/main.js',
    'src/lua/main.lua',
    'src/lua/observation-hooks.lua',
    'src/lua/tests/observer-schema2-wire-fixture.json',
    'README.txt',
    'docs/README_EN.txt',
    'docs/PBZForewarn.example.txt',
    'docs/player/README.txt',
)
# History: never rewritten.
HISTORY = ('docs/CHANGELOG.txt',)


def scan():
    mismatched, missing = [], []
    for relative, pattern in DECLARATIONS:
        path = ROOT / relative
        if not path.is_file():
            missing.append(relative)
            continue
        found = re.search(pattern, path.read_text(encoding='utf-8-sig'))
        if not found or found.group(1) != VERSION:
            mismatched.append((relative, found.group(1) if found else None))
    for relative in MENTIONS:
        path = ROOT / relative
        if not path.is_file():
            missing.append(relative)
            continue
        if VERSION not in path.read_text(encoding='utf-8-sig'):
            mismatched.append((relative, None))
    return mismatched, missing


def rewrite(previous):
    changed = []
    for relative in MENTIONS:
        path = ROOT / relative
        if not path.is_file():
            continue
        text = path.read_text(encoding='utf-8-sig')
        if previous in text:
            path.write_text(text.replace(previous, VERSION), encoding='utf8')
            changed.append(relative)
    return changed


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--previous', help='old version string to replace (omit to only check)')
    args = parser.parse_args()
    if args.previous:
        for relative in rewrite(args.previous):
            print('rewrote ' + relative)
    mismatched, missing = scan()
    if missing:
        print('missing file: ' + ', '.join(missing), file=sys.stderr)
        return 2
    if mismatched:
        for relative, found in mismatched:
            detail = 'missing' if found is None else repr(found)
            print(f'{relative}: {detail} != {VERSION!r}', file=sys.stderr)
        print('run: python tools/set_version.py --previous <old-version>', file=sys.stderr)
        return 1
    print(f'all carriers report {VERSION}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
