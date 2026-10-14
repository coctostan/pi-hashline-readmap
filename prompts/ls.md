List one directory. Shows directories first with `/`, then files, sorted alphabetically; dotfiles are included.

> **Detailed reference document.** The provider-visible contract is [documented separately](../docs/tool-metadata.md) and consists of registered tool/parameter descriptions, snippets, and guidelines. This file is not loaded into `session.systemPrompt`. Changing this prompt body alone does not change provider-visible metadata.

## Parameters

- `path` — directory to list, default cwd. Relative paths resolve against cwd; successful structured output returns the resolved absolute directory.
- `limit` — max entries, default 500; must be positive.
- `glob` — optional entry-name filter such as `*.ts` or `.env*`; brackets and braces must be balanced.

## Usage

Output is one entry per line. Use `ls` to inspect a single directory, `find` for recursive discovery, and `read` for file contents. If output exceeds `limit` or 50 KB, it says so.

### Composing listing with read/edit

Successful structured `entries[].name` values are basenames, not complete paths. Join the returned resolved absolute `path` with an entry name before calling read/edit. Use the returned path, not the original input string: a relative or expanded input may differ from the resolved directory.

~~~js
const listing = await tools.ls({path: "src", glob: "*.ts", limit: 1});
if (listing.entries.length) {
  const filePath = listing.path + "/" + listing.entries[0].name;
  const file = await tools.read({path: filePath});
  text({path: file.path, lines: file.lines.length, truncated: listing.truncated});
}
~~~

When path is omitted, the returned path is cwd. No new field or path behavior is introduced.
