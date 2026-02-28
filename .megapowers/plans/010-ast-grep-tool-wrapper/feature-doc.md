# Feature: AST-Grep Tool Wrapper (`sg`)

**Issue:** #010  
**Milestone:** M3  
**Status:** Shipped

---

## What Was Built

A new `sg` tool registered in the pi extension that wraps the [`ast-grep`](https://ast-grep.github.io/) CLI (`sg`). It executes structural code searches and returns results formatted with **hashline anchors** — the same `>>LINE:HASH|content` format used by the `read` tool — making sg output directly usable with the `edit` tool without any intermediate `read` step.

### Files Added / Modified

| File | Change |
|------|--------|
| `src/sg.ts` | New — full tool implementation (141 lines) |
| `prompts/sg.md` | New — tool description + pattern syntax docs |
| `index.ts` | Modified — added `registerSgTool(pi)` call |
| `tests/sg.schema.test.ts` | New — schema shape and required fields |
| `tests/sg.args.test.ts` | New — `-l` flag present/absent per `lang` param |
| `tests/sg.execute-errors.test.ts` | New — ENOENT and non-zero exit handling |
| `tests/sg.format.test.ts` | New — hashline anchors, multi-file grouping, unreadable file skip, edit compatibility |
| `tests/sg.no-match.test.ts` | New — empty result friendly message |
| `tests/sg.path-resolution.test.ts` | New — cwd-relative path resolution |
| `tests/sg.prompt-loading.test.ts` | New — description loaded from `prompts/sg.md` |
| `tests/entry-point.test.ts` | Modified — added "registers sg tool" assertion |
| `tests/prompts-files.test.ts` | Modified — added `prompts/sg.md` content check |

---

## Why It Was Built

The existing `grep` tool searches by text pattern (regex). It can't find code by structure — e.g., "all function calls where the first argument is a string literal" or "all exported arrow functions". `ast-grep` fills that gap with metavariable-based AST patterns.

The key design decision was making sg output **edit-compatible from the start**: rather than returning raw sg JSON or plain text, the tool reads the matched source files and computes `computeLineHash()` anchors against the actual file content. This means the search→edit workflow requires zero intermediate steps:

```
sg({ pattern: "console.log($$$ARGS)" })
→ >>42:ab|console.log("hello")
→ edit({ path: "src/foo.ts", edits: [{ set_line: { anchor: "42:ab", new_text: "logger.info(\"hello\")" } }] })
```

---

## How It Works

### Tool Schema

```ts
{
  name: "sg",
  parameters: {
    pattern: string,          // required — AST pattern (metavariables: $NAME, $$$ARGS, $_)
    lang?: string,            // optional — language hint (e.g. "typescript", "python")
    path?: string,            // optional — file or directory to search, defaults to cwd
  }
}
```

### CLI Invocation

- With `lang`: `sg run --json -p <pattern> -l <lang> <resolved-path>`
- Without `lang`: `sg run --json -p <pattern> <resolved-path>`

`path` is resolved relative to `ctx.cwd` using `resolveToCwd()` (same behavior as the `grep` tool).

### Output Format

```
--- src/app.ts ---
>>42:ab|console.log("starting app")
>>43:cd|console.log("config loaded", config)
--- src/utils.ts ---
>>17:ef|console.log(err.message)
```

Each `>>LINE:HASH|content` line is a hashline anchor. `LINE` is 1-indexed (sg returns 0-indexed; the tool adds 1). `HASH` is computed from `computeLineHash(lineNumber, actualFileContent)` — **not** from sg's `text` field — ensuring the anchor matches what the edit tool will verify.

Multi-file results are grouped by file with one `--- path ---` header per file.

### Error Cases

| Condition | Response |
|-----------|----------|
| `sg` not installed | `isError: true`, "ast-grep (sg) is not installed. Run: brew install ast-grep" |
| Non-zero exit (bad pattern, etc.) | `isError: true`, sg's stderr text |
| Zero matches | `isError: false`, "No matches found for pattern: \<pattern\>" |
| Matched file unreadable/deleted | That file's matches are silently skipped |

---

## Pattern Syntax Quick Reference

| Pattern | Matches |
|---------|---------|
| `$NAME` | Any single AST node |
| `$$$ARGS` | Zero or more nodes (variadic) |
| `$_` | Any single node (unnamed wildcard) |
| `console.log($$$ARGS)` | All `console.log` calls |
| `export function $NAME($$$PARAMS) { $$$BODY }` | Exported function declarations |
| `$OBJ.$METHOD($$$ARGS)` | All method calls |
| `import $NAME from '$SOURCE'` | Default imports |

See `prompts/sg.md` for the full reference loaded as the tool's description.

---

## Testing

10 new test files, 10 new tests, covering all 20 acceptance criteria. Key test highlights:

- **Edit compatibility** (`sg.format.test.ts`): End-to-end — takes an anchor from sg output and applies it through `applyHashlineEdits()`, verifying the correct line is modified in the source file.
- **Actual-content hashing** (`sg.format.test.ts`): Independently reads `tests/fixtures/small.ts`, computes expected hashes, and asserts all 5 anchors match — confirming anchors use real file content, not sg's `text` field.
- **Silent file skip** (`sg.format.test.ts`): Mix of readable and unreadable paths — confirms no error, correct file present, missing file absent.
- **ENOENT detection** (`sg.execute-errors.test.ts`): Verifies the install hint message appears exactly when `execFile` fails with `err.code === "ENOENT"`.

---

## Known Limitations / Follow-ups

- **Cache sentinel inconsistency** (`src/sg.ts:82-84`): On read failure, `fileCache` stores `[]` but returns `undefined`. Harmless in current usage (each abs path looked up once per call), but should use `null` as the explicit sentinel in a cleanup pass.
- **Test helper duplication**: `getSgTool()` is copy-pasted across all 7 `tests/sg.*.test.ts` files. Extract to `tests/sg-test-utils.ts` when adding future sg tests.
- **Out of scope** (intentional): sg rewrite/replace mode, `sg scan` with config files, metavariable capture in output, context lines, result pagination.
