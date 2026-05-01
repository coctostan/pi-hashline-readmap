Surgically edit files with hash-verified line references (anchors). Copy `LINE:HASH` strings exactly from `read`, `grep`, `ast_search`, or `write` output and use them to make precise changes.

## What edit does
`edit` applies one or more changes to an existing text file using hash-verified anchors. Anchored operations are verified against the current file contents before they are written.

## The five edit variants — when to use which

| Variant | Use for | Anchors needed |
|---|---|---|
| `set_line` | Replace or delete exactly one line | 1 |
| `replace_lines` | Replace or delete a contiguous range of lines | 2 |
| `insert_after` | Insert new lines after an existing line | 1 |
| `replace` | Fallback global string replacement | 0 |
| `replace_symbol` | Edit a named symbol (function, method, class) by AST lookup | 0 |

### Prefer anchored variants
`set_line`, `replace_lines`, and `insert_after` use `LINE:HASH` anchors and verify that the file still matches the content you saw earlier.
`edit` also requires the target file to have been anchored earlier in the current session. If it says the file was not read, run `read`, `grep`, `ast_search`, or `write` first to produce fresh anchors for that file.

### `replace` is the escape hatch
`replace` does not use anchors and does not verify exact line positions. Use it only when an anchored edit is not practical, such as a repeated string replacement across many unrelated lines.

## Input format

```json
{
  "path": "src/foo.ts",
  "edits": [
    { "set_line": { "anchor": "42:ab1", "new_text": "const x = 2;" } },
    { "replace_lines": { "start_anchor": "50:c3d", "end_anchor": "55:e4f", "new_text": "const y = 3;\nreturn y;" } },
    { "insert_after": { "anchor": "60:f5a", "new_text": "// TODO: revisit\n" } },
    { "replace": { "old_text": "value", "new_text": "result", "all": true } }
  ]
}
```

- `path` is the file to edit
- `edits` is an array of edit operations
- Each edit entry must contain exactly one of `set_line`, `replace_lines`, `insert_after`, `replace`, or `replace_symbol`
- `new_text` is plain content — do not include hash prefixes or diff markers

## Variant examples

### `set_line`
Use `set_line` when you are changing one existing line.

```text
edit({
  path: "src/foo.ts",
  edits: [
    { set_line: { anchor: "12:abc", new_text: "const enabled = true;" } }
  ]
})
```

### `replace_lines`
Use `replace_lines` when you are replacing a contiguous block.

```text
edit({
  path: "src/foo.ts",
  edits: [
    {
      replace_lines: {
        start_anchor: "20:def",
        end_anchor: "24:123",
        new_text: "if (!enabled) {\n  return;\n}"
      }
    }
  ]
})
```

### `insert_after`
Use `insert_after` when you are adding new lines after a known anchor.

```text
edit({
  path: "src/foo.ts",
  edits: [
    { insert_after: { anchor: "30:456", new_text: "console.log(enabled);\n" } }
  ]
})
```

### `replace`
Use `replace` only as the escape hatch when anchored variants are not practical.

```text
edit({
  path: "src/foo.ts",
  edits: [
    { replace: { old_text: "legacyName", new_text: "newName", all: true } }
  ]
})
```

### `replace_symbol`
Use `replace_symbol` to edit a named code symbol (function, method, class, field) without needing hash anchors. The tool uses the file's AST map to locate the symbol and applies a deterministic merge.

**Important:** `replacement` must be the **full** new version of the symbol (signature + body + closing brace), not a diff or partial snippet.

Use `# ... existing code ...` or `// ... existing code ...` markers inside the replacement to indicate where existing code should be kept.

```text
edit({
  path: "src/UserService.java",
  edits: [
    {
      replace_symbol: {
        symbol: "findUser",
        replacement: "public User findUser(String email) {\n    User user = userRepository.findByEmail(email);\n    log.debug(\"looking up {}\", email);\n    # ... existing code ...\n}"
      }
    }
  ]
})
```

