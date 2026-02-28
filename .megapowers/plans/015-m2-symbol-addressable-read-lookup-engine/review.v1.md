# Plan Review Findings — 015-m2-symbol-addressable-read-lookup-engine

## Summary Verdict: **revise**

The plan is strong and mostly meets the megapowers protocol (explicit AC coverage, good dependency ordering, and TDD 5-step structure per task). The remaining issues are primarily **granularity**: a couple tasks bundle multiple distinct behaviors into a single `it(...)`, which conflicts with the review rubric’s “one behavior per test/task” intent.

A secondary (optional) improvement: consider handling **nested dot-notation ambiguity** (same `Parent.child` found multiple times) and/or clarifying how ambiguity from Issue #008 (“prefer largest span”) relates to this spec (which requires returning all candidates).

---

## Project Conventions Check

- `AGENTS.md` is not present in repo root; conventions were inferred from `package.json` / `tsconfig.json`.
- Test runner: **Vitest** (`npm test` → `vitest run`)
- Typecheck: `npm run typecheck` (`tsc --noEmit`)
- Single-test command used in plan (`npx vitest run <file> -t "<name>"`) matches project setup.

---

## Per-Task Assessment

### Task 1: Create symbol lookup module with exact single-match support — ✅ PASS
- Good: 1 task → 1 test, minimal initial implementation.
- Step 2 includes a concrete expected failure (module missing).

### Task 2: Add dot-notation nested symbol lookup — ✅ PASS
- Single behavior test, clear failure condition, minimal implementation.
- Note (optional): current dot-notation logic only searches **top-level** parents and **direct** children; acceptable for AC 2 as written.

### Task 3: Add case-insensitive fallback tier — ✅ PASS
- Single behavior, correctly placed after exact + dot tiers.

### Task 4: Add unique partial-substring match tier — ✅ PASS
- Single behavior and correct tier ordering (after exact + dot + CI).

### Task 5: Return ambiguous for multi-match partial tier — ✅ PASS
- Single behavior.

### Task 6: Return ambiguous for multi-match exact tier and preserve priority — ✅ PASS
- Single behavior.
- Good: explicitly asserts “don’t mix lower-tier results” (AC 6).

### Task 7: Add empty-query and edge not-found guards — ❌ REVISE
- **Granularity:** the test covers **three distinct behaviors** in one `it(...)`:
  - AC 7 not-found for missing symbol
  - AC 8 not-found for empty query
  - AC 9 not-found for empty `symbols` array
- Revision: split into 3 tasks (or at least 2) so each task introduces exactly one new behavioral assertion + minimal code.

### Task 8: Add `symbol` to read tool schema — ✅ PASS
- Single behavior (schema shape).
- Test harness helpers are self-contained.

### Task 9: Reject `symbol + offset` combination — ✅ PASS
- Single behavior.
- Optional: also assert output contains **no hashlined rows** (to ensure “no file content” requirement).

### Task 10: Reject `symbol + limit` combination — ✅ PASS
- Single behavior.

### Task 11: Read only the matched symbol range and keep anchors editable — ❌ REVISE
- **Granularity:** combines multiple behaviors in one test:
  - AC 13 “returns only the symbol range”
  - AC 20 “anchors are valid for edit tool” (via `applyHashlineEdits`)
  - (also partially asserts AC 19 small-file behavior)
- Revision: split into two tasks/tests:
  1) Symbol read returns only lines X–Y (no edit application)
  2) Hash anchors from symbol read can be used with `applyHashlineEdits`

### Task 12: Add symbol header and ensure no structural map on symbol reads (large file) — ✅ PASS (minor note)
- Test asserts multiple facets (header + no map + correct range) but they are tightly coupled to the “large-file symbol output format” behavior.
- Minor note: Step 2 failure description is a bit qualitative (“has no header yet”); acceptable, but you could make it more specific (e.g., “expected header substring missing”).

### Task 13: Return disambiguation message for ambiguous symbol queries — ✅ PASS
- Good: asserts **no hashlined output** (AC 16).

### Task 14: Add not-found warning and fall back to normal read — ✅ PASS
- Single scenario behavior.
- Optional: ensure the warning lists **top-level** symbols (current plan does) and that the list is capped (handled next task).

### Task 15: Cap not-found warning symbol list at 20 names — ✅ PASS
- Single behavior.
- Good: uses a mocked map to avoid fixture bloat.

### Task 16: Add unmappable-file warning fallback using `.txt` fixture — ✅ PASS
- Single behavior.
- Good: warning wording naturally matches `.txt` (per earlier review constraints).

### Task 17: Document `symbol` parameter in prompt [no-test] — ✅ PASS
- Valid `[no-test]` justification (documentation-only).
- Includes verification commands.

---

## Coverage

All acceptance criteria (AC 1–21) are covered by at least one task per the plan’s coverage matrix.

**No missing ACs detected.**

---

## Ordering & Dependencies

- Dependencies are linear and safe.
- Minor note: Task 8 depends on Task 7; schema work doesn’t truly require lookup guards, but this ordering is fine.

---

## Required Revisions (Actionable)

1) **Split Task 7** into separate tasks/tests so each covers exactly one of AC 7/8/9.

2) **Split Task 11** into separate tasks/tests so “symbol-only range” and “anchors work with applyHashlineEdits” are independently validated.

Optional improvements (non-blocking):
- Consider handling `query.includes(".")` where multiple parents/children match (return `ambiguous` at the dot-notation tier).
- Clarify whether Issue #008’s “prefer largest span” ambiguity rule is intentionally not part of this spec (current ACs require returning all candidates).

---

## Verdict

**revise** — After splitting Tasks 7 and 11 (and updating the coverage/dependency notes accordingly), the plan should be ready to approve.
