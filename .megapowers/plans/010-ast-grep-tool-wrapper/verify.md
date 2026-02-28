# Verification Report: AST-Grep Tool Wrapper (M3)

## Test Suite Results

```
 ✓ tests/task5-fixtures.test.ts (6 tests) 6ms
 ✓ tests/sg.prompt-loading.test.ts (1 test) 100ms
 ✓ tests/sg.path-resolution.test.ts (1 test) 95ms
 ✓ tests/sg.schema.test.ts (1 test) 100ms
 ✓ tests/sg.no-match.test.ts (1 test) 81ms
 ✓ tests/sg.execute-errors.test.ts (2 tests) 88ms
 ✓ tests/sg.args.test.ts (1 test) 96ms
 ✓ tests/sg.format.test.ts (3 tests) 104ms
 ✓ tests/symbol-lookup.test.ts (12 tests) 2ms
 ✓ tests/hashline-files.test.ts (6 tests) 2ms
 ✓ tests/rtk-forbidden-files.test.ts (3 tests) 2ms
 ✓ tests/readme-content.test.ts (4 tests) 2ms
 ✓ tests/rtk-required-files.test.ts (6 tests) 2ms
 ✓ tests/prompts-files.test.ts (4 tests) 4ms
 ✓ tests/readme-license.test.ts (12 tests) 7ms
 ✓ tests/readmap-core-files.test.ts (5 tests) 2ms
 ✓ tests/readmap-mappers-files.test.ts (7 tests) 1ms
 ✓ tests/full-suite-green.test.ts (1 test) 1ms
 ✓ tests/scripts-files.test.ts (2 tests) 1ms
 ✓ tests/map-cache.test.ts (6 tests) 211ms
 ✓ tests/entry-point.test.ts (4 tests) 635ms
 ✓ tests/symbol-read-integration.test.ts (11 tests) 637ms
 ✓ tests/task2-map-in-read.test.ts (1 test) 770ms
 ✓ tests/read-integration.test.ts (12 tests) 989ms

 Test Files  24 passed (24)
       Tests  112 passed (112)
    Duration  1.35s
```

---

## Per-Criterion Verification

### Criterion 1: The extension registers a tool named `sg` with `registerSgTool(pi)` called from `index.ts`.
**Evidence:** `index.ts` line 5: `import { registerSgTool } from "./src/sg.js";`; line 10: `registerSgTool(pi);`.  
`tests/entry-point.test.ts` test "registers sg tool" calls `mod.default(mockPi)` and asserts `tools` contains `"sg"` — passes.  
**Verdict:** pass

### Criterion 2: The tool schema has a required `pattern` parameter (string).
**Evidence:** `src/sg.ts` line 44: `pattern: Type.String({ description: "AST pattern to search for" })`.  
`tests/sg.schema.test.ts` asserts `tool.parameters.properties.pattern.type === "string"` and `tool.parameters.required` contains `"pattern"` — passes.  
**Verdict:** pass

### Criterion 3: The tool schema has an optional `lang` parameter (string).
**Evidence:** `src/sg.ts` line 45: `lang: Type.Optional(Type.String({ description: "Language hint for ast-grep..." }))`.  
`tests/sg.schema.test.ts` asserts `lang.type === "string"` and `required` does NOT contain `"lang"` — passes.  
**Verdict:** pass

### Criterion 4: The tool schema has an optional `path` parameter (string), defaults to cwd.
**Evidence:** `src/sg.ts` line 46: `path: Type.Optional(Type.String(...))`. Line 54: `resolveToCwd(p.path ?? ".", ctx.cwd)` defaults to `"."`.  
`tests/sg.schema.test.ts` asserts `path.type === "string"` and not in `required` — passes.  
**Verdict:** pass

### Criterion 5: When `lang` is provided, invokes `sg run --json -p <pattern> -l <lang> <path>`.
**Evidence:** `src/sg.ts` lines 51–52: `args = ["run", "--json", "-p", p.pattern]` then `if (p.lang) args.push("-l", p.lang)`.  
`tests/sg.args.test.ts` mock confirms `calls[0]` contains `"-l"` and `"python"` when `lang: "python"` provided — passes.  
**Verdict:** pass

### Criterion 6: When `lang` is omitted, invokes `sg run --json -p <pattern> <path>` (no -l).
**Evidence:** Same code path in `src/sg.ts` — `-l` only pushed when `p.lang` truthy.  
`tests/sg.args.test.ts` confirms `calls[1]` does NOT contain `"-l"` when no lang — passes.  
**Verdict:** pass

### Criterion 7: The tool resolves `path` relative to `ctx.cwd`.
**Evidence:** `src/sg.ts` line 54: `const searchPath = resolveToCwd(p.path ?? ".", ctx.cwd)`.  
`tests/sg.path-resolution.test.ts` calls with `{ path: "src", cwd: "/my/project" }` and asserts last arg is `"/my/project/src"` — passes.  
**Verdict:** pass

### Criterion 8: Each match is formatted with `>>LINE:HASH|content` anchors using `computeLineHash()`.
**Evidence:** `src/sg.ts` line 112: `` blocks.push(`>>${ln}:${computeLineHash(ln, srcLine)}|${srcLine}`) ``.  
`tests/sg.format.test.ts` `parseAnchors` regex matches `>>(\d+):([0-9a-f]{2})\|(.*)` on output; 5 anchors found for range 44–48 — passes.  
**Verdict:** pass

