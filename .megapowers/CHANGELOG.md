# Megapowers Session Changelog

## Issue #001: Project Scaffold — CLOSED ✅
**Date**: 2026-02-26

### Delivered
- Full TypeScript pi extension scaffold (`pi-hashline-readmap`) unifying source from:
  - `pi-hashline-edit@0.3.0` (hashline read/edit/grep)
  - `pi-read-map@1.3.0` (structural file maps)
  - `pi-rtk@0.1.3` (bash output techniques)
- 33 passing Vitest tests across 8 test files
- `tsc --noEmit` exits 0, `npm test` exits 0
- All 17 acceptance criteria verified

### Side effects on later issues
- **#002 (import hashline-edit)**: Fully completed by #001 scaffold — close as duplicate
- **#003 (import readmap mapper)**: Fully completed by #001 scaffold — close as duplicate
- **#011 (import RTK techniques)**: Fully completed by #001 scaffold — close as duplicate
- **M4 tasks**: RTK source files are already in `src/rtk/`, only wiring (#012) and tests (#013) remain

### Learnings captured
7 learnings saved to `.megapowers/plans/001-project-scaffold/learnings.md`

## Issue #014 (Batch): M1 Core Integration — Map into Read Tool — CLOSED ✅
**Date**: 2026-02-26
**Source Issues**: #004 (integrate map into read tool), #005 (update read prompt), #006 (unit and integration tests)

### Delivered
- `src/map-cache.ts`: mtime-keyed in-memory cache (`getOrGenerateMap`, `clearMapCache`) — AC-1.1–AC-1.7
- `src/read.ts`: truncated reads (no offset/limit) now append `formatFileMapWithBudget()` structural map section; all map errors silently swallowed — AC-2.1–AC-2.7
- `index.ts`: wired `registerReadTool`, `registerEditTool`, `registerGrepTool` in default export — AC-3.1–AC-3.3
- `prompts/read.md`: updated to document map output, 17-language support, mtime caching, targeted-read usage — AC-4.1–AC-4.5
- Test fixtures: `tests/fixtures/small.ts`, `large.ts`, `small.py`, `sample.bin`, `plain.txt` — AC-5.1–AC-5.5
- 60 tests across 12 test files, all passing; `tsc --noEmit` exits 0

### Changelog (for CHANGELOG.md)
```
## [Unreleased]
### Added
- Map cache module (`src/map-cache.ts`) with mtime-keyed cache for FileMap results (#004)
- Structural map appended to truncated reads in `src/read.ts`; map failures are silent (#004)
- All three tools (read, edit, grep) wired in `index.ts` default export (#004)
- Updated `prompts/read.md` to document map output, 17 languages, mtime caching (#005)
- Test fixtures (small.ts, large.ts, small.py, sample.bin, plain.txt) and 27 new tests (#006)
```
✅ All three wrap-up actions complete:

1. **write-changelog** — Appended entry to `.megapowers/CHANGELOG.md` documenting all deliverables from issues #004, #005, #006 (source `CHANGELOG.md` is write-protected in done phase, so the entry is staged in `.megapowers/CHANGELOG.md` ready to be applied when write access is restored).

2. **capture-learnings** — 7 bullet-point learnings saved to `.megapowers/plans/014-m1-core-integration-map-into-read-tool-p/learnings.md` covering: silent-catch discipline, mtime cache simplicity, real-file tests over mocks, fixture sizing, parallel task ordering, formatter edge-case handling, and arity smoke tests.

3. **close-issue** — Issue #014 and all three source issues (#004, #005, #006) marked `status: closed` in `.megapowers/issues/`. (The phase is already at terminal `done` — no further phase transitions are available.)
