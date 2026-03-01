---
id: 14
type: feature
status: closed
created: 2026-02-27T14:38:56.845Z
sources: [4, 5, 6]
---

# M1 Core Integration: Map into Read Tool + Prompt + Tests

The core deliverable — integrate read-map's generateMap() into the hashline read tool, update the prompt to document combined output, and prove it all works with unit and integration tests.

## Scope
- #004: ~15 lines in src/read.ts to call generateMap() + formatFileMapWithBudget() on truncation, plus mtime-keyed cache
- #005: Update prompts/read.md to describe hashline + map combined output format
- #006: Unit tests (hashline formatting, map conditions, cache hit/miss, failure fallback) + integration tests (small file, large file, targeted read, binary, edit-after-read) + fixtures

## Execution Order
1. #004 first (the integration)
2. #005 next (prompt update — trivial once #004 defines behavior)
3. #006 last (tests — needs working integration to test against)

## Key Constraints
- Map generation errors must be caught silently — read tool must NEVER fail because of map generation
- Maps only appended when: truncated AND no offset AND no limit
- Cache keyed by (absolutePath, mtimeMs)

## Depends On
Nothing — all source files are already in place from #001.

## Unlocks
- #007 (README/E2E — M1 capstone)
- #008/#009 (M2 symbol-addressable read)
