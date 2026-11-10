Find files recursively by name. Uses glob patterns by default, respects nested `.gitignore`, includes hidden files, and returns each path from the cwd, whatever `path` it searched (absolute for a root outside the cwd).

> **Detailed reference document.** The provider-visible contract is [documented separately](../docs/tool-metadata.md) and consists of registered tool/parameter descriptions, snippets, and guidelines. This file is not loaded into `session.systemPrompt`. Changing this prompt body alone does not change provider-visible metadata.

## Parameters

- `pattern` — required. Glob by default; with `regex: true`, JavaScript regex against each basename.
- `path` — directory to search, default cwd. Relative paths resolve against cwd; absolute paths and existing path expansion use the normal path utilities.
- `type` — `"file"` default, `"dir"`, or `"any"`.
- `limit` — max returned entries after filtering/sorting, default 1000.
- `maxDepth` — non-negative directory depth limit.
- `sortBy` — `"name"` default, `"mtime"`, or `"size"`; use `reverse: true` for descending/newest/largest first.
- `modifiedSince` — keep entries modified strictly after an ISO date/time or relative age like `30m`, `1h`, `24h`, `7d`.
- `minSize` / `maxSize` — file-size filters, inclusive; numbers are bytes, strings accept 1024-based `KB`, `MB`, `GB`, etc. Directories are not removed by size filters.

## Output and usage

One path from the cwd per line: `find("*.ts", path: "src/readmap")` prints `src/readmap/mappers/go.ts`, not `mappers/go.ts`. An entry outside the cwd prints its absolute path. Directories end with `/`. If results exceed `limit` or 50 KB, output says it was truncated.
Filtering and sorting happen before `limit`, so queries like largest/newest files work as expected.

Use `find` for recursive file-name discovery, `ls` for one directory, and `grep` for file contents. Remember: `pattern` matches basenames, not full paths. A pattern containing `/` (e.g. `src/*.ts`) will not match — scope the directory via `path:` instead (e.g. `find("*.ts", path: "src/readmap")`). When a slash-containing glob returns nothing, the result includes a hint to this effect.

### Composing discovery with read/edit

Successful structured `entries[].path` values match the text lines: from the cwd, or absolute outside it. read and edit resolve relative inputs against the same cwd, so pass an entry to them as-is, with no join:

~~~js
const found = await tools.find({path: "src/readmap", pattern: "*.ts", limit: 1});
if (found.entries.length) {
  const file = await tools.read({path: found.entries[0].path});
  text({path: file.path, lines: file.lines.length, truncated: found.truncated});
}
~~~
