Read text files with `LINE:HASH|content` anchors usable by `edit`. Default cap: {{DEFAULT_MAX_LINES}} lines or {{DEFAULT_MAX_BYTES}}. Images return attachments, not edit anchors.

## Parameters

- `offset` / `limit` — positive line numbers for targeted reads; `offset` is 1-indexed.
- `map: true` — append a full-file structural map even for small files. May combine with `offset` / `limit`; cannot combine with `symbol` or `bundle`.
- `symbol: "Name"` — read one symbol range by name, with hash anchors. Supports `ClassName.method`, Java package-relative names, and `Name@<line>` disambiguation. Cannot combine with `offset` / `limit`.
- `bundle: "local"` — with `symbol`, also include direct same-file local support when available. Cannot combine with `map`.

When a full-file read is truncated, a structural map is appended automatically when available. Use that map's line ranges for follow-up `read({ offset, limit })`. Structural maps support many common code/data formats and may fall back to ctags/heuristics.

Very long single lines are truncated in the displayed output at 500 characters, the same threshold `grep` uses, with a `... [truncated, N chars total]` marker showing the original length. Truncation is display-only: the `LINE:HASH` anchor is computed from the full line, so `edit` still operates on the complete content and the hash is unchanged.

## Symbol examples

| Query | Reads |
|---|---|
| `{ "symbol": "processEvent" }` | function or top-level symbol |
| `{ "symbol": "EventEmitter" }` | class/interface/type/enum/etc. |
| `{ "symbol": "EventEmitter.emit" }` | child method/member |
| `{ "symbol": "Foo.bar@42" }` | specific overload/definition near line 42 |
| `{ "symbol": "handleRequest", "bundle": "local" }` | symbol plus direct local support |

## Symbol resolution

`@<line>` only applies as a trailing suffix like `Foo.bar@42`; names such as `foo@bar` are ordinary queries. Resolution order: containing range → nearest symbol starting at/after the requested line → nearest symbol above it. If unresolved but same-name candidates exist, the response lists retry hints like `name@<startLine>`.

Result behavior:
- **Found**: returns only the symbol range with `[Symbol: name (kind), lines X-Y of Z]`.
- **Ambiguous**: returns candidate names/kinds/ranges; retry with dot notation or `@<line>`.
- **Fuzzy**: returns the best camelCase/substring match with a warning banner and confirmation hint. Verify before editing from fuzzy-match anchors.
- **Not found**: falls back to normal read with a warning listing available symbols.
- **Unmappable**: falls back to normal read with a warning.

Hash anchors from symbol and bundled reads are valid for `edit`.
