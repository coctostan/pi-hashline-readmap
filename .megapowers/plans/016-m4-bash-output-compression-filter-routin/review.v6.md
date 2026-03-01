# Plan Review — 016-m4-bash-output-compression-filter-routin

Reviewed file: `.megapowers/plans/016-m4-bash-output-compression-filter-routin/plan.md`

## Project conventions check
- Repo is ESM (`package.json` has `"type": "module"`).
- Test runner: `vitest run` (matches plan’s `npx vitest run …`).
- Imports in tests/prod should use `.js` specifiers (plan does).

---

## Blocking revisions (must fix before implementation)

### 1) Task 7 is internally inconsistent with TDD steps (Step 1 says “failing test”, Step 2 expects PASS)
- **Where:** Task 7
  - Step 1 heading: `986:4a`
  - Step 2 heading/result: `1103:d6|**Step 2 — Run test, verify it passes (no new production code needed)**`

**Revision required:** Make Task 7 a *test-addition* task with an expected **FAIL** in Step 2 (if priority is not implemented yet), *or* explicitly rename Step 1 to “Add regression test” and keep Step 2 as **PASS**.

If the intent is “priority already correct from Task 6”, then Task 7 should be rewritten as:
- Step 1 — Add the test (full code)
- Step 2 — Run and expect PASS
- Step 3 — No production code change (explicit)
- Step 4 — Run and expect PASS
- Step 5 — Full suite PASS

### 2) AC14 is not met precisely as written (spec’s example `cargo test` does not match current `isBuildCommand`)
- **Where:** `isBuildCommand` implementation examples only match `"cargo build"`, not `"cargo test"`
  - `932:f4|export function isBuildCommand...`
  - `934:52|return ["tsc", "cargo build", "npm run build"].some(...)`

- **Where:** Task 7 forces overlap via a compound command (`cargo test && cargo build`)
  - `1085:b6|const cmd = "cargo test && cargo build";`

**Why blocking:** AC14 explicitly says the overlap scenario is `cargo test` (i.e., the plan/spec expects there to be *some* command that makes both predicates true, and uses `cargo test` as the canonical example). With the current predicate list, `cargo test` will **not** match `isBuildCommand`, so this plan may fail an external acceptance test that checks the `cargo test` example literally.

**Revision required (pick one):**
1) **Adjust `isBuildCommand`** so that `"cargo test"` returns `true` (while still keeping routing priority so tests win). For example, include `"cargo "` (or `"cargo"`) in the build tokens.
2) **If the spec/example is wrong**, update `plan.md` (and ideally `spec.md`) so AC14’s example uses a command that truly matches both predicates under the desired detection rules.

### 3) Unit test spying may not work reliably with ESM named imports; revise `bash-filter.ts` imports OR revise tests to use `vi.mock`
The plan’s unit tests use `vi.spyOn(moduleNamespace, "fn")` for technique modules (good), but the plan’s production code imports technique functions via **named imports** and calls them via the local binding.

In ESM, `spyOn()` on a namespace object is not guaranteed to affect a separately-imported named binding in the consumer module. This can cause multiple tasks’ “spy to have been called” assertions to fail even when routing is correct.

- **Where:** Named import patterns to revise in Task 3–6 implementations:
  - `424:cc|import { aggregateTestOutput } from "./test-output.js";`
  - `569:ea|import { compactGitOutput } from "./git.js";`
  - `734:6c|import { aggregateLinterOutput } from "./linter.js";`
  - `915:b3|import { filterBuildOutput } from "./build.js";`

**Revision required (recommended approach):**
- Change production imports to namespace imports and call through the namespace:
  - `import * as testOutput from "./test-output.js";` then `testOutput.aggregateTestOutput(...)`
  - `import * as git from "./git.js";` then `git.compactGitOutput(...)`
  - `import * as linter from "./linter.js";` then `linter.aggregateLinterOutput(...)`
  - `import * as build from "./build.js";` then `build.filterBuildOutput(...)`

This keeps the plan’s spying strategy valid and avoids brittle ESM mocking.

---

## Per-Task Assessment

### Task 1: Fixture validation tests — ✅ PASS
No blocking issues.

### Task 2: filterBashOutput — empty input and ANSI stripping — ✅ PASS
Covers AC1/2/3/5/15 and is self-contained.

### Task 3: command detection and test command routing — ⚠️ REVISE
- **Blocking:** Update Step 3 production import style to avoid ESM spy issues.
  - Anchor: `424:cc`

### Task 4: git routing — ⚠️ REVISE
- **Blocking:** Update Step 3 production import style to avoid ESM spy issues.
  - Anchor: `569:ea`

### Task 5: linter routing — ⚠️ REVISE
- **Blocking:** Update Step 3 production import style to avoid ESM spy issues.
  - Anchor: `734:6c`

### Task 6: build routing — ⚠️ REVISE
- **Blocking:** Update Step 3 production import style to avoid ESM spy issues.
  - Anchor: `915:b3`

### Task 7: routing priority tests — ❌ REVISE
- **Blocking:** Step 1/2 mismatch (“failing test” but Step 2 expects PASS).
  - Anchors: `986:4a`, `1103:d6`
- **Blocking:** AC14 example mismatch (`cargo test` vs current `isBuildCommand`).
  - Anchors: `934:52`, `1085:b6`

### Task 8: technique error returns ANSI-stripped original — ✅ PASS
Logic is correct; ensure the Task 8 test continues to pass after revising technique imports as per Blocking revision #3.

### Task 9: index.ts wiring — ✅ PASS
- Correctly uses `isBashToolResult` gate and returns `undefined` for non-bash events.
  - Gate anchor: `1436:68`
- Integration test covers read/grep/edit/sg untouched.
  - Anchors: `1398:c4`–`1401:bf`

### Task 10: Savings logging — ✅ PASS
Test includes both “logging on” and “logging off” cases and restores env safely.
  - Env restore anchor: `1560:0f`–`1562:86`

---

## Missing Coverage
None *if* AC14 is reconciled (see Blocking revision #2).

---

## Verdict: **revise**
This plan is close, but should not proceed until:
1) Task 7 is made TDD-consistent, and
2) AC14 overlap semantics are aligned with the spec/example, and
3) `bash-filter.ts` import style is revised (or tests switched to ESM-safe mocking).
