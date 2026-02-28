## Files Reviewed

| File | Description |
|------|-------------|
| `index.ts` | Extension entry point — scaffold stub with named default export |
| `package.json` | Dependencies, scripts, pi extension config |
| `tsconfig.json` | ESM-compatible TS config (ESNext module, bundler resolution) |
| `vitest.config.ts` | Test runner config |
| `src/hashline.ts` | Hash engine: hash computation, line ref parsing, edit application, relocation |
| `src/read.ts` | Read tool registration (pi ExtensionAPI wrapper) |
| `src/edit.ts` | Edit tool registration; legacy compat handling |
| `src/grep.ts` | Grep tool registration; hashline post-processing of grep output |
| `src/edit-diff.ts` | BOM handling, LF normalization, fuzzy text matching, diff generation |
| `src/path-utils.ts` | Path normalization (@ prefix, tilde, unicode spaces) |
| `src/runtime.ts` | `throwIfAborted` abort signal helper |
| `src/rtk/ansi.ts` | ANSI escape stripping |
| `src/rtk/truncate.ts` | Text/line count truncation |
| `src/rtk/build.ts` | Build output noise filter |
| `src/rtk/test-output.ts` | Test result aggregator |
| `src/rtk/git.ts` | Git diff/status/log compactor |
| `src/rtk/linter.ts` | Linter output aggregator |
| `src/rtk/index.ts` | RTK barrel re-export |
| `src/readmap/types.ts` | FileMap, FileSymbol, MapOptions interfaces |
| `src/readmap/constants.ts` | THRESHOLDS constants |
| `src/readmap/enums.ts` | SymbolKind, DetailLevel enums |
| `src/readmap/language-detect.ts` | Extension→language map |
| `src/readmap/mapper.ts` | generateMap dispatcher; ctags/fallback chain |
| `src/readmap/formatter.ts` | Map formatting with budget enforcement and binary-search truncation |
| `src/readmap/mappers/typescript.ts` | ts-morph mapper; lazy-loaded shared project singleton |
| `src/readmap/mappers/fallback.ts` | grep-based fallback mapper |
| `src/readmap/mappers/rust.ts` | tree-sitter Rust mapper (partial review) |
| `scripts/python_outline.py` | AST outline extractor called by python mapper |
| `scripts/go_outline.go` | AST outline extractor called by go mapper |
| `prompts/read.md`, `prompts/edit.md` | Tool description prompt templates |
| `tests/*.test.ts` (8 files) | File existence + entry-point export tests |

---

## Strengths

**`src/hashline.ts`** — The hash engine is impressively robust. Bottom-up application order (`sorted` descending by line) keeps splice indices stable (line 407-413). Hash-window relocation (`HASH_RELOCATION_WINDOW = 20`, line 53) handles common line-drift cases. `restoreOldWrappedLines` (line 182) and confusable-hyphen normalization (line 52) address real LLM output quirks. Noop detection and deduplication (lines 388-404) prevent spurious no-change errors.

**`src/edit-diff.ts` — fuzzy matching** — `buildNormalizedWithMap` (line 46) + `mapNormalizedSpanToOriginal` (line 72) correctly map normalized match positions back to the original content without normalizing the whole file. The replacement always operates on original bytes, avoiding double-normalization bugs.

**`src/edit.ts` — legacy compatibility** — The top-level `oldText`/`newText` → `edits[0].replace` normalization (lines 73-90) is well-handled with a deprecation warning. Variant-count validation (lines 114-123) gives clear error messages for malformed edits.

**`src/readmap/mappers/typescript.ts`** — Lazy `ts-morph` load (line 17-22) avoids startup cost. Shared `Project` singleton (line 24-41) is reused across calls. The inner `try/finally` (lines 733-756) guarantees `removeSourceFile` is always called when the source file was created, preventing memory leaks in the singleton project.

**`src/readmap/formatter.ts:365-431` — `formatFileMapWithBudget`** — Binary search over symbol count is a solid production detail that prevents budget overruns on arbitrarily large files, with a guaranteed minimum-symbols fallback.

**`src/readmap/mapper.ts`** — Clean three-tier dispatch: language mapper → ctags → grep fallback. Adding new languages is a one-line registry entry.

**Tests** — All 8 test files map cleanly to acceptance criteria (AC8–AC15). `entry-point.test.ts` dynamically imports the module and asserts `typeof mod.default === "function"` — the only test that exercises real logic rather than fs.existsSync, and it's appropriately the only one that needs to.

---

## Findings

### Critical
None.

### Important

