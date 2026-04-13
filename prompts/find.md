Find files recursively matching a glob pattern. Respects `.gitignore` (including nested), always includes hidden files. Returns sorted relative paths with structured metadata.

## Parameters

- `pattern` — Glob pattern to match filenames (e.g. `'*.ts'`, `'*.test.ts'`, `'Dockerfile*'`). **Required.**
- `path` — Directory to search (default: current directory)
- `limit` — Maximum entries to return (default: 1000)
- `type` — Filter by entry type: `"file"` (default), `"dir"`, or `"any"`
- `maxDepth` — Maximum directory depth to search

## Output

One path per line, sorted lexicographically. Paths are relative to `cwd` with forward slashes. Directories (when `type: "dir"` or `type: "any"`) show a trailing `/` suffix.

When the entry count exceeds `limit`, a truncation notice is appended. Output is also bounded at 50 KB.

## Usage Guidance

- Use `find` for recursive file discovery across the tree
- Use `type: "dir"` to discover directory structure
- Use `maxDepth: 1` for shallow exploration without switching to `ls`
- Use `ls` instead for single-directory inspection
- Use `grep` to search file *contents*, not file names

## Backend

Uses `fd` when available for maximum speed. Falls back to a pure Node.js implementation when `fd` is not installed. Both backends produce identical, deterministic output.
