List one directory. Shows directories first with `/`, then files, sorted alphabetically; dotfiles are included.

> **Detailed reference document.** The provider-visible contract is [documented separately](../docs/tool-metadata.md) and consists of registered tool/parameter descriptions, snippets, and guidelines. This file is not loaded into `session.systemPrompt`. Changing this prompt body alone does not change provider-visible metadata.

## Parameters

- `path` — directory to list, default cwd.
- `limit` — max entries, default 500; must be positive.
- `glob` — optional entry-name filter such as `*.ts` or `.env*`; brackets and braces must be balanced.

## Usage

Output is one entry per line. Use `ls` to inspect a single directory, `find` for recursive discovery, and `read` for file contents. If output exceeds `limit` or 50 KB, it says so.
