Read text files with `LINE:HASH|content` anchors usable by `edit`. Default cap: {{DEFAULT_MAX_LINES}} lines or {{DEFAULT_MAX_BYTES}}. Images return attachments, not edit anchors.

> **Detailed reference document.** The provider-visible contract is [documented separately](../docs/tool-metadata.md) and consists of registered tool/parameter descriptions, snippets, and guidelines. This file is not loaded into `session.systemPrompt`. Changing this prompt body alone does not change provider-visible metadata.

## Parameters

- `offset` / `limit` — positive line numbers for targeted reads; `offset` is 1-indexed. `limit` may also cap a resolved `symbol`, but `offset` cannot combine with `symbol`.
- `charOffset` / `charLimit` — recover part of one long line. `charOffset` is a 0-based character offset into the displayed (escaped) line chosen by `offset`; `charLimit` is the window length (default 500, clamped to 10,000 with a `params-adjusted` notice; `charLimit` alone starts at 0). The window addresses exactly one line: `offset` is required, `limit` must be omitted or `1`, and it cannot combine with `symbol`, `bundle`, or `map` (`invalid-params-combo`). A `charOffset` at or past the end of the line fails with `char-offset-past-end`. The result is `LINE:HASH|<window>` where the anchor is the full line's anchor, followed by a notice with the span, the remaining characters, and the next `read({ path, offset, charOffset })` call.
- `map: true` — append a full-file structural map even for small files. May combine with `offset` / `limit`, `symbol`, and `bundle`.
- `symbol: "Name"` — read one symbol range by name, with hash anchors. Supports `ClassName.method`, Java package-relative names, and `Name@<line>` disambiguation. May combine with `limit`, `map: true`, and `bundle: "local"`; cannot combine with `offset`.
- `bundle: "local"` — with `symbol`, also include direct same-file local support when available. May combine with `limit` and `map: true`; cannot be used without `symbol`.
- `strictSymbol: true` — requires a non-empty `symbol`. Accepts the lookup's exact and normalized-exact tiers, including qualified, Java package-relative and `@line` selectors. It rejects missing, ambiguous, fuzzy and unmappable lookups rather than silently falling back.
- `errorMode: "value"` — opt into coded extension-owned failure values in codemode; host preparation/permission/abort failures may still reject. Default is `"throw"`.

Empty-string `symbol` / `offset` / `limit` values and numeric or base-10 string zero (`0` / `"0"`) `offset` / `limit` values are treated as omitted placeholders before the read mode is selected. Every omission is reported in a leading `[Read params adjusted: ...]` notice and structured `params-adjusted` warning. Meaningful conflicts still fail instead of guessing: a non-empty `symbol` cannot combine with a positive `offset`, and `bundle` still requires a surviving `symbol`.

When a full-file read is truncated, a structural map is appended automatically when available. Use that map's line ranges for follow-up `read({ offset, limit })`. Rust, C, C++, Java, and Swift maps use packaged `web-tree-sitter` WASM grammars (`.h` remains C++-backed); other common code/data formats use their dedicated mapper or may fall back to ctags/heuristics.

Very long single lines are truncated in the displayed output at 500 characters, the same threshold `grep` uses, with a `... [truncated, N chars total; read({offset:L, charOffset:K})]` marker showing the original length and how to fetch the remainder (`K` is the number of characters shown, 500 unless the cut would split a surrogate pair). Truncation is display-only: the `LINE:HASH` anchor is computed from the full line, so `edit` still operates on the complete content and the hash is unchanged. Use `charOffset` / `charLimit` to read the rest of a clipped line.

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

With `strictSymbol: true`, the failure codes are `symbol-not-found`, `symbol-ambiguous`, `symbol-fuzzy`, and `symbol-unmappable`. Fuzzy includes prefix, camelCase and substring matches. Omitted/blank symbol with strict mode is `invalid-params-combo`. When present, `error.details` contains the lookup result with tier/candidates. Without strict mode, the interactive behaviors above are unchanged.

Image successes expose script-forwardable `{ type: "image", data, mimeType, note, text }`; call `image(result)`. Omitted/missing attachments return `{ kind: "notice", text, warnings }`, not image bytes. Interactive ambiguity remains a successful choice response. See [structured output](../docs/structured-output.md#read-success-variants).

Hash anchors from symbol and bundled reads are valid for `edit`.

## Snapshot consistency

A symbol read selects its range from the same captured bytes used for its returned lines. Local support and an appended structural map use that snapshot too. A concurrent write may make the result older than the current file, but must not mix one revision's symbol ranges with another revision's lines. Re-read after a known file change before editing.

Read maps are bound to captured content. On a cache miss, mapping uses a private temporary copy with the original filename and extension so existing language mappers and fallbacks remain available. The temporary source is removed after mapping; returned paths and anchors refer to the requested file. Snapshot-map cache entries are separate from legacy path-map entries and contain structural metadata, not source buffers.

If a symbol read cannot acquire its snapshot map because temporary staging or mapping infrastructure fails, it returns the coded error `read-snapshot-unavailable`, without anchors or a successful-read baseline. Retry after checking temporary-storage availability. A normal unmappable source retains the existing ordinary fallback or strict `symbol-unmappable` behavior. An optional map on a non-symbol read may still be omitted on mapping failure.
