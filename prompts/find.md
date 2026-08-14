Find files recursively by name. Uses glob patterns by default, respects nested `.gitignore`, includes hidden files, and returns relative paths.

> **Detailed reference document.** The provider-visible contract is [documented separately](../docs/tool-metadata.md) and consists of registered tool/parameter descriptions, snippets, and guidelines. This file is not loaded into `session.systemPrompt`. Changing this prompt body alone does not change provider-visible metadata.

## Parameters

- `pattern` — required. Glob by default; with `regex: true`, JavaScript regex against each basename.
- `path` — directory to search, default cwd.
- `type` — `"file"` default, `"dir"`, or `"any"`.
- `limit` — max returned entries after filtering/sorting, default 1000.
- `maxDepth` — non-negative directory depth limit.
- `sortBy` — `"name"` default, `"mtime"`, or `"size"`; use `reverse: true` for descending/newest/largest first.
- `modifiedSince` — keep entries modified strictly after an ISO date/time or relative age like `30m`, `1h`, `24h`, `7d`.
- `minSize` / `maxSize` — file-size filters, inclusive; numbers are bytes, strings accept 1024-based `KB`, `MB`, `GB`, etc. Directories are not removed by size filters.

## Output and usage

One relative path per line. Directories end with `/`. If results exceed `limit` or 50 KB, output says it was truncated.
Filtering and sorting happen before `limit`, so queries like largest/newest files work as expected.

Use `find` for recursive file-name discovery, `ls` for one directory, and `grep` for file contents. Remember: `pattern` matches basenames, not full paths. A pattern containing `/` (e.g. `src/*.ts`) will not match — scope the directory via `path:` instead (e.g. `find("*.ts", path: "src/readmap")`). When a slash-containing glob returns nothing, the result includes a hint to this effect.