**Supported languages:** Java, TypeScript/JavaScript, Python, Rust, Go, C/C++, Clojure, Swift, SQL, JSON, YAML, TOML, CSV, Markdown, Shell.

**How it works:**
1. Locates the symbol in the file's AST map
2. For multi-line symbols: uses deterministic merge with context anchors and markers
3. For short symbols (1-2 lines): auto-falls back to line-level editing
4. If merge fails: returns an error with a specific reason and suggests using `read(symbol)` + `set_line/replace_lines` instead

**Marker semantics:**
- Lines that match the original are kept as-is (context anchors)
- `# ...` / `// ...` / `...` markers indicate "keep existing code here"
- Lines that don't match and aren't markers are new code (inserted)
- Original lines in the gap between two matching lines are dropped

**Limitations and tips:**
- Do NOT use `# ...` / `// ...` markers when changing the method signature. Markers assume the signature line matches the original. If you change the signature, always provide the **full** replacement without markers.
- For overloaded methods, use `symbol@line` disambiguation (e.g. `"put@7"`) or dot notation (`"ClassName.methodName"`).
- For inner class fields, use just the field name without the container class prefix.
- After merge, the tool checks for syntax errors in the result. If found, it shows `⚠️` warnings — verify the code compiles before committing.

## Recovery from hash mismatch errors
When the file changes after you captured anchors, `edit` reports a hash mismatch and shows current file lines with `>>>` markers.

Example:

```text
3 lines have changed since last read. Auto-relocation checks only within ±20 lines.

    40:a12|function foo() {
>>> 41:b34|  const renamed = 3;
    42:c56|  return renamed;
```

Recovery steps:
1. Copy the updated `LINE:HASH` from the `>>>` line and retry the edit.
2. If the relevant content moved farther away, run `read` again.
3. If the error suggests nearby anchors, use the suggested anchor.
4. If a `replace_lines` edit partially relocates, re-read and recompute both anchors.

## Auto-relocation
If an anchor hash still matches uniquely within the relocation window, `edit` can auto-relocate the change and continue. Treat that as a warning to double-check the landing point.

## Common failure modes

### No changes made
If `edit` says the file did not change, your replacement may already match the current file contents.

### Whitespace-only change
If the result is classified as whitespace-only, verify that you changed the intended content and not just formatting.

### Missing anchor source
If `edit` says the file needs fresh anchors, obtain them with `read`, `grep`, `ast_search`, or `write` first.

### Invalid edit shape
Each edit entry must contain exactly one variant. Do not mix `set_line`, `replace_lines`, `insert_after`, and `replace` in the same entry.

## Anchor sources
Any tool that emits `LINE:HASH|content` anchors can feed `edit`:
- `read`
- `grep`
- `ast_search`
- `write`

## Worked examples

### Search, then edit with `grep`
```text
grep({ pattern: "addRoute", path: "src", literal: true })
edit({ path: "src/server.ts", edits: [{ set_line: { anchor: "45:e4f", new_text: "router.addRoute('/api', nextHandler);" } }] })
```

### Structure search, then edit with `ast_search`
```text
ast_search({ pattern: "const $NAME = $_", lang: "typescript", path: "src" })
edit({ path: "src/foo.ts", edits: [{ set_line: { anchor: "18:9ac", new_text: "const value = compute();" } }] })
```

### Create, then refine with `write`
```text
write({ path: "src/new-file.ts", content: "export const value = 1;\n" })
edit({ path: "src/new-file.ts", edits: [{ set_line: { anchor: "1:2f9", new_text: "export const value = 2;" } }] })
```

## Notes
- Always copy anchors exactly as shown.
- Prefer anchored variants over `replace`.
- Re-run `read`, `grep`, `ast_search`, or `write` whenever you need fresh anchors.
- Anchored edits are validated and applied atomically from bottom to top.
- If a non-whitespace-intent edit produces only whitespace-only changes, the tool emits a prominent warning so you can re-read and verify before assuming behavior changed.
- After a successful replace-only batch, the tool emits an informational hint nudging you back toward anchored variants for safer future edits.