### Criterion 9: Multi-file output grouped by file with `--- path/to/file ---` header.
**Evidence:** `src/sg.ts` line 106: `` blocks.push(`--- ${display} ---`) `` once per file group.  
`tests/sg.format.test.ts` "groups output by file" test: 3 matches across 2 files → `headers.length === 2` — passes.  
**Verdict:** pass

### Criterion 10: Multi-line matches produce one row per line (range inclusive).
**Evidence:** `src/sg.ts` lines 108–113: `start = m.range.start.line + 1`, `end = m.range.end.line + 1`, loop `ln = start; ln <= end; ln++`.  
`tests/sg.format.test.ts`: range `start.line=44, end.line=48` → 5 anchors (lines 45–49) — passes.  
**Verdict:** pass

### Criterion 11: Line numbers are 1-indexed (sg 0-indexed → tool adds 1).
**Evidence:** `src/sg.ts` lines 108–109: `+1` applied to both start and end.  
`tests/sg.format.test.ts` asserts `anchors[0].line === 45` for sg line 44, `anchors[4].line === 49` for sg line 48 — passes.  
**Verdict:** pass

### Criterion 12: Hash anchors computed from actual source file lines, not sg's `text` field.
**Evidence:** `src/sg.ts` lines 78–79: file read via `fsReadFile`, normalized, split into `lines`. Line 111: `lines[ln - 1]` used (not `m.text`).  
`tests/sg.format.test.ts` independently reads `small.ts`, computes `computeLineHash(a.line, fileLines[a.line - 1])`, asserts `a.hash === computed` for all 5 anchors — passes.  
**Verdict:** pass

### Criterion 13: Zero matches returns `"No matches found for pattern: <pattern>"`, not an error.
**Evidence:** `src/sg.ts` lines 65–70: `if (!Array.isArray(matches) || matches.length === 0)` → returns text `"No matches found for pattern: ${p.pattern}"` with no `isError`.  
`tests/sg.no-match.test.ts`: mocked `[]` → `result.isError` falsy, text `=== "No matches found for pattern: nonExistentPattern"` — passes.  
**Verdict:** pass

### Criterion 14: `sg` not installed → `isError: true` with install hint.
**Evidence:** `src/sg.ts` lines 126–132: `if (err?.code === "ENOENT")` → returns `isError: true`, text `"ast-grep (sg) is not installed. Run: brew install ast-grep"`.  
`tests/sg.execute-errors.test.ts`: mock throws `err.code = "ENOENT"` → `result.isError === true`, text matches exactly — passes.  
**Verdict:** pass

### Criterion 15: Non-zero exit → `isError: true` with sg's stderr.
**Evidence:** `src/sg.ts` lines 133–137: fallthrough catch returns `isError: true`, text `String(err?.stderr || ...)`.  
`tests/sg.execute-errors.test.ts`: mock exits with `err.code = 2`, stderr `"Error: invalid pattern"` → `result.isError === true`, text contains `"invalid pattern"` — passes.  
**Verdict:** pass

### Criterion 16: Unreadable matched files skipped silently.
**Evidence:** `src/sg.ts` lines 82–84: `catch { fileCache.set(absolutePath, []); return undefined }`. Line 105: `if (!lines) continue`.  
`tests/sg.format.test.ts` "skips matches from unreadable files": match on `/does/not/exist.ts` alongside `small.ts` → `result.isError` falsy, output contains `small.ts` but not `/does/not/exist.ts` — passes.  
**Verdict:** pass

### Criterion 17: Hash anchors from sg output are valid for the edit tool.
**Evidence:** `tests/sg.format.test.ts` performs end-to-end: takes anchor from sg output, calls `applyHashlineEdits(original, [{ set_line: { anchor, new_text: "// sg-anchor-test" } }])`, asserts `firstChangedLine === 45` and output contains `"// sg-anchor-test"` — passes.  
**Verdict:** pass

### Criterion 18: `prompts/sg.md` exists and documents metavariables and workflow.
**Evidence:** File at `prompts/sg.md` (884 bytes, verified via `ls`). Contents contain: `$NAME`, `$$$ARGS`, `$_`, "Workflow: search → edit", and edit tool usage example.  
`tests/prompts-files.test.ts` "sg prompt exists and documents metavariables and workflow" asserts all of these — passes.  
**Verdict:** pass

### Criterion 19: `prompts/sg.md` is loaded as the tool's description.
**Evidence:** `src/sg.ts` line 18: `const SG_DESC = readFileSync(new URL("../prompts/sg.md", import.meta.url), "utf-8").trim()`. Line 42: `description: SG_DESC`.  
`tests/sg.prompt-loading.test.ts`: `tool.description.toContain("ast-grep")` and `tool.description.toContain("$NAME")` — passes.  
**Verdict:** pass

### Criterion 20: `index.ts` calls `registerSgTool(pi)` alongside `registerReadTool`, `registerEditTool`, `registerGrepTool`.
**Evidence:** `index.ts` lines 7–10:
```ts
registerReadTool(pi);
registerEditTool(pi);
registerGrepTool(pi);
registerSgTool(pi);
```
`tests/entry-point.test.ts` imports index, calls default export with mock pi, asserts `tools` contains `"sg"` — passes.  
**Verdict:** pass

---

## Overall Verdict

**pass**

All 20 acceptance criteria are met. The full test suite ran fresh in this session: 24 test files, 112 tests, 0 failures. Per-criterion verification was done independently by code inspection against the implementation (`src/sg.ts`, `index.ts`, `prompts/sg.md`) and by reviewing the specific test cases that exercise each requirement. No criterion relied on a test alone — each was independently confirmed against the source.
