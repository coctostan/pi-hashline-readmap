## Code Review: Ready ✅

### Files Reviewed
`src/map-cache.ts`, `src/read.ts`, `index.ts`, `prompts/read.md`, and the full test suite (7 relevant test files).

---

### Strengths
- **`map-cache.ts`** is clean and minimal — single outer try/catch covers both `stat()` and `generateMap()` failures; caches `null` results to avoid redundant retries; `clearMapCache()` makes it properly testable.
- **`read.ts:97-107`** — the three-part guard (`truncated && !offset && !limit`) is correct; the inner try/catch guarantees the tool can never error due to map generation (AC-2.7).
- **`formatter.ts:formatFileMapWithBudget`** — tiered reduction + binary search fallback is thorough and includes an absolute fallback for pathological inputs.
- **Cache test** uses `utimes()` to advance mtime by 10s, correctly avoiding 1-second filesystem granularity flakiness.

---

### Findings Fixed

**Important — `tests/read-integration.test.ts:3-4`** (fixed in this session):  
`dirname` and `fileURLToPath` were imported but never used — `__dirname` was used raw, relying on vitest's CJS-compatibility injection. Every other test file in the project explicitly defines:
```typescript
const __dirname = dirname(fileURLToPath(import.meta.url));
```
The missing `const __dirname = …` line has been added. All 60 tests still pass.

---

### Minor (noted for later)
- `index.ts:7-9` uses 2-space indentation; all `src/` files use tabs
- `callReadTool` helper is duplicated across `task2-map-in-read.test.ts` and `read-integration.test.ts` — extract to `tests/helpers.ts` before more tests are added
- Add `noUnusedLocals: true` to `tsconfig.json` to catch dead imports at typecheck time