**`src/readmap/mappers/fallback.ts:82-95` — Shell injection via file path**

```typescript
const { stdout: wcOutput } = await execAsync(`wc -l < "${filePath}"`, { signal });
const { stdout } = await execAsync(
  `grep -n "${combinedPattern}" "${filePath}" | head -500`,
  { signal, timeout: 5000 }
);
```

`filePath` is interpolated directly into shell command strings. A path containing `"` or `$()` would break the command or inject arbitrary shell commands. Since `filePath` ultimately comes from user tool input, this is a real attack surface.

**Why it matters:** The fallback mapper isn't wired to any tool yet (out of scope for this milestone), so there's no immediate exposure. But it will be called in M1.3 when the read tool integrates the mapper.

**Fix for M1.3:** Switch to `execFile` with argument arrays, or sanitize the path with `shellEscape`. Tracking here so it isn't forgotten at integration time.

### Minor

**`src/readmap/mapper.ts:76` — `MapOptions.maxBytes` is silently ignored**

```typescript
export interface MapOptions {
  maxBytes?: number;  // <-- declared but generateMap only destructures signal
  signal?: AbortSignal;
}
```

`generateMap` only uses `options.signal`; `maxBytes` is discarded. This creates a misleading API contract for callers in future milestones.

**Fix:** Add a `// TODO(M1.3): wire maxBytes through to formatFileMapWithBudget` comment on the field, or remove it from `MapOptions` until the integration milestone.

**`src/rtk/test-output.ts:91-92` — `\b` around Unicode symbols is unreliable**

```typescript
if (line.match(/\b(ok|PASS|✓|✔)\b/)) summary.passed++;
if (line.match(/\b(FAIL|fail|✗|✕)\b/)) summary.failed++;
```

`\b` is a zero-width assertion between `\w` and `\W` classes. Unicode symbols (✓, ✔, ✗, ✕) are `\W`, so `\b` before them only matches when the symbol is preceded by a word character — which is not the typical test output format (e.g. `" ✓ 5 passed"` has a space before ✓, not a word char). The ASCII words `ok`, `PASS`, `FAIL`, `fail` work fine with `\b`. The emoji/Unicode arms may silently never match.

**Fix:** Use separate patterns for ASCII words (keep `\b`) and Unicode symbols (use lookaround or just no boundary):
```typescript
if (line.match(/\b(?:ok|PASS)\b/) || line.match(/[✓✔]/)) summary.passed++;
if (line.match(/\b(?:FAIL|fail)\b/) || line.match(/[✗✕]/)) summary.failed++;
```

---

## Fixed in This Session

The following minor findings were patched before marking ready:

1. **`src/readmap/types.ts:81-83`** — Removed dangling JSDoc comment `/** Details for file map custom messages. */` at end of file with no corresponding declaration. Leftover from upstream refactoring.

2. **`src/rtk/ansi.ts:7-8` (original line 8)** — Removed redundant first OSC regex `\x1b\][0-9;]*(?:\x07|\x1b\\)`. It is fully subsumed by the second pattern `\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)` (since `[0-9;]*` ⊆ `[^\x07\x1b]*`). Merged comment into the remaining line.

3. **`src/rtk/test-output.ts:31-32`** — Fixed two missing leading tabs in `FAILURE_START_PATTERNS` array. Entries `/^\s*●\s+/` and `/^\s*✕\s+/` now consistently indented with the rest of the array.

All fixes verified: `npm test` → 8 files, 33 tests, exit 0. `tsc --noEmit` → exit 0.

---

## Recommendations

1. **Shell injection (fallback mapper):** Before wiring `generateMap` into the read tool at M1.3, replace the `exec` shell-string approach in `fallback.ts` with `execFile` + argument arrays. This is the right time to fix it — before it touches user input.

2. **`MapOptions.maxBytes`:** Wire it through to `formatFileMapWithBudget` at M1.3 so callers can enforce per-call budgets, or remove the field until then to avoid silent no-ops.

3. **Unicode `\b` in test-output.ts:** Low-priority since the RTK layer isn't integrated yet, but worth fixing before M4 wiring so the test aggregation actually works for vitest/jest unicode check marks.

---

## Assessment
**ready**

The hashline edit engine, tool registration layer, readmap core, and RTK utilities are all solid upstream-quality code. No critical bugs. The three in-session fixes cleaned up upstream porting artifacts (dangling comment, dead regex, formatting). Remaining important findings (shell injection, ignored option, Unicode regex) are in unintegrated code and properly tracked for their respective integration milestones.