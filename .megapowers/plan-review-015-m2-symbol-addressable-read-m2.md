# Plan Review — 015-m2-symbol-addressable-read-lookup-engine

Date: 2026-02-28

This review evaluates **“Plan: Symbol-Addressable Read (M2) — Revised v5”** against the provided **Spec / Acceptance Criteria (AC 1–21)** and the workflow review rubric.

## Project conventions check
- **Language/runtime:** TypeScript, ESM (`"type": "module"` in `package.json`).
- **Tests:** Vitest (`npm test` → `vitest run`).
- **Typecheck:** `npm run typecheck`.
- **Existing patterns:** Integration tests already exist in `tests/read-integration.test.ts` with helpers (`callReadTool`, `parseHashlineRows`, `clearMapCache`) and fixtures in `tests/fixtures/`.

Plan’s proposed commands and file locations are consistent with repo conventions.

---

## Per-Task Assessment

### Task 1: Create lookup module with explicit missing-symbol not-found — ❌ REVISE
- **TDD Step 2 (expected failure) is not specific enough.** It says “cannot resolve …” which is close, but it should include the actual Vitest/Vite error text you’ll see (e.g. “Failed to resolve import …”).
- **Step 3 implementation is intentionally fake (checks only first symbol).** This is acceptable as “minimal”, but it increases churn; consider starting with a small but correct implementation that scans `map.symbols` to reduce rework.

### Task 2: Guard empty symbol arrays — ✅ PASS
No issues.

### Task 3: Exact single-name match across all symbols — ✅ PASS
No issues.

### Task 4: Exact-tier ambiguity returns only exact-tier candidates — ✅ PASS
This test also helps cover AC6 tier priority (exact beats partial).

### Task 5: Dot-notation nested single match — ✅ PASS
No issues.

### Task 6: Dot-notation nested ambiguity — ✅ PASS
No issues.

### Task 7: Case-insensitive fallback single match — ✅ PASS
No issues.

### Task 8: Case-insensitive ambiguity — ✅ PASS
No issues.

### Task 9: Partial unique fallback — ✅ PASS
No issues.

### Task 10: Partial ambiguity — ✅ PASS
No issues.

### Task 11: Empty query guard with trim — ✅ PASS
No issues.

### Task 12: Add optional `symbol` to read tool schema — ❌ REVISE
- **Test file duplication:** The plan creates `tests/symbol-read-integration.test.ts` duplicating helpers already in `tests/read-integration.test.ts`. Not wrong, but it increases maintenance. Prefer extending the existing integration test file unless there’s a clear reason to split.
- **TDD Step 2 expected failure is a bit vague.** Suggest including the exact failing assertion outcome (e.g., “expected undefined to be 'string'”).

### Task 13: Reject `symbol + offset` — ✅ PASS
No issues.

### Task 14: Reject `symbol + limit` — ✅ PASS
No issues.

### Task 15: Symbol-found read returns only symbol body rows (small file) — ❌ REVISE
- **Step 3 implementation is not “full implementation code” per rubric.** It’s described as a set of edits/snippets. Provide the complete updated `execute` block section (at least the entire `startLine/endIdx/symbol` handling code) so a dev can apply it without inference.

### Task 16: Prepend symbol header on found reads — ❌ REVISE
- Same issue as Task 15: Step 3 is snippet-only and needs exact placement context.

### Task 17: Suppress structural map for found symbol reads — ✅ PASS
No issues.

### Task 18: Ambiguous symbol query returns disambiguation text only — ❌ REVISE
- **Return shape consistency:** The early return omits `isError`. Be explicit whether ambiguity is an error (recommended: **not** an error) and keep return shape consistent.
- **Step 3 is snippet-only.** Provide the full symbol-branch code (found/ambiguous/not-found/unmappable).

### Task 19: Not-found warning + fallback normal read — ❌ REVISE
- This is OK as an intermediate step, but Step 3 is snippet-only; include full code.
- Consider filtering empty symbol names defensively (optional).

### Task 20: Cap not-found symbol list at 20 — ✅ PASS
No issues.

### Task 21: Unmappable-file warning fallback — ❌ REVISE
- **Step 3 is snippet-only.** Include full code.
- Minor: extension labeling should match AC18 wording exactly for common cases.

### Task 22: Symbol-read anchors are valid for edit tool — ❌ REVISE
- This is described as a “failing test” task but is expected to PASS immediately. Reframe as **verification-only**, or move it to a final verification section/phase.

### Task 23: Symbol read on large file returns targeted content — ❌ REVISE
- Same as Task 22: verification-only test expected to pass. Reframe/move.

### Task 24: Document symbol parameter in read prompt `[no-test]` — ✅ PASS
Justification is valid; includes verification commands.

---

## Missing Coverage
No AC is completely uncovered.

Recommendation: add one explicit unit test for **AC6 tier dominance** beyond Task 4 (e.g., “case-insensitive match exists, partial also matches → return case-insensitive only”).

---


### Summary of required plan fixes (verdict: revise)

1. Replace snippet-only implementation steps with complete code blocks (so tasks are self-contained) for Tasks 15, 16, 18, 19, 21 (and any other “insert this snippet” style steps).
2. Reframe Tasks 22–23 as verification-only (or move them to the verify phase). Right now they’re written as “write failing test” tasks but are expected to pass immediately.
3. Resolve spec vs. source-issue mismatch: Source Issue #008 mentions “prefer largest span” for ambiguity resolution, but the AC requires returning ambiguous when multiple matches exist at a tier. Confirm which behavior is desired and update plan/tests accordingly.
4. Optional but recommended: add one explicit unit test for AC6 tier dominance beyond Task 4 (e.g., “case-insensitive match exists and partial also matches → return case-insensitive only”).

I moved the workflow back to the plan phase for rework.
