Explore files, structured data, and system state with Nushell pipelines. Use `nu` for inspection and data wrangling; use `bash` for tests, builds, git, package managers, and project commands.

> **Detailed reference document.** The provider-visible contract is [documented separately](../docs/tool-metadata.md) and consists of registered tool/parameter descriptions, snippets, and guidelines. This file is not loaded into `session.systemPrompt`. Changing this prompt body alone does not change provider-visible metadata.

## Parameters

- `command` — Nushell script; may be multi-line.
- `timeout` — max seconds, default 30.

## Good uses

Use `nu` when structured output helps: JSON/CSV/TOML/YAML inspection, filesystem summaries, filtering/sorting/grouping, API response exploration, or system checks.

Examples: `open package.json | get scripts`, `ls | where size > 10kb | first 5`, `open data.csv | group-by status`, `http get URL | get results`.

## Notes

Nushell syntax is not POSIX shell syntax. Quote strings in filters, use pipelines like `where`, `sort-by`, `first`, `length`, `math sum`, and `group-by`, and check plugins with `plugin list` when needed.

Output is stripped/truncated to 2000 lines or 50 KB. On failure, tool-added hints appear as `[nu-hint] ...` lines.
