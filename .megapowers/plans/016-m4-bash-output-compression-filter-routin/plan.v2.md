Plan review notes for Issue 016-m4-bash-output-compression-filter-routin

Key findings
- AGENTS.md not present in repo. Conventions inferred from package.json + existing tests.
- Repo uses vitest; scripts: `vitest run`, `tsc --noEmit`. Existing tests use Node ESM utilities: `fileURLToPath(import.meta.url)` + `dirname` (NOT `import.meta.dirname`). Tests commonly import source files with `.js` specifiers (e.g. `../src/read.js`).
- `@mariozechner/pi-coding-agent` tool_result `toolName` values are lowercase. Type guard implementation: `isBashToolResult(e) { return e.toolName === "bash"; }`.

Major required revisions
1) Command detection ACs (6,7,9) are currently not satisfied by existing technique files:
   - isTestCommand currently matches generic substring "test" (TEST_COMMANDS includes "test"), so it will incorrectly return true for commands like `echo test`.
   - isGitCommand currently only matches a short allowlist (diff/status/log/show/stash), but AC7 requires true for any command starting with `git`.
   - isLinterCommand does not include `tsc --noEmit` as required by AC9.
   The plan currently proposes not modifying technique files, but acceptance criteria require these functions’ behavior. Plan must add tasks to update `src/rtk/test-output.ts`, `src/rtk/git.ts`, and `src/rtk/linter.ts` (detection only) and corresponding tests.

2) Tool_result wiring tests do not actually test index.ts wiring (AC16-20):
   - Current Task 7 tests only `isBashToolResult` from the dependency, not that index.ts registers a handler and transforms Bash results while leaving others unchanged.
   - Logging tests in Task 8 simulate the handler rather than asserting actual index.ts behavior.
   Plan must include a mock `pi` with `.on(...)` capture, invoke the captured handler with representative events (toolName lowercase), and assert return values and stderr logging.

3) TDD protocol mismatches:
   - Tasks 4/5/6/8 describe “write failing test” but then expect PASS because Task 3 already implemented everything. This violates the required 5-step TDD format (Step 2 needs a specific expected failure).
   - Routing Task 5 bundles multiple behaviors into one task; protocol prefers one behavior per task.

4) Path resolution in new tests:
   - Plan uses `import.meta.dirname` which is not used elsewhere in repo and not standard Node.
   - Should use `const __dirname = dirname(fileURLToPath(import.meta.url));` and then `resolve(__dirname, "fixtures")`.

5) Dependency annotations:
   - Task 5 and Task 8 read fixture files but do not depend on Task 1 (fixture creation). Add correct depends.

Suggested re-structure (high level)
- Task A: Add/adjust command-detection tests for AC6/7/8/9 (including negative cases) then update detection functions in the technique files.
- Task B: Create `src/rtk/bash-filter.ts` minimal (empty output + ANSI strip + fallback) with tests.
- Task C/D/E: Add routing tests per command type (test/git/build/lint) and implement routing incrementally; ensure precedence rule test.
- Task F: Add error-resilience test (mock technique throws) then implement try/catch.
- Task G: Integration test: mock pi, confirm handler registered and:
   - non-bash events return undefined
   - bash event returns transformed content
   - PI_RTK_SAVINGS=1 logs to stderr, otherwise no log
  Then implement index.ts wiring.

Concrete corrections to incorporate
- Update test events to use `toolName: "bash" | "read" | "grep" | "edit"` (lowercase).
- Ensure `isGitCommand("git branch")` passes.
- Ensure `isTestCommand("echo test")` is false.
- Ensure `isLinterCommand("tsc --noEmit")` is true.
