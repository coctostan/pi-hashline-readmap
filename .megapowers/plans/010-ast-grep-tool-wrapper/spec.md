# Spec: AST-Grep Tool Wrapper (M3)

## Goal

Register a new `sg` tool in the pi extension that wraps the `ast-grep` CLI, executes structural code searches, and returns results with hashline-anchored output — enabling a direct search→edit workflow without an intermediate `read` step.

## Acceptance Criteria

### Tool Registration & Schema

1. The extension registers a tool named `sg` with `registerSgTool(pi)` called from `index.ts`.

2. The tool schema has a required `pattern` parameter (string).

3. The tool schema has an optional `lang` parameter (string) — language hint for ast-grep.

4. The tool schema has an optional `path` parameter (string) — directory or file to search, defaults to cwd.

### CLI Invocation

5. When `lang` is provided, the tool invokes `sg run --json -p <pattern> -l <lang> <path>`.

6. When `lang` is omitted, the tool invokes `sg run --json -p <pattern> <path>` (letting sg auto-detect).

7. The tool resolves `path` relative to `ctx.cwd` (same as grep tool behavior).

### Output Formatting

8. Each match is formatted with hashline anchors: lines within the match range use `>>LINE:HASH|content` format where LINE is 1-indexed and HASH is computed from `computeLineHash()` against the actual source file content.

9. When matches span multiple files, output is grouped by file with a `--- path/to/file ---` header before each file's matches.

10. Multi-line matches produce one hashline-anchored row per line in the match range (from `range.start.line` to `range.end.line`, inclusive).

11. Line numbers in the output are 1-indexed (sg returns 0-indexed lines; the tool adds 1).

12. Hash anchors are computed from the actual source file lines (read the file, not sg's `text` field) — ensuring edit-tool compatibility.

### No-Match Behavior

13. When sg returns zero matches (`[]`), the tool returns text: `"No matches found for pattern: <pattern>"` — not an error.

### Error Handling

14. When `sg` is not installed (command not found), the tool returns `isError: true` with text: `"ast-grep (sg) is not installed. Run: brew install ast-grep"`.

15. When sg exits with a non-zero code (e.g., bad pattern), the tool returns `isError: true` with sg's stderr as the error text.

16. When a matched source file cannot be read (e.g., deleted between search and format), that match is skipped silently.

### Edit Compatibility

17. Hash anchors from sg output are valid for use with the edit tool — a `set_line` edit using an anchor from sg output modifies the correct line in the source file.

### Prompt Documentation

18. `prompts/sg.md` exists and documents: pattern syntax, metavariable types (`$NAME` for single node, `$$$ARGS` for multiple nodes, `$_` for wildcard), common pattern examples, and the search→edit workflow.

19. `prompts/sg.md` is loaded as the tool's description/prompt (registered in tool definition or referenced in prompt loading).

### Integration

20. `index.ts` calls `registerSgTool(pi)` alongside the existing `registerReadTool`, `registerEditTool`, and `registerGrepTool` calls.

## Out of Scope

- Rewrite / replace mode (bulk mutation via sg)
- Rule-based scanning (`sg scan` with config files)
- Metavariable extraction in output (showing captured `$NAME` values)
- Context lines around matches
- Match count limits / pagination
- Interactive / streaming results

## Open Questions

None.
