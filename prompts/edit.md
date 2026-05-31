Surgically edit existing text files. Prefer hash-verified anchored edits from fresh `read`, `grep`, `ast_search`, or `write` output; copy `LINE:HASH` anchors exactly.

`edit` requires the target file to have been anchored earlier in the current session. If you get `file-not-read`, run `read`, `grep`, `ast_search`, or `write` first.

## Variants

| Variant | Use | Anchors |
|---|---|---|
| `set_line` | Replace/delete one line | 1 |
| `replace_lines` | Replace/delete a contiguous range | 2 |
| `insert_after` | Insert after an existing line | 1 |
| `replace_symbol` | Replace one function/class/method/etc. | 0 (`symbol`) |
| `replace` | String replacement escape hatch; one match by default, all with `all: true` | 0 |

Set `new_text` (or `replace_lines` `new_text`) to `""` to delete the anchored line(s). For an intentionally blank line, use `"\n"` or whitespace content, not `""`.
Prefer `set_line`, `replace_lines`, and `insert_after`: they verify the file still matches the anchored content. Use `replace` only when anchors are impractical, such as repeated text across many unrelated lines.

`replace` is exact-only by default: missing `old_text` fails with `text-not-found`. Wrap old_text/new_text in {replace: ...} — a bare top-level `{old_text, new_text}` inside `edits[]` is rejected with guidance. `fuzzy: true` is a narrow fallback that only normalizes whitespace and confusable Unicode (e.g. smart hyphens) after exact matching fails; it is **not approximate or Levenshtein/semantic matching** and will not find renamed or reworded text. When fuzzy matching is used, the response warns that exact text was not found.

## Input shape

```json
{
  "path": "src/foo.ts",
  "edits": [
    { "set_line": { "anchor": "42:ab1", "new_text": "const x = 2;" } },
    { "replace_lines": { "start_anchor": "50:c3d", "end_anchor": "55:e4f", "new_text": "const y = 3;\nreturn y;" } },
    { "insert_after": { "anchor": "60:f5a", "new_text": "// TODO\n" } },
    { "replace_symbol": { "symbol": "add", "new_body": "export function add(a, b) {\n  return a + b;\n}" } },
    { "replace": { "old_text": "value", "new_text": "result", "all": true } }
  ]
}
```

Use only the variant(s) needed for the task; the example shows all shapes together for reference. Each `edits[]` entry must contain exactly one variant key. `new_text` / `new_body` is plain file content — no hash prefixes or diff markers.

## Optional post-edit verification

`postEditVerify: true` opts into post-write persisted-content verification for this one call. It is default off: when omitted or false, successful edits use the normal fast path and do not perform an extra read-back check.

When enabled, `edit` first runs the normal validation and write path. Only after the write succeeds, it reads the file back from disk and compares the persisted content to the exact intended content, including BOM restoration and original line-ending restoration. This is not syntax validation; syntax validation is the separate pre-write `syntaxValidate` / `PI_HASHLINE_SYNTAX_VALIDATE` guard described below.

## `replace_symbol`

Use `replace_symbol` to replace one function, class, method, interface, type, enum, or similar symbol. Query symbols like `read symbol:`: `Name`, `Class.method`, or `Name@<line>`.

Rules:
- Use an exact name, dotted path, or `@<line>`. If `read({symbol})` returned a fuzzy match, confirm the exact symbol before editing.
- Supported for TypeScript, JavaScript, Rust, and Java. For other languages, use anchored edits.
- `new_body` must not be empty or whitespace-only.
- Write `new_body` without extra leading indentation; `edit` re-indents it to match the original symbol.
- If `new_body` appears to declare a different symbol name, the edit still applies but returns a `name-mismatch` warning.
- Do not combine `replace_symbol` with anchored edits that touch the same lines. Duplicate/overlapping `replace_symbol` ranges are rejected.

## Stale anchors

If anchors no longer match, `edit` fails with a hash mismatch (`hash-mismatch`) and shows nearby current lines. Lines marked `>>>` include updated anchors:

```text
>>> 41:b34|  const renamed = 3;
```

Copy the updated `LINE:HASH` and retry. If the target moved farther away, re-run `read`, `grep`, `ast_search`, or `write` for fresh anchors.

If `edit` auto-relocates an anchor, check the warning and verify the edit landed in the intended place.

## Validation and warnings

- All edits are checked before writing; if a hard validation fails, nothing is written.
- Anchored edits are applied bottom-up so line numbers stay stable.
- `no-op` means the requested edit matched the current file already or produced identical content.
- A whitespace-only warning means formatting changed but behavior probably did not.
- A `replace`-only success may include a reminder to prefer anchored edits next time.

Syntax validation runs before writing when supported:
- Supported: Rust, C++, C headers, Java.
- Default `warn`: write succeeds, but warnings include `syntax-regression: lines X-Y`.
- `block`: aborts without writing.
- `off`: skips validation.
- `PI_HASHLINE_SYNTAX_VALIDATE` can set the default mode.

Existing syntax errors are tolerated; the warning is for newly introduced parser errors.

## Diff data contract

Successful `edit` results include `details.diffData` and `details.ptcValue.diffData` in addition to the existing `details.diff` / `ptcValue.diff` string fields. The string fields remain the backward-compatible human-readable fallback.

Successful `edit` results also include `details.patch`: a standard unified diff (`---`/`+++` file headers and `@@` hunk headers) generated from the pre-/post-edit file contents. Use `details.patch` when you need a portable, tool-agnostic patch (e.g. to apply elsewhere); use the compact `details.diff` hashline string for human-readable in-session display. `details.patch` is additive and does not change `details.diff`.

`diffData` is a stable versioned contract:

```ts
type DiffData = {
  version: 1;
  entries: Array<
    | { kind: "context"; oldLine: number; newLine: number; text: string }
    | { kind: "add"; newLine: number; text: string }
    | { kind: "remove"; oldLine: number; text: string }
    | { kind: "meta"; text: string }
  >;
  stats: { added: number; removed: number; context: number };
  language?: string;
  blockRanges?: Array<{ kind: "add" | "remove"; startLine: number; endLine: number }>;
  inlineDiffs?: Array<{
    removeLineIndex: number;
    addLineIndex: number;
    removeSpans: Array<{ kind: "equal" | "remove" | "add"; text: string }>;
    addSpans: Array<{ kind: "equal" | "remove" | "add"; text: string }>;
  }>;
};
```

For compact one-line hashline diffs, `details.diff` remains compact, while `diffData.entries` uses expanded remove/add rows so renderers can show inline word changes without breaking hashline output.