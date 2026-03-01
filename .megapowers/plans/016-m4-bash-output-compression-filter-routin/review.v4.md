# Plan Review — 016-m4-bash-output-compression-filter-routin

Reviewed file: `.megapowers/plans/016-m4-bash-output-compression-filter-routin/plan.md`

## Project conventions check
- `package.json` scripts:
  - `npm test` → `vitest run`
  - `npm run typecheck` → `tsc --noEmit`
- Plan uses `npx vitest run …` throughout — acceptable, but keep it consistent (don’t mix `npm test` in later tasks).

---

## Blocking revisions (must fix before implementation)

### 1) Tasks 5–8, 9, 10 violate the “full test code” rule (plan is not self-contained)
Several tasks say “add this import” / “add this test block” rather than providing the **full resulting test file** for Step 1.

Concrete places to revise in `plan.md`:
- **Task 5 Step 1**
  - Anchor `637:f5` — `In tests/bash-filter.test.ts, add:`
  - Anchor `643:39` — `and inside describe(...), add:`
- **Task 6 Step 1**
  - Anchor `746:f5` — `In tests/bash-filter.test.ts, add:`
  - Anchor `752:39` — `and inside describe(...), add:`
- **Task 7 Step 1**
  - Anchor `858:fe` — `In tests/bash-filter.test.ts, add inside …`
- **Task 8 Step 1**
  - Anchor `917:fe` — `In tests/bash-filter.test.ts, add inside …`
- **Task 9 Step 1** (partial snippet change to entry-point test)
  - Anchor `996:fa` — `First, update tests/entry-point.test.ts …`
- **Task 10 Step 1** (partial snippet change to integration test)
  - Anchor `1131:df` — `Update tests/bash-filter-integration.test.ts …`

**Required revision:** For each of these tasks, replace the “add…” instructions with a **full file listing** of the updated test file (or restructure so each task does `Replace tests/… with:` like Tasks 3–4 do).

---

### 2) AC2 is not strongly proven for routed techniques (strip ANSI *before* calling the technique)
AC2 requires stripping ANSI escape codes **before applying any technique**. The plan tests final output stripping for the fallback path (Task 2), but does not explicitly assert that the routed technique receives stripped input.

Concrete place to revise:
- **Task 3 routing test**
  - Anchor `396:22` — `it("routes test commands to aggregateTestOutput …"`)
  - Anchor `404:2d` — test uses ANSI input in the “null fallback” case but does not assert spy args.

**Required revision:** In Task 3 (or any single routing task), add an assertion like:
- Call `filterBashOutput("npm test", "\x1b[32mraw\x1b[0m")`
- Assert `aggregateTestOutput` spy was called with first arg exactly `"raw"` (stripped), not the ANSI string.

---

### 3) Integration test should cover *all* non-bash tools mentioned in the spec (hashline safety)
The integration test in Task 9 only asserts that a `read` tool_result is untouched. The spec and out-of-scope section explicitly call out Read/Grep/Edit/sg must never be processed.

Concrete place to revise:
- Anchor `1035:e6` — `// Non-bash must be untouched` (currently only a `readEvent`)

**Required revision:** Extend the integration test to also send `toolName: "grep"`, `"edit"`, and `"sg"` events (with hashline-like text in `content`) and assert the handler returns `undefined` for each.

---

### 4) Task 10 test restores `process.env` incorrectly when the original value is unset
In Node, `process.env.KEY = undefined as any` can result in the string `"undefined"`, not true deletion.

Concrete place to revise:
- Anchor `1161:aa` — `const origEnv = process.env.PI_RTK_SAVINGS;`
- Anchor `1182:93` — `process.env.PI_RTK_SAVINGS = origEnv;`

**Required revision:** Replace the restore logic with:
- `if (origEnv === undefined) delete process.env.PI_RTK_SAVINGS; else process.env.PI_RTK_SAVINGS = origEnv;`

---

### 5) Task 7 creates overlap by changing build detection; prefer an overlap command instead
Task 7 currently forces overlap by expanding `isBuildCommand` to match `cargo test`.

Concrete places:
- Anchor `861:6f` — test uses `cargo test` as the overlap example.
- Anchor `887:9e` — Step 3 changes `isBuildCommand` to include `cargo test`.

**Required revision (recommended):** Avoid changing command detection purely to manufacture an overlap. Use a command that naturally matches both predicates, e.g.:
- `command = "cargo test && cargo build"` (matches test via `cargo test` and build via `cargo build`)

Then you can delete Task 7 Step 3 entirely (or replace it with a no-op implementation step that explicitly says “no production code change; verifying routing order already implemented”).

---

## Per-Task Assessment

### Task 1: Fixture validation tests — ✅ PASS
No blocking issues.

### Task 2: filterBashOutput — empty input and ANSI stripping — ⚠️ REVISE (granularity)
- Anchor `281:a2` — single test covers multiple behaviors (empty output + ANSI stripping + savedChars). Consider splitting into 2–3 smaller `it(...)` cases for clearer failures.
  - Not strictly blocking if you keep it, but it improves TDD feedback quality.

### Task 3: command detection and test command routing — ❌ REVISE
- Must add assertion that the routed technique receives **ANSI-stripped** input (AC2), not just that the final output is stripped.
  - Anchors `396:22`, `404:2d`.

### Task 4: routes git commands to compactGitOutput — ✅ PASS
No blocking issues.

### Task 5: routes linter commands to aggregateLinterOutput — ❌ REVISE
- Step 1 is not self-contained (snippets only).
  - Anchors `637:f5`, `643:39`.

### Task 6: routes build commands to filterBuildOutput — ❌ REVISE
- Step 1 is not self-contained (snippets only).
  - Anchors `746:f5`, `752:39`.

### Task 7: routing priority tests — ❌ REVISE
- Prefer overlap command (`cargo test && cargo build`) rather than modifying `isBuildCommand`.
  - Anchors `861:6f`, `887:9e`.
- If you keep it as a separate task, Step 1 must be full file content.
  - Anchor `858:fe`.

### Task 8: technique error returns ANSI-stripped original — ❌ REVISE
- Step 1 is not self-contained (snippet only).
  - Anchor `917:fe`.

### Task 9: index.ts wiring — ✅ PASS (with required test expansion)
- Implementation approach is fine.
- Must extend the “non-bash untouched” integration test to cover grep/edit/sg as well.
  - Anchor `1035:e6`.

### Task 10: Savings logging — ❌ REVISE
- Step 1 is not self-contained (snippet-only changes).
  - Anchor `1131:df`.
- Must fix env restore logic.
  - Anchor `1182:93`.

---

## Missing Coverage
- **AC2 (strip before technique):** not explicitly asserted for a routed technique call (only indirectly via output).
- **Hashline isolation safety:** integration test should explicitly include `grep`, `edit`, `sg` (spec emphasis).

---

## Verdict: **revise**
The plan is close and largely correct, but it needs the self-containment fixes (full test file listings) plus the AC2/"strip before technique" assertion, expanded non-bash integration coverage, and the `process.env` restore fix.
