---
id: 10
type: feature
status: open
created: 2026-02-26T21:09:00Z
milestone: M3
priority: 8
---

# AST-grep pi tool wrapper with hashlined results

Register a new `sg` tool that wraps ast-grep CLI and returns hashline-formatted results.

**Schema:**
- `pattern: string` — AST pattern (e.g., "console.log($$$ARGS)")
- `lang?: string` — Language: ts, js, py, go, rust, c, cpp
- `path?: string` — File or directory (default: cwd)
- `rewrite?: string` — Replacement pattern for search-and-replace

**Implementation:**
1. Check `sg` is installed, helpful error if not
2. Execute `sg --json -p '<pattern>' -l <lang> [path]`
3. Parse JSON output
4. For each match: hash the matched lines
5. Format as `>>FILE:LINE:HASH|content` (hashline grep format)
6. If rewrite: use `sg -p ... --rewrite ...` and return diff

**Location**: `src/sg.ts`, registered in `index.ts`

**Prerequisite**: ast-grep installed (M0)
