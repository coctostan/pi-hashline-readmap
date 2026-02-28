# Spec: Symbol-Addressable Read (M2)

## Goal

Add a `symbol` parameter to the hashline read tool so that `read("file.ts", { symbol: "functionName" })` generates a structural file map, looks up the named symbol, and returns only that symbol's hashlined source code — enabling targeted, token-efficient reads without requiring the user to know line numbers.

## Acceptance Criteria

### Symbol Lookup Engine (`src/readmap/symbol-lookup.ts`)

1. `findSymbol(map, "exactName")` returns a single match with correct `name`, `kind`, `startLine`, and `endLine` when exactly one symbol has that name.

2. `findSymbol(map, "ClassName.methodName")` matches a child symbol named `methodName` inside a parent symbol named `ClassName`.

3. `findSymbol(map, "EXACTNAME")` falls back to case-insensitive matching when no exact match exists, returning the symbol whose name matches case-insensitively.

4. `findSymbol(map, "partial")` returns a single match when exactly one symbol name contains the substring — and only when no exact or case-insensitive match exists.

5. `findSymbol(map, "partial")` returns an ambiguous result with a list of all matching candidates when multiple symbol names contain the substring.

6. When the same query matches at multiple priority tiers (e.g., exact match exists), only the highest-priority tier's results are returned.

7. `findSymbol(map, "doesNotExist")` returns a not-found result.

8. `findSymbol(map, "")` returns a not-found result (empty query guard).

9. `findSymbol()` on a FileMap with an empty `symbols` array returns a not-found result.

10. When multiple symbols match at the same priority tier (e.g., two exact matches), the result is ambiguous — returns all candidates with their `name`, `kind`, `startLine`, and `endLine`.

### Read Tool Integration (`src/read.ts`)

11. The read tool schema accepts an optional `symbol` string parameter.

12. When `symbol` is provided alongside `offset` or `limit`, the tool returns an error: `"Cannot combine symbol with offset/limit. Use one or the other."` with no file content.

13. When `symbol` resolves to a single match, the tool returns hashlined content for only that symbol's line range (using offset/limit internally).

14. Symbol read output is prepended with a header: `[Symbol: name (kind), lines X-Y of Z]` where Z is total file line count.

15. Symbol read output does NOT include a structural map appendix.

16. When the symbol query is ambiguous (multiple matches), the tool returns a disambiguation message listing each candidate's name, kind, and line range — with no file content.

17. When the symbol is not found, the tool falls back to a normal read with a warning prepended: `[Warning: symbol 'X' not found. Available symbols: ...]` listing up to 20 top-level symbol names.

18. When the file cannot be mapped (unsupported language or mapper failure), the tool falls back to a normal read with a warning: `[Warning: symbol lookup not available for .ext files — showing full file]`.

19. Symbol reads work on both small files (under truncation threshold) and large files (over truncation threshold).

20. Hash anchors returned from a symbol read are valid for use with the edit tool.

### Prompt Documentation (`prompts/read.md`)

21. `prompts/read.md` documents the `symbol` parameter with usage examples, dot-notation syntax for nested symbols, and its mutual exclusivity with `offset`/`limit`.

## Out of Scope

- Regex or glob-based symbol matching
- Multi-symbol reads (returning multiple symbols in one call)
- Symbol-based grep/search across multiple files
- Renaming or refactoring via symbol references
- Cache eviction or size limits for the map cache

## Open Questions

None.
