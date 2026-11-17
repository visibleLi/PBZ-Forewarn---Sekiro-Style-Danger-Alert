---
description: "Release steps from freeze to Nexus upload. Read before cutting or publishing a release."
---

# Release

1. Cut `release/vX.Y.Z` from `dev`.
2. Bump with `tools/set_version.py`.
3. Update `docs/CHANGELOG.txt`, `docs/VALIDATION.md`, `README.txt`, `docs/ROADMAP.md`.
4. Run the full gate. If runtime or audio changed, test in game and, before quitting:

```bash
python tools/analyze-run.py --save E:/dev/pbz-runs
```

5. Commit and push. CI must be green.
6. Merge `release/vX.Y.Z` into `main` with `--no-ff`. Tag `vX.Y.Z` on `main`
   with an annotated tag. Push `main` and the tag.
7. `release.yml` builds from the tag with the real `cue.wav`, runs the gate and
   creates the GitHub Release.
8. Download the GitHub Release installer, verify its SHA-256, install that asset
   and smoke test it.
9. Upload that Release asset to Nexus. Never upload a locally rebuilt ZIP.
   Update the Nexus description: version, changes, and new settings such as
   `ObservationFlushMs`.
10. Merge `main` back into `dev`, delete `release/*`.

Boundaries:

- Docs/tooling-only release: in-game test may be waived, the gate may not.
- Runtime/audio change: in-game test required; without it write "unverified".
- `release.yml` needs the `CUE_WAV_URL` repository variable and optional
  `CUE_WAV_SHA256`. Without it, a manual local build plus `gh release create` is
  allowed, but Nexus still gets the GitHub Release asset.
- `vX.Y.Z-preview` becomes a GitHub prerelease; whether it goes to Nexus is a
  release-note decision.
- Release claims may only repeat what `docs/VALIDATION.md` supports. Never claim
  "all moves", "no more stutter", or "screen-level lead".
