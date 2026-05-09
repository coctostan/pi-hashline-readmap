Surgically edit files with hash-verified `LINE:HASH` anchors from `read`, `grep`, `ast_search`, or `write`. Anchored operations verify the file still matches before writing. The target file must have been anchored earlier in the session — call `read`, `grep`, `ast_search`, or `write` first if `edit` says the file was not read.

## Variants

| Variant | Use | Anchors |
|---|---|---|
| `set_line` | Replace or delete exactly one line | 1 |
| `replace_lines` | Replace or delete a contiguous range | 2 |
| `insert_after` | Insert new lines after an existing line | 1 |
| `replace_symbol` | Replace a symbol declaration by name | 0 |
| `replace` | Global string replacement (escape hatch) | 0 |

```json
{"path":"src/foo.ts","edits":[
  {"set_line":{"anchor":"42:ab1","new_text":"const x = 2;"}},
  {"replace_lines":{"start_anchor":"50:c3d","end_anchor":"55:e4f","new_text":"const y = 3;\nreturn y;"}},
  {"insert_after":{"anchor":"60:f5a","new_text":"// TODO\n"}},
  {"replace_symbol":{"symbol":"add","new_body":"export function add(a,b){return a+b;}"}},
  {"replace":{"old_text":"value","new_text":"result","all":true}}
]}
```

Each edit entry must contain exactly one variant key. `new_text` / `new_body` is plain content — no `LINE:HASH` prefixes or diff markers.

## `replace_symbol` rules
- Uses the same symbol-query syntax as `read symbol:` (`Foo.bar`, `Foo.bar@<line>`). Only TS/JS/Rust/Java currently.
- `new_body` is dedented and re-indented to match the original symbol's indentation. Pass flush-left body.
- Empty `new_body` is rejected. Name mismatch emits a warning (edit still applies).
- Anchored edits (`set_line`/`replace_lines`/`insert_after`) may not target lines inside a `replace_symbol` range in the same call.
- `replace_symbol` also honors the read-gate.
- For languages without a mapper (Python/Go/Swift), use anchored edits.

## Hash mismatch recovery
If the file changed after you captured anchors, `edit` reports a mismatch and shows current lines with `>>>` markers. Auto-relocation checks within ±20 lines.

```
>>> 41:b34|  const renamed = 3;
```

Copy the updated `LINE:HASH` from the `>>>` line and retry. If content moved farther, run `read` again.

## Syntax-regression validation
After every write, tree-sitter compares ERROR/MISSING node counts pre/post edit. Languages: Rust, C, C++, C headers, Java, Clojure. Others are skipped.
- `warn` (default): net-new errors append `syntax-regression: lines X-Y` to response warnings. Edit still applies.
- `block`: edit is aborted. File on disk unchanged.
- `off`: skipped entirely.
Mode resolution: explicit `syntaxValidate` option > `PI_HASHLINE_SYNTAX_VALIDATE` env var > `warn`.

## Notes
- Always copy anchors exactly as shown from the most recent read.
- Prefer anchored variants over `replace`.
- Edits within one call are validated and applied atomically bottom-to-top.
- After a `replace`-only batch, the tool nudges you back toward anchored variants.
- Whitespace-only classification warnings mean verify intent before assuming the edit changed behavior.
