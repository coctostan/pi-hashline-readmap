### Per-Task Assessment

### Task 1: Create symbol lookup module with exact single-match support — ❌ REVISE
- AC 7 and AC 9 are marked "implicit" but are not asserted in tests.
- Action: add explicit assertions for `findSymbol(map, "doesNotExist") -> { type: "not-found" }` and empty-symbol-map behavior in this task’s test file (can still be red-first because module does not exist before Step 3).

### Task 2: Add dot-notation nested symbol lookup — ❌ REVISE
- Step 3 only handles `nestedMatches.length === 1`; no ambiguity branch for multiple same-tier nested matches.
- This conflicts with AC 10’s same-tier ambiguity requirement.
- Action: add a failing test for nested ambiguity and implement `nestedMatches.length > 1 -> ambiguous`.

### Task 3: Add case-insensitive fallback tier — ❌ REVISE
- Step 3 handles only single case-insensitive match.
- If case-insensitive tier matches multiple symbols, logic falls through to partial tier, violating tier isolation/priority (AC 6) and same-tier ambiguity handling (AC 10).
- Action: add a failing test for multi-match case-insensitive query and implement `ci.length > 1 -> ambiguous`.

### Task 4: Add unique partial-substring match tier — ✅ PASS
No issues.

### Task 5: Return ambiguous for multi-match partial tier — ✅ PASS
No issues.

### Task 6: Return ambiguous for multi-match exact tier and preserve priority — ✅ PASS
No issues.

### Task 7: Return not-found for empty query — ✅ PASS
No issues.

### Task 8: Add `symbol` to read tool schema — ✅ PASS
No issues.

### Task 9: Reject `symbol + offset` combination — ✅ PASS
No issues.

### Task 10: Reject `symbol + limit` combination — ✅ PASS
No issues.

### Task 11: Read only the matched symbol's line range and validate hash anchors — ❌ REVISE
- Single test covers two distinct behaviors (range-selection + edit-anchor validity).
- Per review granularity rule (one behavior per test/task), this should be split.
- Action: keep range-selection in this task (AC 13/19), move anchor-validity (AC 20) to a dedicated task/test.

### Task 12: Add symbol header and verify no structural map on symbol reads — ❌ REVISE
- Single test asserts multiple behaviors (header formatting + no map + large-file scenario).
- Action: split into two tests/tasks or narrow this task to one behavior and move the other assertion.

### Task 13: Return disambiguation message for ambiguous symbol queries — ✅ PASS
No issues.

### Task 14: Add not-found warning and fall back to normal read — ✅ PASS
No issues.

### Task 15: Cap not-found warning symbol list at 20 names — ✅ PASS
No issues.

### Task 16: Add unmappable-file warning fallback using `.txt` fixture — ✅ PASS
No issues.

### Task 17: Document `symbol` parameter in prompt [no-test] — ✅ PASS
- Valid no-test justification (prompt/documentation change).
- Includes verification commands (`npm run typecheck`, `npm test`).

### Missing Coverage
- **AC 10 (same-tier ambiguity) is not fully covered**: exact and partial ambiguity are covered, but nested and case-insensitive ambiguity paths are not.
- No strict uncovered AC IDs in the matrix, but **AC 7 and AC 9 currently rely on implicit behavior without explicit tests**, which weakens acceptance confidence.

### Verdict
- **revise** — specific tasks need adjustment before implementation:
  1. Add explicit AC 7/9 tests (Task 1).
  2. Add nested ambiguity handling/tests (Task 2) and case-insensitive ambiguity handling/tests (Task 3) for AC 6/10 completeness.
  3. Split multi-behavior tasks/tests for Task 11 and Task 12 to satisfy granularity rules.

### Project Conventions Check
- `AGENTS.md` not present in repo.
- Conventions inferred from `package.json` and existing tests:
  - Language: TypeScript (ESM)
  - Test framework/runner: Vitest (`vitest run`, `npm test`)
  - Paths/extensions used in plan (`src/*.ts`, `tests/*.test.ts`, ESM `.js` imports from TS) are consistent with project patterns.
