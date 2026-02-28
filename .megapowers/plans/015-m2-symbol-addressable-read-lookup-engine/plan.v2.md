# Plan Review — 015-m2-symbol-addressable-read-lookup-engine

## Summary
The plan is **close**, but it needs revision to meet the workflow’s strict requirements for:
- **TDD completeness** (each task should go red → minimal code → green)
- **Granularity** (avoid “test-only” tasks that immediately pass)
- **Task/AC alignment** (Task 10 currently implements behaviors claimed for Tasks 11–12)

Project conventions check:
- No `AGENTS.md` found.
- Repo uses **Vitest** + `tsc`.
- `package.json` scripts:
  - `npm test` → `vitest run`
  - `npm run typecheck` → `tsc --noEmit`
- Using `npx vitest run ...` is fine, but using `npm test` / `npm run typecheck` would match repo scripts.

## Action Items (must-fix)

1. **Rework tasks that add only tests and “pass immediately”** (Tasks 5–8, 11–12). Every task must have a failing Step 2 *before* changes, plus a real Step 3 implementation.
2. **Split Task 10 implementation** so it only implements AC 13–15 (single found symbol read + header + no map appendix).
   - Move ambiguous/not-found/unmappable fallback logic into Tasks 11–12 so those tasks go red first.
3. **Ensure “fallback to normal read” truly matches current `read` behavior**:
   - Current `src/read.ts` appends `File Map:` on truncation **only** when neither `offset` nor `limit` is provided.
   - The plan’s fallback branches re-implement formatting/truncation and **skip** the map appendix entirely.
   - Recommendation: factor the existing formatting into an internal helper and reuse it across branches; or prepend warnings then *fall through* to the existing normal path.
4. **Make integration tests assert stable, exact line ranges** (avoid “approximate” assertions).
   - Prefer parsing the `[Symbol: ... lines X-Y of Z]` header and asserting exact X/Y.
5. **Resolve spec vs. batch-issue mismatch:** Source Issue #008 says “**prefer largest span**; if still ambiguous return list.” The AC requires ambiguity for multiple matches (AC 5, AC 10). Confirm which requirement wins; update spec/plan accordingly.

## Per-Task Assessment

### Task 1: Exact symbol match — ❌ REVISE
- **TDD leakage:** Step 3 already implements:
  - ambiguous handling for multiple exact matches (AC 10)
  - empty-query / empty-symbols guard (AC 8/9)
  This makes later tasks (7, 8) “pass immediately.”
- **Fix:** In Task 1, implement only AC 1. Suggested: return `not-found` when `exact.length !== 1`.

### Task 2: Dot-notation nested symbol match — ✅ PASS
- Self-contained and properly staged.

### Task 3: Case-insensitive fallback match — ✅ PASS
- Ordering matches the priority tiers.

### Task 4: Unique partial substring match — ❌ REVISE
- Current Step 3 also implements ambiguous partial behavior (AC 5), which makes Task 5 pass immediately.
- **Fix:** In Task 4, implement only “exactly one substring match → found”; treat multiple partial matches as `not-found` until Task 5.

### Task 5: Ambiguous partial match returns candidates — ❌ REVISE
- Test-only; Step 2 expects PASS.
- **Fix:** Make this the task that changes code to return `{ type: "ambiguous" }` for multiple partial matches.

### Task 6: Priority cascade — ❌ REVISE
- Test-only; Step 2 expects PASS.
- **Fix:** Either fold this test into a task that introduces ordering, or delete as a separate task.

### Task 7: Not-found/empty query/empty symbols — ❌ REVISE
- Test-only; Step 2 expects PASS due to Task 1 guard.
- **Fix:** Move the guard here (so the test fails first) or merge this coverage into Task 1 and remove Task 7.

### Task 8: Multiple exact matches ambiguous — ❌ REVISE
- Test-only; Step 2 expects PASS due to Task 1 ambiguity handling.
- **Fix:** Defer `exact.length > 1 → ambiguous` until this task.

### Task 9: Schema accepts symbol + rejects symbol+offset/limit — ✅ PASS
- Matches existing integration-test style.
- Minor improvement: avoid duplicate schema checks.

### Task 10: Symbol read returns targeted content with header — ❌ REVISE
- **Too much in Step 3:** includes AC 16–18 behavior (ambiguous/not-found/unmappable), leaving Tasks 11–12 without meaningful implementation.
- **Fallback does not match normal read:** duplicated formatting skips structural map append behavior.
- **Fix:** Implement only the `found` path here; push other branches into Tasks 11–12.

### Task 11: Ambiguous + not-found behavior — ❌ REVISE
- Currently expected PASS because Task 10 already includes the logic.
- **Fix:** After narrowing Task 10, this becomes a proper red→green task.

### Task 12: Unmappable fallback + small/large + anchor validity — ❌ REVISE
- Currently expected PASS because Task 10 already includes unmappable fallback.
- **Fix:** Move unmappable behavior here.

### Task 13: Update prompts/read.md — ✅ PASS
- Valid `[no-test]` task with verification steps.

## Missing Coverage
- All AC 1–21 are referenced, but several tasks are not valid TDD steps as written.
- Clarify “prefer largest span” requirement if it still applies.

## Verdict
**revise** — restructure tasks to ensure each one is a real red→green step, and split Task 10 so Tasks 11–12 have meaningful implementation work.
