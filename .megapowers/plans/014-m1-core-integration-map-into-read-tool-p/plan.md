# Implementation Plan

### Task 1: Create `src/map-cache.ts` with tests
**Files to create:** `src/map-cache.ts`, `tests/map-cache.test.ts`
**Depends on:** nothing
**ACs:** AC-1.1 through AC-1.7, AC-6.1 through AC-6.5

Create `src/map-cache.ts` exporting:
- `getOrGenerateMap(absPath: string): Promise<FileMap | null>` — checks mtime, returns cached or freshly generated map, catches all errors and returns null
- `clearMapCache(): void` — clears the internal cache (for testing)

Internal: `Map<string, { mtimeMs: number; map: FileMap }>` keyed by absolute path. On each call, `stat()` the file, compare `mtimeMs` to cached entry. If match, return cached. If miss or mtime changed, call `generateMap()`, store result, return it. Wrap everything in try/catch → return null.

Tests (`tests/map-cache.test.ts`):
- First call generates map (spy on generateMap, verify called once)
- Second call with same file returns cached (generateMap NOT called again)
- After touching file (different mtime), regenerates
- When generateMap throws → returns null
- When stat throws (file gone) → returns null
- clearMapCache empties cache

Use real temp files in tests (write to os.tmpdir, clean up in afterEach).

---

### Task 2: Integrate map into `src/read.ts`
**Files to modify:** `src/read.ts`
**Depends on:** Task 1
**ACs:** AC-2.1 through AC-2.7, AC-9.2, AC-9.3

After the truncation block (line ~89-93 in current read.ts), add map generation:

```
if (truncation.truncated && !params.offset && !params.limit) {
    try {
        const fileMap = await getOrGenerateMap(absolutePath);
        if (fileMap) {
            const mapText = formatFileMapWithBudget(fileMap);
            text += "\n\n" + mapText;
        }
    } catch {
        // Silent — never fail read because of map
    }
}
```

Add imports for `getOrGenerateMap` from `./map-cache` and `formatFileMapWithBudget` from `./readmap/formatter.js`.

---

### Task 3: Wire all three tools in `index.ts`
**Files to modify:** `index.ts`
**Depends on:** Task 2
**ACs:** AC-3.1 through AC-3.3

Replace the stub with:
```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerReadTool } from "./src/read.js";
import { registerEditTool } from "./src/edit.js";
import { registerGrepTool } from "./src/grep.js";

export default function piHashlineReadmapExtension(pi: ExtensionAPI): void {
    registerReadTool(pi);
    registerEditTool(pi);
    registerGrepTool(pi);
}
```

Update entry-point test to verify the function accepts an argument (arity check).

---

### Task 4: Update `prompts/read.md`
**Files to modify:** `prompts/read.md`
**Depends on:** nothing
**ACs:** AC-4.1 through AC-4.5

Update to document:
- `LINE:HASH|` anchor format (preserved from current)
- Image delegation (preserved)
- Default limits (preserved, uses template vars)
- NEW: When truncated, a structural map is appended showing file symbols with line ranges
- NEW: Use the map to make targeted reads: `read(path, { offset: LINE, limit: N })`
- NEW: Maps support 17 languages and are cached by file modification time

---

### Task 5: Create test fixtures
**Files to create:** `tests/fixtures/small.ts`, `tests/fixtures/large.ts`, `tests/fixtures/small.py`, `tests/fixtures/sample.bin`, `tests/fixtures/plain.txt`
**Depends on:** nothing
**ACs:** AC-5.1 through AC-5.5

- `small.ts`: ~50 lines — one class with a constructor and two methods, one standalone function, one interface
- `large.ts`: >2000 lines — multiple classes with methods, standalone functions, interfaces, enums, type aliases. Use realistic-looking code (not just padding). Must trigger truncation threshold.
- `small.py`: ~30 lines — one class with __init__ and a method, one standalone function
- `sample.bin`: 16 random bytes (not valid UTF-8)
- `plain.txt`: ~20 lines of lorem ipsum text

---

### Task 6: Integration tests for combined read tool
**Files to create:** `tests/read-integration.test.ts`
**Depends on:** Tasks 2, 3, 5
**ACs:** AC-7.1 through AC-7.5, AC-8.1 through AC-8.6, AC-9.1

Tests call the read tool's execute function directly (import `registerReadTool`, create a mock `ExtensionAPI` that captures the registered tool, then call `tool.execute()`).

Unit-level integration tests:
- Small TS → hashlines only, no map markers in output
- Large TS → hashlines + map section present (check for class/function names from fixture)
- Large TS with offset → hashlines only, no map
- Large TS with limit → hashlines only, no map
- Small Python → hashlines only
- Plain text → hashlines only (no symbols to map, or minimal fallback)
- Map generation failure (mock getOrGenerateMap to throw) → hashlines returned, no error

Hashline format verification:
- Output lines match `^\d+:[0-9a-f]{2}\|` pattern
- Line numbers are sequential starting from 1 (or offset)
- Hash is deterministic (same content → same hash)

Edit-after-read test:
- Read large.ts → extract an anchor from output → call applyHashlineEdits with that anchor → verify edit succeeds without hash mismatch

---

### Task Order
```
Task 1 (map-cache + tests)     ─┐
Task 4 (prompts/read.md)        ├─ can run in parallel
Task 5 (test fixtures)          ─┘
         │
Task 2 (read.ts integration)   ← depends on Task 1
         │
Task 3 (index.ts wiring)       ← depends on Task 2
         │
Task 6 (integration tests)     ← depends on Tasks 2, 3, 5
```
