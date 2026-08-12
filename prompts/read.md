Read text files with `LINE:HASH|content` anchors usable by `edit`. Default cap: {{DEFAULT_MAX_LINES}} lines or {{DEFAULT_MAX_BYTES}}. Images return attachments, not edit anchors.

## Parameters

- `offset` / `limit` — positive line numbers for targeted reads; `offset` is 1-indexed. `limit` may also cap a resolved `symbol`, but `offset` cannot combine with `symbol`.
- `map: true` — append a full-file structural map even for small files. May combine with `offset` / `limit`, `symbol`, and `bundle`.
- `symbol: "Name"` — read one symbol range by name, with hash anchors. Supports `ClassName.method`, Java package-relative names, and `Name@<line>` disambiguation. May combine with `limit`, `map: true`, and `bundle: "local"`; cannot combine with `offset`.
- `bundle: "local"` — with `symbol`, also include direct same-file local support when available. May combine with `limit` and `map: true`; cannot be used without `symbol`.

When a full-file read is truncated, a structural map is appended automatically when available. Use that map's line ranges for follow-up `read({ offset, limit })`. Rust, C, C++, Java, and Swift maps use packaged `web-tree-sitter` WASM grammars (`.h` remains C++-backed); other common code/data formats use their dedicated mapper or may fall back to ctags/heuristics.

Very long single lines are truncated in the displayed output at 500 characters, the same threshold `grep` uses, with a `... [truncated, N chars total]` marker showing the original length. Truncation is display-only: the `LINE:HASH` anchor is computed from the full line, so `edit` still operates on the complete content and the hash is unchanged.

## Symbol examples

| Query | Reads |
|---|---|
| `{ "symbol": "processEvent" }` | function or top-level symbol |
| `{ "symbol": "EventEmitter" }` | class/interface/type/enum/etc. |
| `{ "symbol": "EventEmitter.emit" }` | child method/member |
| `{ "symbol": "Foo.bar@42" }` | specific overload/definition near line 42 |
| `{ "symbol": "handleRequest", "bundle": "local" }` | symbol plus direct local support |
| `{ "symbol": "registerReadTool", "limit": 80 }` | first 80 lines of the symbol, with continuation guidance when more remain |
| `{ "symbol": "registerReadTool", "map": true }` | symbol plus the full-file structural map |
| `{ "symbol": "handleRequest", "limit": 80, "bundle": "local", "map": true }` | capped symbol, direct local support, then full-file map |

## Symbol resolution

`@<line>` only applies as a trailing suffix like `Foo.bar@42`; names such as `foo@bar` are ordinary queries. Resolution order: containing range → nearest symbol starting at/after the requested line → nearest symbol above it. If unresolved but same-name candidates exist, the response lists retry hints like `name@<startLine>`.

Result behavior:
- **Exact**: an exact name, dotted path, or `@<line>` selector returns the symbol range with tier `exact` and no confirmation warning.
- **Normalized exact**: a case-insensitive exact or supported Java package-relative selector returns the symbol range with tier `normalized-exact` and no confirmation warning.
- **Prefix / camelCase / substring**: a unique approximate match emits `fuzzy-symbol-match` with the concrete tier, selected symbol, alternatives, and exact-name / `@line` confirmation guidance. Confirm before editing.
- **Ambiguous**: displays at most five parent-qualified candidate rows and states the exact omitted count. Accurate dotted / `name@line` selectors are provided for shown and every omitted candidate. Structured metadata contains `tier`, `totalCandidates`, `displayedCandidates`, `omittedCandidates`, `omittedSelectors`, and `omittedCount`.
- **Not found**: falls back to normal read with a warning listing available symbols.
- **Unmappable**: falls back to normal read with a warning.

Hash anchors from symbol and bundled reads are valid for `edit`.
