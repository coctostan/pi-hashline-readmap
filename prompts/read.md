Read a file. Each line is prefixed `LINE:HASH|content` — use these anchors for `edit`. Images (jpg/png/gif/webp) are returned as attachments. Default cap: {{DEFAULT_MAX_LINES}} lines or {{DEFAULT_MAX_BYTES}}.

## Parameters
- `offset` / `limit` — positive integers for paging. When truncated, a structural map is appended showing symbols (classes, functions, interfaces, etc.) with line ranges.
- `map: true` — request structural map even for small files. Cannot combine with `symbol`.
- `symbol: "name"` — read a specific symbol by name. Returns only that symbol's range with hash anchors. Supports `ClassName.method` dot notation and `@<line>` disambiguation (e.g. `Foo.bar@42`). Cannot combine with `offset`/`limit`.

| Type | Example | What it reads |
|---|---|---|
| Function | `{symbol:"processEvent"}` | Full function body |
| Class | `{symbol:"EventEmitter"}` | Entire class declaration |
| Method | `{symbol:"EventEmitter.emit"}` | Single method |
| Interface | `{symbol:"RequestOptions"}` | Full interface |
| Type alias | `{symbol:"EventHandler"}` | Type alias definition |
| Const/Variable | `{symbol:"DEFAULT_TIMEOUT"}` | Declaration |
| Enum | `{symbol:"LogLevel"}` | Full enum |
| Struct (Rust) | `{symbol:"Config"}` | Full struct |

## Symbol result behavior
- **Found**: returns hashlined content for the symbol's range with `[Symbol: name (kind), lines X-Y of Z]` header.
- **Ambiguous**: returns disambiguation list with name, kind, and line range. Use dot notation or `@<line>` to narrow.
- **Fuzzy**: returns best match with `[Symbol '<query>' not exact-matched ...]` banner naming the match tier and up to 4 other candidates. Verify before editing.
- **Not found**: falls back to normal read with a warning listing available symbol names.
- **Unmappable file**: falls back to normal read with a warning.

## `@<line>` disambiguation
Append `@<digits>` to pick a specific overload by line number (e.g. `Foo.bar@42`). Resolution order: containing range → nearest at-or-below → nearest above. If unresolved, response lists candidate `name@<startLine>` references for retry.

## Structural maps
18 mapped languages (TS, JS, Python, Rust, Go, Java, C, C++, Swift, Shell, Clojure, SQL, JSON, Markdown, YAML, TOML, CSV/TSV, and more). In-memory caching with optional persistent cache across sessions.
