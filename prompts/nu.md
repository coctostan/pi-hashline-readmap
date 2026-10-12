Deprecated bundled Nushell tool, retained during deprecation. Prefer read/grep/ast_search for source inspection, find/ls for file discovery, codemode for structured composition, and bash for external CLIs.

> **Detailed reference document.** The provider-visible contract is [documented separately](../docs/tool-metadata.md) and consists of registered tool/parameter descriptions, snippets, and guidelines. This file is not loaded into `session.systemPrompt`. Changing this prompt body alone does not change provider-visible metadata.

See [Nu deprecation and migration](../docs/nu-deprecation.md) for the removal gate and retention options. The deprecation release does not disable nu or change execution results.

## Parameters

- `command` — Nushell script; may be multi-line.
- `timeout` — max seconds, default 30.

## Existing specialist use

For existing Nushell users, nu still supports structured inspection and data wrangling. These are retained specialist examples, not the preferred general repository-exploration path: `open package.json | get scripts`, `ls | where size > 10kb | first 5`, `open data.csv | group-by status`, `http get URL | get results`. Nu is not interchangeable with the bounded dedicated-tool migration examples.

Use bash for tests, builds, git, package managers, and project commands.

## Notes

Nushell syntax is not POSIX shell syntax. Quote strings in filters, use pipelines like `where`, `sort-by`, `first`, `length`, `math sum`, and `group-by`, and check plugins with `plugin list` when needed.

Output is stripped/truncated to 2000 lines or 50 KB. On failure, tool-added hints appear as `[nu-hint] ...` lines.
