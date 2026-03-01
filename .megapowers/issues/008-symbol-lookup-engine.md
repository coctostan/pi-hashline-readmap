---
id: 8
type: feature
status: closed
created: 2026-02-26T21:07:00Z
milestone: M2
priority: 6
---

# Symbol lookup engine: search FileMap symbols by name

Build a function to search a FileMap by symbol name and return the matching line range.

**Location**: `src/readmap/symbol-lookup.ts`

**Matching strategy (priority order):**
1. Exact match — symbol.name === symbolName
2. Nested match — "ClassName.methodName" dot notation
3. Case-insensitive match
4. Partial match (only if exactly one result)

**Ambiguity:** prefer largest span. If still ambiguous, return null + list of matches.

**Edge cases:** symbol not found → null, empty name → null, no symbols → null

**Tests:** unit tests for each strategy and edge case.
