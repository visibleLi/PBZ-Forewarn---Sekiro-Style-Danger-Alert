---
description: "Build, verify, and package gates. Read before running checks or claiming done."
---

# Gates

Environment: Python 3.12, Node.js 24, `lupa==2.8`. The vendored `lupa` ships
cp312 wheels only, so the gate must run under 3.12; a 3.13/3.14 interpreter
fails at import in `test_observation` with `checks 0`.

Full gate, fixed order:

```bash
python -m pip install --target src/lua/tests/lib -r requirements-test.txt
python tools/audio-bank/build_bank.py
python tools/verify.py --node <node-path-or-node-on-PATH>
python tools/package.py
```

Rules:

- `verify.py` must have every suite at exit 0 and every suite with `checks > 0`.
  Current baseline: 23 suites / 684 checks. Trust `verification/summary.json`.
- `package.py` must succeed. It rejects a stale summary, a version mismatch, or
  inputs changed after validation.
- Any runtime, test, build-script or packaging-doc change requires a fresh
  `verify.py` before packaging.
- Reproducibility is compared as extracted file content, not as a raw ZIP hash
  across machines. Raw hashes must match only within the same Python/zlib.
- CI must cover `main`, `dev`, `feat/**`, `fix/**`, `chore/**`, `release/**`,
  `hotfix/**` on push and pull request, running the same gate.
- The CI synthetic-tone installer is a structural artifact, never a release.
