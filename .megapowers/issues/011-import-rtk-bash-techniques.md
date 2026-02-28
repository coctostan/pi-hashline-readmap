---
id: 11
type: feature
status: closed
created: 2026-02-26T21:10:00Z
milestone: M4
priority: 8
---

# Import RTK bash output techniques into src/rtk/

Copy compatible techniques from pi-rtk v0.1.3:

**Include:**
- `techniques/ansi.ts` → `src/rtk/techniques/ansi.ts`
- `techniques/build.ts` → `src/rtk/techniques/build.ts`
- `techniques/test-output.ts` → `src/rtk/techniques/test-output.ts`
- `techniques/git.ts` → `src/rtk/techniques/git.ts`
- `techniques/linter.ts` → `src/rtk/techniques/linter.ts`
- `techniques/truncate.ts` → `src/rtk/techniques/truncate.ts`

**Exclude (incompatible with hashlines):**
- ✗ `techniques/source.ts` — breaks hashline hashes
- ✗ `techniques/search.ts` — mangles hashline grep anchors

Do NOT copy index.ts, config.ts, or metrics.ts from pi-rtk.

Add barrel export at `src/rtk/techniques/index.ts`.

**Source**: https://github.com/mcowger/pi-rtk (v0.1.3, MIT)

**Verify**: All technique files compile. Zero new dependencies.

> **Closed**: Fully completed as part of #001 (project scaffold). All RTK technique files (ansi, build, test-output, git, linter, truncate) are in `src/rtk/` with barrel export. Forbidden files (source.ts, search.ts) are excluded.
