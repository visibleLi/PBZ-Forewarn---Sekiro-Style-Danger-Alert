---
description: "Version format, single source, and tag rules. Read before bumping a version or tagging."
---

# Versioning

- Format: `0.MINOR.PATCH[-dev.N|-test.N|-preview]`
- Single source: `tools/build_state.py` `VERSION`.
- Bump only with:

```bash
python tools/set_version.py <new-version> --previous <old-version>
```

- `tools/set_version.py` rewrites every carrier: JS, Lua, docs, example config.
  Never hand-edit multiple carriers.
- `tools/package.py` asserts JS, Lua and package name agree with `VERSION`.
- Tags: `vX.Y.Z` or `vX.Y.Z-preview`, annotated.
- Never move or delete a published tag. Before the Nexus upload a bad tag may be
  fixed; after it, fix forward only.
- A tag containing `-` is published as a GitHub prerelease.
