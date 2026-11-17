---
description: "Audio, bank, and generated asset rules. Read before touching cue.wav or build artifacts."
---

# Assets

- `cue.wav` is never tracked. CI generates a 0.25 s synthetic tone only to test
  the build chain.
- Release builds use the real audio through `CUE_WAV_URL` and optional
  `CUE_WAV_SHA256`.
- Use only audio you have the right to redistribute. Record the source and
  license in `docs/CREDITS.md`.
- Input format: uncompressed 44100 Hz stereo 16-bit PCM, 0.01–30 seconds.
- Never track `.wav`, `.bnk`, `.wem`, `generated/`, `dist/`, `verification/`,
  `runs/`, `src/lua/tests/lib/`, or `__pycache__/`.
- CI rejects tracked audio and build output. `.gitignore` is the second line,
  not the only one.
- The CI installer is a structural artifact, never a release candidate.
