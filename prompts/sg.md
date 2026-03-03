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
- `class $NAME { $$$BODY }` — class declarations
- `if ($COND) { $$$BODY }` — if statements (no else)
- `try { $$$BODY } catch ($ERR) { $$$HANDLER }` — try-catch blocks
- `const $NAME = ($$$PARAMS) => $BODY` — arrow function assignments
- `const $NAME = ($$$PARAMS) => { $$$BODY }` — arrow functions with block body
- `<$TAG $$$ATTRS>$$$CHILDREN</$TAG>` — JSX elements (React/TSX)
- `async function $NAME($$$PARAMS) { $$$BODY }` — async function declarations

## Workflow: search → edit

1. Run `sg({ pattern: "console.log($$$ARGS)" })`
2. Review output grouped by file (`--- path ---`) with anchors (`>>LINE:HASH|...`)
3. Use anchors directly with `edit({ path: "file.ts", edits: [{ set_line: { anchor: "42:ab", new_text: "..." } }] })`

## Tips & Common Pitfalls

1. **Whitespace is mostly ignored** — `function $NAME ($$$P)` and `function $NAME($$$P)` match the same AST nodes. Don't try to match exact formatting.
2. **Semicolons matter for statements** — In languages that use semicolons (TypeScript, JavaScript, Java, C), patterns like `const x = 1` won't match `const x = 1;`. Include the semicolon: `const $NAME = $VALUE;`.
3. **Use `$$$` for optional/variable-length parts** — `$$$ARGS` matches zero or more arguments. Use it when you don't know how many children a node has (function args, array elements, object properties).
4. **Language-specific syntax** — Patterns are parsed as the target language's AST. A TypeScript pattern with type annotations (e.g., `function $NAME($P: $T)`) won't match JavaScript files. Use the `lang` parameter to be explicit.
5. **Blocks vs expressions** — `($$$PARAMS) => $BODY` matches single-expression arrow functions, while `($$$PARAMS) => { $$$BODY }` matches block-body arrows. They're different AST node types.
6. **Decorators and attributes** — Decorators (`@decorator`) are separate AST nodes. To match a decorated class, use `@$DEC class $NAME { $$$BODY }`. Without it, plain `class $NAME { $$$BODY }` still matches decorated classes in some parsers.
7. **JSX requires TSX/JSX language** — When searching for JSX patterns like `<Component $$$PROPS />`, use `lang: "tsx"` or `lang: "jsx"`. Plain `typescript` or `javascript` parsers won't recognize JSX syntax.
