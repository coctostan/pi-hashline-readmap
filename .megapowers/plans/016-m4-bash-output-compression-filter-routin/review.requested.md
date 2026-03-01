# Plan Review (requested) — 016-m4-bash-output-compression-filter-routin

Reviewed file: `.megapowers/plans/016-m4-bash-output-compression-filter-routin/plan.md`

## Project conventions check
- `package.json` scripts:
  - `npm test` → `vitest run`
  - `npm run typecheck` → `tsc --noEmit`
- Plan declares `npx vitest run` (fine), but should consistently use either `npm test` or `npx vitest run` in **every task Step 2/4/5**.

---

## Blocking issues (must revise)

### 1) Plan is not TDD-complete / not self-contained
Every task is missing the required 5 TDD steps (Step 1–5), and some tasks contain placeholders like “unchanged from plan.md”. As written, a developer cannot execute the plan without additional context.

Concrete placeholders to replace:
- `22:e4` — `(fixture tests and content unchanged from plan.md)`
- `30:44` — `(unchanged from plan.md)`

**Revision required:** Expand each task to include:
1) full test code, 2) exact run command + expected failure, 3) full minimal implementation code, 4) exact run command + expected pass, 5) full suite run + expected pass.

### 2) Incorrect build-technique function name
Task 6 references `filterBuild(...)`, but the repo’s RTK build technique exports `filterBuildOutput(...)`.

- `67:57` — change `filterBuild(stripped, command)` → `filterBuildOutput(stripped, command)`

(If you keep `filterBuild` as a local alias, the plan must explicitly show the import/alias in the implementation step.)

### 3) Granularity violations / “test-only task” without steps
Task 7 says “No implementation change needed”, which violates the plan rules as written (each task needs a test + implementation flow, or must be explicitly justified as test-only and still include Step 1/2/4/5).

- `76:d7` — replace `- No implementation change needed` with either:
  - Option A (recommended): **merge Task 7 into Task 6** (include the priority tests in Task 6’s test file and implement final routing order once), OR
  - Option B: keep Task 7, but add full Step 1/2/4/5 and make Step 3 explicitly state the small implementation change it depends on (or state “no code change; verifies behavior already implemented in Task 6” and still provide the exact run commands + expected outputs).

### 4) index.ts wiring details are underspecified
Task 9 says it wires `tool_result`, but the plan does not specify *where* the bash output string comes from (`event.content`) nor *how* the bash command is read (`event.input.command`). It also doesn’t specify how to handle non-text content blocks.

- `88:08`–`94:05` — expand Task 9 with concrete handler pseudo-API:
  - Use `isBashToolResult(event)` (import from `@mariozechner/pi-coding-agent`).
  - Extract `command` from `event.input.command`.
  - Extract output text from `event.content` (typically `[{ type: "text", text: "..." }]`).
  - Return `{ content: [{ type: "text", text: compressedOutput }] }` and `undefined` otherwise.

(These details must appear in Task 9 Step 3 implementation code.)

---

## Per-Task Assessment

### Task 1: Fixture validation tests — ❌ REVISE
- Missing required TDD steps (Step 1–5).
- Placeholder must be replaced with full test code + full fixture file contents.
  - Anchor: `22:e4`
- Self-containment issue: “unchanged from plan.md” provides no executable steps.

### Task 2: filterBashOutput — empty input and ANSI stripping — ❌ REVISE
- Missing required TDD steps (Step 1–5).
  - Anchor: `30:44`
- Must explicitly define how `savedChars` is computed in tests (important because ANSI stripping changes string length). Ensure tests lock the intended interpretation of AC5.

### Task 3: command detection and test routing — ❌ REVISE
- Missing required TDD steps (Step 1–5).
- Clarify whether `isTestCommand/isGitCommand/isBuildCommand/isLinterCommand` are **exported** from `src/rtk/bash-filter.ts` (they likely must be, to test AC6–AC9 directly).
  - Anchors: `38:ac`, `39:cf`
- Ensure tests cover **all** AC6–AC9 examples (table-driven), and that the routing priority (test > build) is tested (or explicitly deferred to Task 7 merged into Task 6).

### Task 4: git routing — ❌ REVISE
- Missing required TDD steps (Step 1–5).
- The plan claims “Tests null fallback for unsupported git subcommands”, but does not specify the exact test inputs/expected assertions.
  - Anchor: `49:fc`

### Task 5: linter routing — ❌ REVISE
- Missing required TDD steps (Step 1–5).
- Priority statement needs to be enforced by an explicit test (either here or in the merged priority task).
  - Anchor: `57:bc`

### Task 6: build routing — ❌ REVISE
- Missing required TDD steps (Step 1–5).
- **Bug:** wrong technique function name.
  - Anchor: `67:57`

### Task 7: routing priority tests — ❌ REVISE
- Missing required TDD steps (Step 1–5).
- “No implementation change needed” is not acceptable without converting the task to a test-only verification task with explicit steps/run commands.
  - Anchor: `76:d7`

### Task 8: technique error handling — ❌ REVISE
- Missing required TDD steps (Step 1–5).
- Must specify *how* the technique throw is simulated in tests (e.g., `vi.spyOn(module, "aggregateTestOutput").mockImplementation(() => { throw new Error("boom") })`) and the exact expected assertion.
  - Anchor: `84:d8`

### Task 9: index.ts wiring — ❌ REVISE
- Missing required TDD steps (Step 1–5).
- Needs explicit event-shape handling details (extract `command` from `event.input.command`; read/write `event.content`).
  - Anchors: `88:08`–`93:23`

### Task 10: Savings logging — ❌ REVISE
- Missing required TDD steps (Step 1–5).
- The plan states it logs whenever `PI_RTK_SAVINGS=1`, but does not specify what the log line contains (format) nor what the test asserts.
  - Anchor: `101:e9`

---

## Missing Coverage
- The AC → Task coverage table claims full coverage, but because tasks lack executable steps/tests, coverage is not actually demonstrated.
- Once tasks are expanded, re-check that AC6–AC9 examples are each asserted at least once in unit tests.

---

## Verdict: **revise**
This `plan.md` is a high-level outline, not an implementation-ready TDD plan. Convert every task into the required Step 1–5 format, fix the `filterBuildOutput` naming issue, and resolve the Task 7 test-only/merge problem. After these revisions, re-submit for re-review.
