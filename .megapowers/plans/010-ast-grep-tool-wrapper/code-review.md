# Code Review: AST-Grep Tool Wrapper (M3)

## Files Reviewed

- `src/sg.ts` — New tool implementation (~142 lines): CLI invocation, output formatting, error handling
- `index.ts` — Registration call added
- `prompts/sg.md` — Tool description / metavariable docs
- `tests/sg.args.test.ts` — CLI arg construction
- `tests/sg.execute-errors.test.ts` — ENOENT and non-zero exit
- `tests/sg.format.test.ts` — Hashline anchors, multi-file grouping, unreadable file skipping
- `tests/sg.no-match.test.ts` — Empty match result
- `tests/sg.path-resolution.test.ts` — cwd-relative path resolution
- `tests/sg.prompt-loading.test.ts` — Description loaded from `prompts/sg.md`
- `tests/sg.schema.test.ts` — Schema shape and required fields

---

## Strengths

- **`src/sg.ts:78-79` / `src/sg.ts:111`**: Hash anchors are computed from actual file content, not sg's `text` field — this is the right call and guarantees edit-tool compatibility.
- **`src/sg.ts:58-62`**: `signal` is forwarded to `execFile`, enabling proper abort propagation.
- **`src/sg.ts:88-92` (`toAbsoluteFile`)**: Correctly handles sg returning absolute paths (pass-through), relative paths on a directory search (`resolve(searchPath, m.file)`), and relative paths on a file search (use `searchPath` itself). All three cases are covered.
- **`src/sg.ts:61`**: `maxBuffer: 10 * 1024 * 1024` is pragmatic for large codebases without going wild.
- **`src/sg.ts:65-70` + `src/sg.ts:117-122`**: Two-tier no-matches handling is correct — the second path handles the distinct case where sg returned matches but every matched file was unreadable. Both return the same friendly message.
- **`tests/sg.format.test.ts:84-98`**: The edit-compatibility test is genuinely end-to-end: it takes an anchor from real sg output and applies it through `applyHashlineEdits`, verifying the right line was modified. Not a mock-of-implementation-details test.

---

## Findings

### Critical
None.

### Important

**`src/sg.ts:82-84` — Cache stores `[]` for error but returns `undefined`**

```ts
} catch {
  fileCache.set(absolutePath, []);  // ← cached as []
  return undefined;                  // ← but caller gets undefined
}
```

If `getFileLines(abs)` is called a second time for a failed file (e.g. the same abs resolves under two different `display` keys), `fileCache.get(abs)` returns `[]` (truthy), so the `if (!lines) continue` guard at line 105 would not fire, and the file header would be emitted with phantom empty-content lines. In current code this can't happen because `display` is `path.relative(ctx.cwd, abs)` — a deterministic 1:1 mapping — so each `abs` belongs to exactly one group and `getFileLines` is called once per abs. But the inconsistency is a latent bug: the cache contract says "I have this file's lines" but the data says "empty array", while the return value says "I don't have them".

**Recommended fix** — use `null` as the sentinel and return it consistently:

```ts
const fileCache = new Map<string, string[] | null>();
const getFileLines = async (absolutePath: string): Promise<string[] | null> => {
  if (fileCache.has(absolutePath)) return fileCache.get(absolutePath)!;
  try {
    const raw = (await fsReadFile(absolutePath)).toString("utf-8");
    const lines = normalizeToLF(stripBom(raw).text).split("\n");
    fileCache.set(absolutePath, lines);
    return lines;
  } catch {
    fileCache.set(absolutePath, null);
    return null;
  }
};
```

*Note: Fix deferred — the bug is latent and harmless under current single-lookup-per-group usage. Track for a follow-up cleanup.*

### Minor

**Test helper duplication** — `getSgTool()` is copy-pasted identically across all 7 `tests/sg.*.test.ts` files; `text()` is duplicated in 3 of them. A shared `tests/sg-test-utils.ts` would eliminate the noise, but this is a style concern with no behavioral impact.

**`src/sg.ts:64` — `JSON.parse` failure produces a confusing error message**  
If sg emits non-JSON output (e.g. a startup warning before the JSON), `JSON.parse(stdout)` throws a `SyntaxError`. The outer catch returns `err.message` which would be something like `Unexpected token W in JSON at position 0` with no hint about what went wrong. This is low-likelihood with `--json`, but a dedicated `JSON.parse` try/catch with a clearer message ("sg returned unexpected output:…") would help debugging.

---

## Recommendations

- Apply the `null`-sentinel fix for `getFileLines` in the next cleanup pass — it's 3 lines and removes the latent inconsistency.
- Consider extracting `tests/sg-test-utils.ts` when adding more sg tests in future — low priority while the suite is this size.

---

## Assessment

**ready**

The implementation is clean, well-scoped, and handles the non-trivial cases correctly (directory vs. file path resolution, 0→1 indexing, actual-content hash computation, silent file-skip). The Important finding is latent and harmless in current usage patterns. All 24 test files / 112 tests green.
