---
id: 6
type: feature
status: done
created: 2026-02-26T21:05:00Z
milestone: M1
priority: 4
---

# Unit and integration tests for combined read tool

**Unit Tests:**
- Hashline formatting: LINE:HASH|content, deterministic hashing
- Map integration conditions: truncated + no offset/limit → map; otherwise no map
- Map cache: same file + same mtime → hit; different mtime → miss
- Map failure → hashlines returned, no error

**Integration Tests:**
- Small file read → hashlines only, no map
- Large file read → hashlines + structural map appended
- Targeted read (offset/limit) → hashlined slice, no map
- Binary/image → delegates to built-in
- Edit after read → anchors work correctly
- At least TypeScript, Python, and one regex mapper produce valid maps

**Fixtures needed:**
- Small TypeScript file (~50 lines)
- Large TypeScript file (>2000 lines with classes/functions)
- Small Python file
- Binary file (.bin)
- Plain .txt with no symbols

**Framework**: vitest
