---
id: 15
type: feature
status: closed
created: 2026-02-27T14:38:56.846Z
sources: [8, 9]
---

# M2 Symbol-Addressable Read: Lookup Engine + Read Tool Param

Add symbol-based file reading — read("file.ts", { symbol: "myFunction" }) returns just that symbol's lines, hashlined and editable.

## Scope
- #008: New src/readmap/symbol-lookup.ts — search FileMap by name with priority: exact > nested (Cls.method) > case-insensitive > partial (if unambiguous). Returns line range or null + candidates list.
- #009: Add symbol?: string param to read tool schema. When provided: generate/cache FileMap → findSymbol() → re-read with offset/limit for that range → header "[Symbol: name, lines X-Y of total]". No map appended (already targeted). symbol + offset = error. Update prompts/read.md.

## Execution Order
1. #008 first (pure function, independently testable)
2. #009 next (wires lookup into read tool + prompt update)

## Key Constraints
- Works on all file sizes (no truncation threshold)
- symbol + offset is an error (mutually exclusive)
- Unmappable files → graceful fallback to normal read + warning

## Depends On
Batch A (M1 Core Integration) — needs working map generation and cache.
