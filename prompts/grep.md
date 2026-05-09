Search file contents. Returns matching lines with `LINE:HASH` anchors for direct use with `edit` — no intermediate `read` needed.

## Search Modes
- **Default**: matching lines prefixed `LINE:HASH|content`. `>>` marks match lines, `  ` marks context.
- **Context mode** (`context: N`): includes N lines before/after each match. Nearby matches merged.
- **Summary mode** (`summary: true`): per-file match counts only — no content, no anchors. Use first to scope broad searches.
- **Symbol-scoped** (`scope: "symbol"`): groups matches by enclosing symbol. `scopeContext: N` windows output to ±N lines around each match (clipped at symbol boundary). `scopeContext: 0` = match lines only.

## Parameters
- `pattern` — regex (default) or literal string with `literal: true`
- `path` — directory/file to search (default: cwd)
- `glob` — file filter, e.g. `'*.ts'`
- `ignoreCase` — case-insensitive (default: false)
- `context` — context lines around each match (default: 0)
- `limit` — max matches (default: 100)
- `summary`, `scope`, `scopeContext` — see modes above
- `literal` — treat pattern as literal string. Use for exact matches to avoid regex escaping issues.

## Truncation
- Match count hits `limit` → `[Results truncated at N matches — refine pattern or increase limit]`
- Rendered output exceeds budget → head-truncated with `[Output truncated: ...]`

## Guidance
- Use `summary: true` first to scope, then drill into specific files with `path` or `glob`.
- Use `literal: true` for exact strings containing regex metacharacters.
- Use `scope: "symbol"` when you need enclosing context, not just match lines.
- For structural patterns (function calls, imports, JSX), prefer `ast_search`.
