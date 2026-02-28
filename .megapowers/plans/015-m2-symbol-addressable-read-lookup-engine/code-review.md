## Files Reviewed
- `src/readmap/symbol-lookup.ts` — symbol lookup tiering logic (exact, dot-notation, case-insensitive, partial) and ambiguity handling.
- `src/read.ts` — read tool schema + symbol integration path, warnings/fallback behavior, truncation/map behavior.
- `prompts/read.md` — user-facing documentation for `symbol` usage.
- `tests/symbol-lookup.test.ts` — unit coverage for lookup tiers/edge cases.
- `tests/symbol-read-integration.test.ts` — integration behavior for schema, ambiguity, fallback, truncation, and anchor compatibility.

## Strengths
- `findSymbol` is cleanly tiered and short-circuits by priority (`src/readmap/symbol-lookup.ts:30-58`), preventing lower-priority matches from leaking into results.
- Dot-notation lookup is constrained to parent/child symbol relationships, with explicit ambiguity returns (`src/readmap/symbol-lookup.ts:34-47`).
- Parameter-mode conflict is correctly guarded early with a clear error (`src/read.ts:44-50`).
- Symbol integration handles all major outcomes with explicit messaging (ambiguous/not-found/unmappable) (`src/read.ts:100-126`).
- Symbol-targeted reads correctly suppress structural map appendix while preserving truncation metadata (`src/read.ts:153-167`).
- Prompt docs are clear and aligned with runtime behavior, including dot-notation examples and offset/limit exclusivity (`prompts/read.md:12-25`).
- Test suite is meaningful and behavior-focused; integration tests verify anchor compatibility with edit semantics, not just text snapshots (`tests/symbol-read-integration.test.ts:108-133`).

## Findings

### Critical
None.

### Important
None outstanding.

(Resolved during this review)
- `src/readmap/symbol-lookup.ts:35` previously used `split(".", 2)`, which could misresolve `Class.method.extra` as `Class.method` by dropping trailing segments. Fixed by requiring exactly two dot segments before nested matching (`src/readmap/symbol-lookup.ts:35-37`), with regression test added (`tests/symbol-lookup.test.ts:100-112`).

### Minor
None.

## Recommendations
- Consider a small integration test for `symbol: ""` (empty string) behavior in `read` to lock expected UX (either explicit validation error or intentional fallback).

## Assessment
ready

Code quality is solid and aligned with the spec. The one correctness edge case found in review (multi-dot truncation in nested lookup parsing) has been fixed and covered by a new unit test. Post-fix validation is green:
- `npm test` → 17 files, 100 tests passed
- `npm run typecheck` → pass