# Brainstorm: AST-Grep Pi Tool Wrapper

## Approach

Add a new `sg` tool to the extension that wraps the `ast-grep` CLI (`sg run --json`) and returns hashline-formatted results. The agent calls `sg({ pattern, lang?, path? })`, the tool spawns `sg run --json -p <pattern>`, parses the structured JSON output, reads the actual source files to compute real hashline anchors, and returns results grouped by file with `>>LINE:HASH|content` formatting — identical to the grep tool's output style. This means sg results feed directly into the `edit` tool with no intermediate `read` step needed.

The tool is search-only — no rewrite support in v1. The agent already has the `edit` tool for making changes, and the search→edit workflow gives it per-match control that blind bulk rewrite doesn't. Rewrite can be added later if there's a real use case.

The implementation follows the same pattern as `src/grep.ts`: a single file (`src/sg.ts`) that registers the tool, spawns the CLI, parses output, computes hashline anchors from source files, and formats results. A prompt file (`prompts/sg.md`) teaches the agent ast-grep pattern syntax, metavariables, and the search→edit workflow.

## Key Decisions

- **Search only, no rewrite** — the agent gets more control with search→edit than bulk rewrite. Lower complexity, no file mutation concerns, no stale-anchor issues.
- **Hashline-anchored output** — matches use real `LINE:HASH` anchors computed from source files (not from sg's match text), so they're directly compatible with the `edit` tool.
- **Output format mirrors grep** — `path/to/file:>>LINE:HASH|content` grouped by file. Familiar to the agent, consistent with existing tools.
- **Language auto-detection** — `lang` parameter is optional. When omitted, sg infers from file extensions. When provided, passed as `-l <lang>`.
- **Spawns CLI, not a library** — ast-grep is a Rust binary with no Node.js bindings. Spawning `sg run --json` is the only option and keeps the dependency to a brew-installed binary.
- **Silent on no matches** — returns "No matches found" text, not an error. Matches grep behavior.
- **Clear error when sg not installed** — checks for sg availability and returns actionable install instructions.

## Components

1. **`src/sg.ts`** — Tool registration, CLI spawning, JSON parsing, hashline formatting
   - `registerSgTool(pi)` — main entry point
   - Parses sg JSON output (array of `{ file, range, text, lines }` objects)
   - Reads source files, computes `computeLineHash()` for each matched line
   - Groups matches by file, formats with `>>LINE:HASH|content`
2. **`prompts/sg.md`** — Agent-facing documentation
   - Pattern syntax and metavariable types (`$NAME`, `$$$ARGS`, `$_`)
   - Common patterns (find function calls, class methods, imports)
   - Search→edit workflow examples
3. **`index.ts`** — Add `registerSgTool(pi)` call
4. **`tests/sg.test.ts`** — Unit tests for JSON parsing and formatting
5. **`tests/sg-integration.test.ts`** — Integration tests against real fixtures

## Testing Strategy

- **Unit tests** (`tests/sg.test.ts`):
  - JSON parsing: sg output → structured match objects
  - Hashline formatting: match objects + source lines → formatted output with correct anchors
  - Error cases: sg not installed, bad pattern, no matches
- **Integration tests** (`tests/sg-integration.test.ts`):
  - Real sg invocation against `tests/fixtures/small.ts` with known patterns
  - Verify hashline anchors match actual file content (edit-compatible)
  - Verify multi-line match spans produce correct line ranges
  - Verify file grouping when matches span multiple files
- **Prompt tests**: Verify `prompts/sg.md` exists and contains required sections
- **Schema test**: Verify tool parameters include `pattern` (required), `lang` (optional), `path` (optional)
