---
description: "Version format, single source, and tag rules. Read before bumping a version or tagging."
---

# Versioning

- Format: `0.MINOR.PATCH[-dev.N|-test.N|-preview]`
- Single source: `tools/build_state.py` `VERSION`.
- To bump, edit only `VERSION` in `tools/build_state.py` to the new version, then
  synchronize the listed carriers using the old version string:

```bash
python tools/set_version.py --previous <old-version>
```

- The script accepts no positional new-version argument. With no arguments it
  checks consistency without rewriting files.
- It synchronizes the files listed in `MENTIONS` (JS/Lua declarations, the wire
  fixture, README and example config). Update CHANGELOG and validation/release
  notes separately; historical entries are not rewritten.
- `tools/package.py` asserts JS, Lua and package name agree with `VERSION`.
- Tags: `vX.Y.Z` or `vX.Y.Z-preview`, annotated.
- Never move or delete a published tag. Before the Nexus upload a bad tag may be
  fixed; after it, fix forward only.
- A tag containing `-` is published as a GitHub prerelease.
