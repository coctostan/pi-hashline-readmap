AST-aware structural code search. Use when text search is too broad or brittle and you need code shape, such as calls, imports, declarations, or JSX. Returns matches grouped by file with edit-ready hashline anchors.

> **Detailed reference document.** The provider-visible contract is [documented separately](../docs/tool-metadata.md) and consists of registered tool/parameter descriptions, snippets, and guidelines. This file is not loaded into `session.systemPrompt`. Changing this prompt body alone does not change provider-visible metadata.

## Parameters

- `pattern` — ast-grep pattern to match.
- `lang` — language hint such as `typescript`, `tsx`, `javascript`, `jsx`, `rust`, or `python`; set it when syntax is ambiguous.
- `path` — file or directory, default cwd.
- `limit` — positive integer maximum number of raw ast-grep match records, default 100. Obvious base-10 numeric strings are accepted; zero, negatives, fractions, and malformed strings are errors.

## Pattern syntax

- `$NAME` matches one AST node.
- `$_` matches any one node.
- `$$$ARGS` matches zero or more nodes; use `$$$` for variable-length args, body statements, object fields, JSX children, etc.

## Examples

- `console.log($$$ARGS)` — calls.
- `import $NAME from '$SOURCE'` — default imports.
- `export function $NAME($$$PARAMS) { $$$BODY }` — exported functions.
- `$OBJ.$METHOD($$$ARGS)` — method calls.
- `<$TAG $$$ATTRS>$$$CHILDREN</$TAG>` — JSX/TSX elements.

## Limits and truncation

`ast_search` applies the result limit to raw ast-grep match records before merging overlapping or adjacent source ranges. It then applies deterministic line and UTF-8 byte ceilings to the complete returned visible text, including separators and truncation guidance. Blocks are admitted whole: an oversized merged block or long anchored source record is omitted rather than cut in the middle.

When a limit is hit, guidance reports raw matches returned and omitted and says `Narrow path/pattern or increase limit.` When a visible budget is hit, guidance reports complete merged blocks, lines, and bytes shown and suggests narrowing `path`/`pattern` or lowering `limit`.

Visible text contains only admitted complete merged blocks. Structured `ptcValue.files` retains every range and line admitted by the result limit; `ptcValue.truncation` records result-limit and visible-budget metadata. Context-hygiene resources and file-anchoring callbacks follow the same retained structured set. TUI summaries call structured rows anchored lines and report raw-match/block omissions separately.

## Tips

Patterns are parsed as code, not text: formatting is mostly ignored, but syntax must be valid for `lang`. Include semicolons in languages that require them. Use `grep` for plain text and `ast_search` for structure. Narrow `path` or make `pattern` more specific before raising `limit` for broad searches. Anchors in visible blocks can be passed directly to `edit`.
