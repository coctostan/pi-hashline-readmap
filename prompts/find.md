Find files recursively by name. Uses glob patterns by default, respects nested `.gitignore`, includes hidden files, and returns paths relative to the resolved search root (`path`, default cwd).

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

One path relative to the resolved search root per line. Directories end with `/`. If results exceed `limit` or 50 KB, output says it was truncated.
Filtering and sorting happen before `limit`, so queries like largest/newest files work as expected.

Use `find` for recursive file-name discovery, `ls` for one directory, and `grep` for file contents. Remember: `pattern` matches basenames, not full paths. A pattern containing `/` (e.g. `src/*.ts`) will not match — scope the directory via `path:` instead (e.g. `find("*.ts", path: "src/readmap")`). When a slash-containing glob returns nothing, the result includes a hint to this effect.

### Composing discovery with read/edit

Successful structured `entries[].path` values are relative to the resolved search root, not necessarily cwd. Keep the resolved root and join it with each entry before calling read or edit; these tools resolve relative inputs against cwd. Do not pass a bare entry from an external root directly to read/edit.

A relative input such as `path: "src/readmap"` resolves against cwd; an omitted path uses cwd. For absolute or expanded input roots, use the resolved root rather than assuming the input string is already resolved. One way to obtain it in codemode is the successful ls result:

~~~js
const directory = await tools.ls({path: "src/readmap", limit: 1});
const found = await tools.find({path: directory.path, pattern: "*.ts", limit: 1});
if (found.entries.length) {
  const filePath = directory.path + "/" + found.entries[0].path;
  const file = await tools.read({path: filePath});
  text({path: file.path, lines: file.lines.length, truncated: found.truncated});
}
~~~

This does not change returned paths or truncation semantics and adds no result field.
