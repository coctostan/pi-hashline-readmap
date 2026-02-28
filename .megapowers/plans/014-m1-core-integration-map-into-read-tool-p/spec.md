# Spec: Core Integration — Map into Read Tool

## Overview
Integrate the existing `src/readmap/` structural map library into `src/read.ts` so that truncated file reads automatically include a structural map. Wire all three tools (read, edit, grep) in `index.ts`. Update the read prompt. Add comprehensive tests.

---

## Acceptance Criteria

### AC-1: Map cache module (`src/map-cache.ts`)
- **AC-1.1**: Exports `getOrGenerateMap(absPath: string): Promise<FileMap | null>`
- **AC-1.2**: On first call for a file, calls `generateMap(absPath)` and caches the result keyed by `(absPath, mtimeMs)`
- **AC-1.3**: On subsequent call with same absPath and same mtime, returns cached `FileMap` without calling `generateMap` again
- **AC-1.4**: On subsequent call with same absPath but different mtime (file changed), invalidates cache entry and calls `generateMap` again
- **AC-1.5**: If `generateMap` throws, returns `null` (does not throw)
- **AC-1.6**: If `stat()` throws (file deleted between read and cache check), returns `null` (does not throw)
- **AC-1.7**: Exports `clearMapCache()` for testing purposes

### AC-2: Read tool map integration (`src/read.ts`)
- **AC-2.1**: When a file is truncated AND no `offset` param AND no `limit` param → the structural map is appended after the truncation message
- **AC-2.2**: When a file is truncated AND `offset` or `limit` is provided → NO map is appended
- **AC-2.3**: When a file is NOT truncated → NO map is appended
- **AC-2.4**: Map text is appended via `formatFileMapWithBudget(fileMap)` from `src/readmap/formatter.ts`
- **AC-2.5**: If `getOrGenerateMap()` returns `null`, the read result is unchanged (hashlines without map)
- **AC-2.6**: If any error occurs during map generation/formatting, the read result is unchanged (silent catch)
- **AC-2.7**: The read tool NEVER returns an error due to map generation — all map-related failures are silently swallowed

### AC-3: Extension wiring (`index.ts`)
- **AC-3.1**: `index.ts` default export is a function that receives `ExtensionAPI`
- **AC-3.2**: Calls `registerReadTool(pi)`, `registerEditTool(pi)`, `registerGrepTool(pi)` 
- **AC-3.3**: All three tools are registered when the extension loads

### AC-4: Read prompt update (`prompts/read.md`)
- **AC-4.1**: Documents that truncated files (>2000 lines / >50KB) include a structural map
- **AC-4.2**: Explains that the map shows symbols with line ranges for targeted reads
- **AC-4.3**: Mentions supported languages (17 language mappers)
- **AC-4.4**: Notes maps are cached by file modification time
- **AC-4.5**: Preserves existing documentation about `LINE:HASH|` anchors and image handling

### AC-5: Test fixtures (`tests/fixtures/`)
- **AC-5.1**: `small.ts` — TypeScript file ~50 lines with a class and functions
- **AC-5.2**: `large.ts` — TypeScript file >2000 lines with multiple classes, functions, interfaces
- **AC-5.3**: `small.py` — Python file ~30 lines with a class and function
- **AC-5.4**: `sample.bin` — Binary file (a few random bytes)
- **AC-5.5**: `plain.txt` — Plain text file with no code symbols (~20 lines)

### AC-6: Unit tests — map cache
- **AC-6.1**: First call generates and caches map (generateMap called once)
- **AC-6.2**: Second call with same mtime returns cached result (generateMap NOT called again)
- **AC-6.3**: Call after file modification (different mtime) regenerates map
- **AC-6.4**: generateMap failure returns null, no error thrown
- **AC-6.5**: clearMapCache() empties the cache

### AC-7: Unit tests — read integration logic
- **AC-7.1**: Truncated file without offset/limit → output contains map section
- **AC-7.2**: Truncated file with offset → output does NOT contain map section
- **AC-7.3**: Truncated file with limit → output does NOT contain map section
- **AC-7.4**: Non-truncated file → output does NOT contain map section
- **AC-7.5**: Map generation failure → output is valid hashlines without map (no error)

### AC-8: Integration tests — end to end
- **AC-8.1**: Small TypeScript file → hashlines only, no map overhead
- **AC-8.2**: Large TypeScript file → hashlines + structural map appended with recognizable symbols (class names, function names)
- **AC-8.3**: Small Python file → hashlines only (under threshold)
- **AC-8.4**: Targeted read with offset/limit on large file → hashlined slice, no map
- **AC-8.5**: Plain text file → hashlines, map has no/minimal symbols
- **AC-8.6**: Edit after read → hashline anchors from read output work correctly with edit tool's anchor resolution

### AC-9: Output format
- **AC-9.1**: Hashline format: `LINE:HASH|content` where LINE is 1-indexed line number and HASH is deterministic
- **AC-9.2**: Map section appears AFTER the truncation message (e.g., `[Output truncated: ...]`)
- **AC-9.3**: Map section is produced by `formatFileMapWithBudget()` and stays within 100KB budget (MAX_TRUNCATED_BYTES)

---

## Out of Scope
- Symbol-addressable read (`symbol` parameter) — that's M2
- AST-grep tool — that's M3
- Bash output compression — that's M4
- Cache eviction / LRU / size limits — YAGNI for now; in-memory cache with no cap is fine for a single session
- Persisted / on-disk cache
