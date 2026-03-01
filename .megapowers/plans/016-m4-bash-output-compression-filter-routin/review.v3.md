# Plan Review — 016-m4-bash-output-compression-filter-routin

## Project conventions check
- Repo contains **AGENT-NATIVE-TOOLS.md** (not `AGENTS.md`).
- `package.json` scripts:
  - `npm test` → `vitest run`
  - `npm run typecheck` → `tsc --noEmit`
- Plan uses TypeScript + `.js` import specifiers + `npx vitest run` — ✅ consistent.

---

## Action items (must-fix before implementation)
1. **Fix technique function call signatures in `filterBashOutput`.**
   - Current technique APIs in this repo are:
     - `aggregateTestOutput(output, command) => string | null`
     - `compactGitOutput(output, command) => string | null`
     - `filterBuildOutput(output, command) => string | null`
     - `aggregateLinterOutput(output, command) => string | null`
   - Plan currently calls each as `technique(stripped)` and assumes a `string` return.
   - Update plan/tests/implementation to call `technique(stripped, command)` and handle `null` by falling back to `stripped`.

2. **Add explicit command-detection coverage for all AC6–AC9 examples.**
   Current routing spy tests only cover a subset (`npm test`, `git diff`, `tsc`, `eslint .`).
   - Add unit tests (preferably table-driven) for:
     - AC6: `vitest`, `jest`, `pytest`, `cargo test`, `npm test`, `npx vitest`
     - AC8: `cargo build`, `npm run build`, `tsc`
     - AC9: `eslint`, `prettier --check`, `tsc --noEmit`

3. **Resolve routing priority for `tsc --noEmit` (linter vs build).**
   - AC8 implies `isBuildCommand("tsc --noEmit") === true` (contains `tsc`).
   - AC9 requires `isLinterCommand("tsc --noEmit") === true`.
   - Therefore both predicates are true; the plan must define priority.
   - Recommended: **test > git > linter > build** (or special-case `tsc --noEmit` as linter), and add a test proving the chosen behavior.

4. **Align AC14 priority test with the spec’s example ("cargo test").**
   - Spec says a command matching both test+build “e.g., `cargo test`”.
   - In current repo `isBuildCommand` does **not** match `cargo test` (it matches `cargo build` / `cargo check`).
   - Either:
     - adjust the priority test input to a command that truly matches both in this repo (e.g. `cargo test && cargo build`), **and** update the plan text to explain why, **or**
     - broaden `isBuildCommand` so `cargo test` also matches (if that’s intended).

5. **Logging behavior when `PI_RTK_SAVINGS=1`.**
   - Plan logs only when `savedChars > 0`. AC19 doesn’t specify this condition.
   - Safer: log whenever `PI_RTK_SAVINGS === "1"` (even if saved is 0), or update tests + plan rationale if the conditional behavior is intentional.

6. (Nice-to-have safety) Add integration test for **`toolName: "sg"`** returning `undefined` (since spec says “any tool other than Bash is never processed”).

---

## Per-Task Assessment

### Task 1: Fixture validation tests — ✅ PASS
No blocking issues.
- TDD steps are complete.
- Fixture tests match AC21–AC25.

### Task 2: filterBashOutput — empty input and ANSI stripping — ✅ PASS
No blocking issues.
- Uses existing `src/rtk/ansi.ts` (`stripAnsi`) correctly.
- TDD steps are complete.

### Task 3: routes test commands to aggregateTestOutput — ❌ REVISE
- **Implementation mismatch:** `aggregateTestOutput` in this repo is `(output, command) => string | null`, but plan calls `aggregateTestOutput(stripped)`.
- **Test mismatch:** spy should expect two args; additionally the filter must handle `null` returns.
- **Coverage gap vs AC6:** only covers `npm test`. Needs table-driven tests for the remaining required command strings.

### Task 4: routes git commands to compactGitOutput — ❌ REVISE
- **Implementation mismatch:** `compactGitOutput` is `(output, command) => string | null`, but plan calls `compactGitOutput(stripped)`.
- If you broaden `isGitCommand`, also ensure `compactGitOutput` continues to return `null` for unsupported git subcommands (current behavior) and that `filterBashOutput` falls back to `stripped`.

### Task 5: routes build commands to filterBuildOutput (build-first ordering) — ❌ REVISE
- **Implementation mismatch:** `filterBuildOutput` is `(output, command) => string | null`.
- **Plan risk:** “deliberately wrong order” adds churn and temporarily violates AC14 until Task 7. Consider removing this detour and implementing the final priority order directly.
- **Coverage gap vs AC8:** only tests `tsc`; add tests for `cargo build` and `npm run build`.

### Task 6: routes linter commands to aggregateLinterOutput — ❌ REVISE
- **Implementation mismatch:** `aggregateLinterOutput` is `(output, command) => string | null`.
- **Coverage gap vs AC9:** only tests `eslint .`; must add `prettier --check` and `tsc --noEmit`.
- **Priority gap:** without an explicit ordering rule, `tsc --noEmit` will likely route as build (depending on chain order), contradicting the “linter commands route to aggregateLinterOutput” expectation.

### Task 7: test command wins over build command (priority) — ❌ REVISE
- **Spec alignment issue:** input `"npm test && npm run build"` is fine logically, but AC14’s example is `cargo test`. Either align the test input with the spec or explain why a different overlap command is used.
- Ensure the test snippet is self-contained (imports `buildModule` / `testOutput` in the correct scope).

### Task 8: technique error returns ANSI-stripped original — ❌ REVISE
- The try/catch idea is correct, but it must wrap calls with correct signatures (`technique(stripped, command)`).
- Add a note that if the technique returns `null`, it should also fall back to `stripped` (same as the error path), otherwise you can end up returning `null` or computing `savedChars` off `null`.

### Task 9: index.ts wiring — isBashToolResult gate and compression — ✅ PASS (with minor suggestions)
- ✅ Correctly gates by `isBashToolResult(event)` and returns `undefined` otherwise.
- ✅ Returns `{ content: [{ type: "text", text: ... }] }` for bash results.
- ✅ Updates `tests/entry-point.test.ts` mock to include `on()`.
- Suggestion: add one more integration case for `toolName: "sg"` returning `undefined` (safety).

### Task 10: Savings logging — PI_RTK_SAVINGS=1 — ❌ REVISE
- Potential spec mismatch: plan logs only when `savedChars > 0` but AC19 doesn’t constrain that.
- Test currently only checks “some logging happened”; consider asserting it logs even when savings are 0 **if** you decide that’s desired.

---

## Missing Coverage
- **AC6:** Only `npm test` is indirectly tested. Missing explicit coverage for `vitest`, `jest`, `pytest`, `cargo test`, `npx vitest`.
- **AC8:** Only `tsc` is indirectly tested. Missing `cargo build`, `npm run build`.
- **AC9:** Only `eslint` is indirectly tested. Missing `prettier --check`, `tsc --noEmit`.
- **AC14 (example alignment):** Plan’s overlap example differs from spec’s `cargo test`.

---

## Verdict: **revise**
The plan is close, but it will not compile/pass as written due to incorrect technique function signatures and it misses required command-detection coverage (AC6–AC9). After addressing the action items above, the plan should be ready for implementation.
