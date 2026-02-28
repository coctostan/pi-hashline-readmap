# Brainstorm: Symbol-Addressable Read (M2)

## Approach

Add symbol-addressable reading to the existing hashline read tool. When a user passes `symbol: "functionName"`, the tool generates (or retrieves from cache) a FileMap, looks up the symbol by name, and re-reads just that symbol's line range with hashline formatting. This gives targeted, token-efficient reads without requiring the user to know line numbers.

The design splits into two clean components: a pure lookup engine (`src/readmap/symbol-lookup.ts`) that takes a FileMap + query string and returns match results, and modifications to `src/read.ts` that wire the lookup into the existing read pipeline. The lookup engine has zero I/O dependencies — it's a pure function over in-memory data structures. The read tool orchestrates: validate params → get/generate map → lookup → re-read with offset/limit → format output.

Everything reuses existing infrastructure. Map generation and caching come from M1's `getOrGenerateMap()`. Hashline formatting comes from the existing read path. The only new code is the symbol matching logic and the read tool's symbol branch.

## Key Decisions

- **Ambiguity handling: return all matches with disambiguation message** — no silent auto-resolution. When multiple symbols match at the same priority tier, return the candidate list and let the user pick (e.g., with dot notation).
- **Matching priority cascade: exact → dot-notation nested → case-insensitive → partial (unique only)** — higher-priority matches shadow lower ones. If exact match finds results, skip the rest.
- **`symbol` + `offset`/`limit` = error** — mutually exclusive params. Clean separation of addressing modes.
- **Unmappable files: graceful fallback with warning** — `"Symbol lookup not available for .xyz files — showing full file"` + normal read. No blocked workflows.
- **Symbol not found: normal read + warning listing available symbols (capped at 20)** — gives the user actionable info to retry with the right name.
- **No structural map appended on symbol reads** — the read is already targeted, appending a map would be redundant noise.
- **Header format: `[Symbol: name (kind), lines X-Y of Z]`** — tells the user exactly what they're looking at and where it sits in the file.

## Components

1. **`src/readmap/symbol-lookup.ts`** — Pure function `findSymbol(map: FileMap, query: string)`. Returns a `SymbolLookupResult`: either a single `SymbolMatch` (name, kind, startLine, endLine) or an ambiguous result with candidate list. Walks the symbol tree recursively to handle nested symbols (children arrays). No I/O, no side effects.

2. **`src/read.ts` modifications** — Add `symbol?: string` to tool schema. New branch early in the read handler: validate no conflict with offset/limit → call `getOrGenerateMap()` → call `findSymbol()` → fork on result (single match → targeted read, ambiguous → disambiguation message, not found → fallback with warning, no map → fallback with warning).

3. **`prompts/read.md` update** — Document the `symbol` parameter, usage examples, dot notation for nested symbols, and interaction with other params.

## Testing Strategy

**`tests/symbol-lookup.test.ts`** — Pure unit tests, no file I/O:
- Exact match returns correct line range
- Dot-notation nested match (`Class.method`)
- Case-insensitive fallback
- Partial match (unique hit)
- Partial match ambiguous → candidate list
- Not found → null
- Empty/null query → null
- Empty map (no symbols) → null
- Priority cascade: exact shadows case-insensitive

**`tests/symbol-read-integration.test.ts`** — Integration tests using existing `large.ts` fixture:
- Symbol read returns hashlined content for symbol's range only
- Header format `[Symbol: name (kind), lines X-Y of Z]`
- No structural map appended
- `symbol + offset` → error message
- Symbol not found → normal read + warning with available symbols (capped at 20)
- Unmappable file → warning + normal read
- Hash anchors from symbol read work with edit tool

## Error Handling Summary

| Failure | Response | Stops read? |
|---------|----------|-------------|
| `symbol` + `offset`/`limit` | Error: use one or the other | Yes |
| Map generation fails | Warning + normal read | No |
| Map has zero symbols | Warning + normal read | No |
| Symbol not found | Warning + available symbols list + normal read | No |
| Ambiguous match | Disambiguation message with candidates | Yes — no content, just list |
| File not readable | Existing read error handling | Yes |
