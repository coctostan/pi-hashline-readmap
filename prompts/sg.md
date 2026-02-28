Structural code search using **ast-grep** (`sg`). This tool finds code by **AST structure** (not raw text) and returns **hashline-anchored** results ready for the `edit` tool.

## Pattern Syntax (metavariables)

- `$NAME` — matches a single AST node
- `$$$ARGS` — matches zero or more nodes (variadic)
- `$_` — wildcard (matches any single node)

## Common Patterns

- `console.log($$$ARGS)` — all console.log calls
- `export function $NAME($$$PARAMS) { $$$BODY }` — exported function declarations
- `$OBJ.$METHOD($$$ARGS)` — method calls
- `import $NAME from '$SOURCE'` — default imports

## Workflow: search → edit

1. Run `sg({ pattern: "console.log($$$ARGS)" })`
2. Review output grouped by file (`--- path ---`) with anchors (`>>LINE:HASH|...`)
3. Use anchors directly with `edit({ path: "file.ts", edits: [{ set_line: { anchor: "42:ab", new_text: "..." } }] })`
