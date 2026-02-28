## Files Reviewed

- `src/map-cache.ts` — New mtime-based in-memory cache for `FileMap` results
- `src/read.ts` — Read tool with map integration (lines 97-107 are the new block)
- `index.ts` — Extension entry point wiring all three tools
- `prompts/read.md` — Updated read prompt documenting structural map behavior
- `tests/map-cache.test.ts` — Unit tests for cache (first call, cache hit, mtime invalidation, error handling, clear)
- `tests/read-integration.test.ts` — Integration tests: small/large/python/plain-text reads, offset/limit suppression, anchor compatibility, hashline format
- `tests/task2-map-in-read.test.ts` — Unit test: truncated file without offset/limit gets map
- `tests/entry-point.test.ts` — Entry point smoke tests
- `tests/task5-fixtures.test.ts` — Fixture validation tests

---

## Strengths

- **`src/map-cache.ts` (whole file)**: Clean, minimal, correct. Catches both `stat()` failures and `generateMap()` throws in one outer try/catch. Caches `null` results so repeated unrecognized-language reads don't re-invoke the mapper. Reference-equality cache hit test in `map-cache.test.ts:47` is a nice precise assertion.

- **`src/read.ts:97-107`**: The guard condition `truncation.truncated && !params.offset && !params.limit` correctly encodes the three-way trigger, with `!offset && !limit` cleanly handling the "full first-page read" intent (offset=0 is equivalent to no offset since `Math.max(1, 0) === 1`). The inner try/catch ensures map failures can never bubble out as tool errors (AC-2.7).

- **`src/readmap/formatter.ts:formatFileMapWithBudget`**: The tiered-reduction + binary-search fallback is thorough. The absolute fallback (`reduceToTruncated(map, minSymbols)`) guarantees a non-empty return even for pathological inputs.

- **`tests/map-cache.test.ts:50-65` (mtime invalidation test)**: Uses `utimes()` to force mtime forward by 10 seconds — correctly sidesteps filesystem 1-second mtime granularity issues that would make the test flaky.

- **Test coverage**: All AC criteria have direct tests with meaningful assertions (not just "it doesn't throw"). The `map-cache.test.ts` spy-based tests correctly mock `generateMap` on the live module reference, which means they test the actual caching logic rather than a stub.

---

## Findings

### Critical
None.

### Important

**`tests/read-integration.test.ts:3-4` — Dead imports; `__dirname` relies on vitest injection rather than ESM standard**

`dirname` and `fileURLToPath` are imported but were never wired up — the file used the bare `__dirname` global, which only works because vitest injects it for CJS compatibility. Every other test file in the project uses the explicit pattern:
```typescript
const __dirname = dirname(fileURLToPath(import.meta.url));
```
The imports implied the developer intended to follow this pattern but forgot to add the `const` line. The missing line has been added as part of this review (see fix below).

### Minor

**`index.ts:7-9` — 2-space indentation vs tabs**

All `src/` files use tabs for indentation; `index.ts` uses 2 spaces. Not a runtime concern, but inconsistent with the codebase style.

**`tests/task2-map-in-read.test.ts` + `tests/read-integration.test.ts` — Duplicated `callReadTool` helper**

Both files define nearly identical `callReadTool` functions (mock-PI, register, execute). A shared test helper in `tests/helpers.ts` would reduce drift risk. Non-critical since test-only code.

---

## Fixes Applied

**`tests/read-integration.test.ts`** — Added the missing `const __dirname = dirname(fileURLToPath(import.meta.url));` line (after the imports, before the first usage). All 60 tests still pass after the fix.

---

## Recommendations

1. Extract `callReadTool` + `getTextContent` + `parseHashlineRows` into a shared `tests/helpers.ts` before more test files are added — avoids copy-paste drift as more mappers and features land.
2. Add `noUnusedLocals: true` to `tsconfig.json` to catch dead imports at typecheck time instead of in code review.
3. `index.ts` indentation: consider fixing to tabs to stay consistent with `src/` (blocked by TDD constraint in this session — note for a follow-up chore commit).

---

## Assessment
**ready**

Core integration logic (`src/map-cache.ts`, `src/read.ts`, `index.ts`, `prompts/read.md`) is correct, well-structured, and consistent with codebase conventions. All 9 acceptance criterion groups pass with direct evidence. The one Important finding (dead imports + missing ESM `__dirname` definition) was a test-file oversight that has been fixed in this session. Remaining findings are minor style nits. 60/60 tests pass; TypeScript typecheck is clean.
