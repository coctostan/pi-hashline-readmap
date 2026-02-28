---
id: 3
type: feature
status: closed
created: 2026-02-26T21:02:00Z
milestone: M1
priority: 2
---

# Import read-map mapper library into src/readmap/

Copy read-map's mapper library (pure functions, no pi API dependency) into `src/readmap/`:

**Core files:**
- `src/mapper.ts` → `src/readmap/mapper.ts`
- `src/formatter.ts` → `src/readmap/formatter.ts`
- `src/language-detect.ts` → `src/readmap/language-detect.ts`
- `src/types.ts` → `src/readmap/types.ts`
- `src/enums.ts` → `src/readmap/enums.ts`
- `src/constants.ts` → `src/readmap/constants.ts`

**All 17 language mappers:**
- `src/mappers/*.ts` → `src/readmap/mappers/*.ts`

**Scripts:**
- `scripts/python_outline.py` → `scripts/python_outline.py`
- `scripts/go_outline.go` → `scripts/go_outline.go`

**Adaptation needed:**
- Fix import paths: read-map uses `.js` extensions (ESM). Adapt for our tsconfig.
- Adjust relative paths in mapper.ts imports.
- Ensure scripts/ path references work.

Do NOT copy `src/index.ts` from read-map — we have our own integration.

**Source**: https://github.com/Whamp/pi-read-map (v1.3.0)

**Verify**: `npx tsc --noEmit` succeeds with all readmap code in place.

> **Closed**: Fully completed as part of #001 (project scaffold). All readmap source files, mappers, and scripts are in place and `tsc --noEmit` passes.
