## Plan

**Plan Name:** Bash Output Compression Filter & Routing  
**Issue:** 016-m4-bash-output-compression-filter-routin  
**Test framework:** vitest (`npx vitest run`)  
**Project conventions:** From `AGENT-NATIVE-TOOLS.md` — TypeScript, `.js` import specifiers, vitest for tests.

---

### Task 1: Fixture validation tests

**Files:**
- Create: `tests/bash-filter-fixtures.test.ts`
- Create: `tests/fixtures/vitest-pass.txt`
- Create: `tests/fixtures/vitest-fail.txt`
- Create: `tests/fixtures/tsc-errors.txt`
- Create: `tests/fixtures/git-diff-large.txt`
- Create: `tests/fixtures/eslint-output.txt`

**Covers AC:** 21, 22, 23, 24, 25

(fixture tests and content unchanged from plan.md)

---

### Task 2: filterBashOutput — empty input and ANSI stripping

**Covers AC:** 1, 2, 3, 5, 15

(unchanged from plan.md)

---

### Task 3: filterBashOutput — command detection and test command routing **[depends: 2]**

**Covers AC:** 6, 7, 8, 9, 10

- Defines own `isTestCommand`, `isGitCommand`, `isBuildCommand`, `isLinterCommand` in bash-filter.ts
- Table-driven detection tests for all AC6-AC9 examples
- Routes test commands via `aggregateTestOutput(stripped, command) ?? stripped`

---

### Task 4: filterBashOutput — routes git commands to compactGitOutput **[depends: 3]**

**Covers AC:** 11

- Routes via `compactGitOutput(stripped, command) ?? stripped`
- Tests null fallback for unsupported git subcommands

---

### Task 5: filterBashOutput — routes linter commands to aggregateLinterOutput **[depends: 4]**

**Covers AC:** 13

- Priority: linter checked before build (so `tsc --noEmit` routes to linter)
- Routes via `aggregateLinterOutput(stripped, command) ?? stripped`

---

### Task 6: filterBashOutput — routes build commands to filterBuildOutput **[depends: 5]**

**Covers AC:** 12

- Final chain: test → git → linter → build → fallback
- Routes via `filterBuild(stripped, command) ?? stripped`

---

### Task 7: filterBashOutput — routing priority tests **[depends: 6]**

**Covers AC:** 14

- Regression locks: test > build (`npm test && npm run build`), linter > build (`tsc --noEmit`)
- No implementation change needed

---

### Task 8: filterBashOutput — technique error returns ANSI-stripped original **[depends: 6]**

**Covers AC:** 4

- try/catch wraps routing, falls back to stripped on error

---

### Task 9: index.ts wiring — isBashToolResult gate and compression **[depends: 8]**

**Covers AC:** 16, 17, 18

- Includes sg tool isolation test
- Updates entry-point.test.ts mockPi with `on()` method

---

### Task 10: Savings logging — PI_RTK_SAVINGS=1 **[depends: 9]**

**Covers AC:** 19, 20

- Logs whenever PI_RTK_SAVINGS=1 (no savedChars > 0 condition)

---

## AC → Task Coverage Map

| AC | Task(s) | Description |
|----|---------|-------------|
| 1 | 2 | filterBashOutput returns { output, savedChars } |
| 2 | 2 | ANSI stripping |
| 3 | 2 | Empty input |
| 4 | 8 | Technique error catch |
| 5 | 2 | savedChars accuracy |
| 6 | 3 | isTestCommand (table-driven: vitest, jest, pytest, cargo test, npm test, npx vitest) |
| 7 | 3 | isGitCommand (table-driven: git diff, git commit, git status) |
| 8 | 3 | isBuildCommand (table-driven: tsc, cargo build, npm run build) |
| 9 | 3 | isLinterCommand (table-driven: eslint, prettier --check, tsc --noEmit) |
| 10 | 3 | Test routing |
| 11 | 4 | Git routing |
| 12 | 6 | Build routing |
| 13 | 5 | Linter routing |
| 14 | 7 | Test > build priority + linter > build priority |
| 15 | 2 | Fallback ANSI-strip |
| 16 | 9 | tool_result handler registration |
| 17 | 9 | Non-bash returns undefined (read, grep, edit, sg) |
| 18 | 9 | Bash returns compressed content |
| 19 | 10 | PI_RTK_SAVINGS=1 logging |
| 20 | 10 | No logging when unset |
| 21-25 | 1 | Fixture files |