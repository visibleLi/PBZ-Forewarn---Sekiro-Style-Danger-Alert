# PBZForewarn — Agent Gateway

> Entry point, not the rulebook. Rules live in `.agent/rules/`.
> Read the matching rule before acting. Do not rely on memory of past sessions.

## Project

PBZForewarn is a Sekiro-style danger alert for Phantom Blade Zero: UE4SS JS/Lua
runtime plus Python build, verify and package tooling.

```text
src/js/PBZForewarn/   runtime JS
src/lua/              UE4SS Lua hooks
tools/                build, verify, package, analyze, version
tests/                Python suites
src/js/tests/         JS suites and fixtures
docs/                 developer docs (never packaged)
README.txt            the only player document (packaged verbatim)
```

`main` is the released version. `dev` is the next-version integration line.

## Hard invariants

1. `main` equals the player's version. Never commit to `main` directly.
2. `tools/build_state.py:VERSION` is the only version source.
3. No "tested / supported / fixed" without a `docs/VALIDATION.md` record.
4. Rule changes are commits in this repository; verbal rules do not exist.

## Rule map

| Before you...                     | Read                            |
| --------------------------------- | ------------------------------- |
| create, merge, or delete a branch | `.agent/rules/branches.md`      |
| write a commit                    | `.agent/rules/commits.md`       |
| bump a version or tag             | `.agent/rules/versioning.md`    |
| run checks or claim done          | `.agent/rules/gates.md`         |
| cut or publish a release          | `.agent/rules/release.md`       |
| run the game or save logs         | `.agent/rules/evidence.md`      |
| add or move documentation         | `.agent/rules/docs.md`          |
| touch audio or build assets       | `.agent/rules/assets.md`        |
| act as an agent                   | `.agent/rules/agent-conduct.md` |
| delegate work to a subagent       | `.agent/rules/delegation.md`    |
| check what is enforced            | `.agent/rules/enforcement.md`   |
| change these rules                | `.agent/rules/rule-changes.md`  |
| check default choices             | `.agent/rules/decisions.md`     |

## Commands

```bash
python -m pip install --target src/lua/tests/lib -r requirements-test.txt
python tools/audio-bank/build_bank.py
python tools/verify.py --node <node-path-or-node-on-PATH>
python tools/package.py
python tools/analyze-run.py # dev.5-specific analysis; evidence handling is in .agent/rules/evidence.md
# To bump: first edit VERSION in tools/build_state.py, then synchronize carriers:
python tools/set_version.py --previous <old-version>
```
