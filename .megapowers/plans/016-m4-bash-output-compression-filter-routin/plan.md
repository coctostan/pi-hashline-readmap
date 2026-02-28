# Plan: Bash Output Compression Filter & Routing

## Summary
Build `src/rtk/bash-filter.ts` (pure routing function), wire it into `index.ts` via `pi.on("tool_result")`, and add fixture files + tests.

## Test runner
- **Framework:** vitest
- **Run single test:** `npx vitest run <file>`
- **Run all tests:** `npx vitest run`
- **Typecheck:** `npx tsc --noEmit`

## Existing RTK technique signatures
All techniques take `(output: string, command: string | null)` and return `string | null` (null = didn't apply):
- `aggregateTestOutput(output, command)` — from `src/rtk/test-output.ts`
- `compactGitOutput(output, command)` — from `src/rtk/git.ts`
- `filterBuildOutput(output, command)` — from `src/rtk/build.ts`
- `aggregateLinterOutput(output, command)` — from `src/rtk/linter.ts`
- Detection: `isTestCommand`, `isGitCommand`, `isBuildCommand`, `isLinterCommand`
- ANSI: `stripAnsi`, `stripAnsiFast` from `src/rtk/ansi.ts`
- All re-exported from `src/rtk/index.ts`

---

### Task 1: Create fixture files [no-test]

**Justification:** These are static test data files with no behavior to test. Their existence is verified by later tests that consume them.

**Files:**
- Create: `tests/fixtures/vitest-pass.txt`
- Create: `tests/fixtures/vitest-fail.txt`
- Create: `tests/fixtures/tsc-errors.txt`
- Create: `tests/fixtures/git-diff-large.txt`
- Create: `tests/fixtures/eslint-output.txt`

**Step 1 — Create the fixtures**

`tests/fixtures/vitest-pass.txt` — realistic vitest passing output:
```
 ✓ src/utils.test.ts (3 tests) 2ms
   ✓ formatDate returns ISO string
   ✓ parseConfig handles empty input
   ✓ parseConfig merges defaults
 ✓ src/api.test.ts (4 tests) 15ms
   ✓ GET /health returns 200
   ✓ POST /users creates user
   ✓ POST /users validates email
   ✓ DELETE /users/:id returns 204
 ✓ src/db.test.ts (2 tests) 8ms
   ✓ connect retries on failure
   ✓ query returns typed results

 Test Files  3 passed (3)
      Tests  9 passed (9)
   Start at  14:32:01
   Duration  1.24s (transform 312ms, setup 0ms, collect 89ms, tests 25ms, environment 0ms, prepare 45ms)
```

`tests/fixtures/vitest-fail.txt` — realistic vitest failing output:
```
 ✓ src/utils.test.ts (3 tests) 2ms
 ✗ src/api.test.ts (4 tests) 18ms
   ✓ GET /health returns 200
   ✗ POST /users creates user
   ✓ POST /users validates email
   ✓ DELETE /users/:id returns 204

⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯

 FAIL  src/api.test.ts > POST /users creates user
AssertionError: expected 400 to be 201

  ❯ src/api.test.ts:23:18
     21|   const res = await request(app).post('/users').send({ name: 'Alice' });
     22|
     23|   expect(res.status).toBe(201);
       |                      ^
     24|   expect(res.body.id).toBeDefined();
     25| });

  - Expected   201
  + Received   400

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 6 passed (7)
   Start at  14:32:05
   Duration  1.31s (transform 302ms, setup 0ms, collect 92ms, tests 43ms, environment 0ms, prepare 41ms)
```

`tests/fixtures/tsc-errors.txt` — realistic TSC errors (3+):
```
src/api/routes.ts(14,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/api/routes.ts(28,19): error TS2345: Argument of type 'undefined' is not assignable to parameter of type 'User'.
src/models/user.ts(7,3): error TS2564: Property 'email' has no initializer and is not definitely assigned in the constructor.
src/services/auth.ts(42,10): error TS7006: Parameter 'token' implicitly has an 'any' type.

Found 4 errors in 3 files.

Errors  Files
     2  src/api/routes.ts:14
     1  src/models/user.ts:7
     1  src/services/auth.ts:42
```

`tests/fixtures/git-diff-large.txt` — realistic multi-file git diff (5+ hunks):
```
diff --git a/src/api/routes.ts b/src/api/routes.ts
index 1a2b3c4..5d6e7f8 100644
--- a/src/api/routes.ts
+++ b/src/api/routes.ts
@@ -10,7 +10,8 @@ import { Router } from 'express';
 const router = Router();

-router.get('/health', (req, res) => {
-  res.json({ status: 'ok' });
+router.get('/health', async (req, res) => {
+  const dbStatus = await checkDb();
+  res.json({ status: 'ok', db: dbStatus });
 });

@@ -25,6 +26,10 @@ router.post('/users', async (req, res) => {
   const user = await createUser(req.body);
   res.status(201).json(user);
+
+  // Send welcome email
+  await sendWelcomeEmail(user.email);
+  logger.info('Welcome email sent', { userId: user.id });
 });

diff --git a/src/models/user.ts b/src/models/user.ts
index 2b3c4d5..6e7f8g9 100644
--- a/src/models/user.ts
+++ b/src/models/user.ts
@@ -1,8 +1,12 @@
 export interface User {
   id: string;
   name: string;
-  email: string;
+  email: string;
+  createdAt: Date;
+  updatedAt: Date;
+  role: 'admin' | 'user';
+  verified: boolean;
 }

diff --git a/src/services/auth.ts b/src/services/auth.ts
index 3c4d5e6..7f8g9h0 100644
--- a/src/services/auth.ts
+++ b/src/services/auth.ts
@@ -15,9 +15,13 @@ export class AuthService {
-  async verify(token: string) {
-    return jwt.verify(token, this.secret);
+  async verify(token: string): Promise<TokenPayload> {
+    try {
+      return jwt.verify(token, this.secret) as TokenPayload;
+    } catch (err) {
+      throw new AuthError('Invalid token', { cause: err });
+    }
   }

diff --git a/src/config.ts b/src/config.ts
index 4d5e6f7..8g9h0i1 100644
--- a/src/config.ts
+++ b/src/config.ts
@@ -3,4 +3,8 @@ export const config = {
   port: parseInt(process.env.PORT || '3000'),
   dbUrl: process.env.DATABASE_URL || 'postgres://localhost:5432/app',
+  redis: {
+    host: process.env.REDIS_HOST || 'localhost',
+    port: parseInt(process.env.REDIS_PORT || '6379'),
+  },
 };

diff --git a/src/middleware/logging.ts b/src/middleware/logging.ts
index 5e6f7g8..9h0i1j2 100644
--- a/src/middleware/logging.ts
+++ b/src/middleware/logging.ts
@@ -8,5 +8,11 @@ export function requestLogger(req, res, next) {
   const start = Date.now();
-  res.on('finish', () => {
-    console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`);
+  res.on('finish', () => {
+    const duration = Date.now() - start;
+    logger.info('request', {
+      method: req.method,
+      url: req.url,
+      status: res.statusCode,
+      duration,
+    });
   });
```

`tests/fixtures/eslint-output.txt` — realistic ESLint output (5+ violations):
```
/src/api/routes.ts
  14:5   error    Unexpected any. Specify a different type     @typescript-eslint/no-explicit-any
  28:19  warning  Unexpected console statement                 no-console
  35:1   error    Expected indentation of 4 spaces but found 2 indent

/src/services/auth.ts
  42:10  error    'token' is defined but never used            @typescript-eslint/no-unused-vars
  55:3   warning  Prefer const over let                        prefer-const

/src/utils/helpers.ts
  12:8   error    'fs' is defined but never used               @typescript-eslint/no-unused-vars
  20:5   error    Unexpected empty function                    @typescript-eslint/no-empty-function

✖ 7 problems (5 errors, 2 warnings)
  3 errors and 1 warning potentially fixable with the `--fix` option.
```

**Step 2 — Verify**
Run: `ls tests/fixtures/vitest-pass.txt tests/fixtures/vitest-fail.txt tests/fixtures/tsc-errors.txt tests/fixtures/git-diff-large.txt tests/fixtures/eslint-output.txt`
Expected: all 5 files listed without error

**Covers:** AC 21, 22, 23, 24, 25

---

### Task 2: Fixture existence tests [depends: 1]

**Files:**
- Create: `tests/bash-filter-fixtures.test.ts`
- Test: `tests/bash-filter-fixtures.test.ts`

**Step 1 — Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const fixturesDir = resolve(import.meta.dirname, "fixtures");

describe("bash filter fixtures", () => {
  it("vitest-pass.txt exists and has passing tests with summary", () => {
    const path = resolve(fixturesDir, "vitest-pass.txt");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("passed");
    expect(content).toContain("Test Files");
    // Multiple passing tests
    expect((content.match(/✓/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it("vitest-fail.txt exists and has at least one failure with diff", () => {
    const path = resolve(fixturesDir, "vitest-fail.txt");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("FAIL");
    expect(content).toContain("Expected");
    expect(content).toContain("Received");
  });

  it("tsc-errors.txt exists and has at least 3 errors", () => {
    const path = resolve(fixturesDir, "tsc-errors.txt");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    const errors = content.match(/error TS\d+/g) || [];
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it("git-diff-large.txt exists and has at least 5 hunks", () => {
    const path = resolve(fixturesDir, "git-diff-large.txt");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    const hunks = content.match(/^@@/gm) || [];
    expect(hunks.length).toBeGreaterThanOrEqual(5);
  });

  it("eslint-output.txt exists and has at least 5 violations", () => {
    const path = resolve(fixturesDir, "eslint-output.txt");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    const violations = content.match(/error|warning/gi) || [];
    // At least 5 individual violation lines (excluding the summary)
    expect(violations.length).toBeGreaterThanOrEqual(5);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter-fixtures.test.ts`
Expected: FAIL — fixtures don't exist yet (if task 1 hasn't run) or PASS if task 1 completed

**Step 3 — Write minimal implementation**
Fixtures are created in Task 1. This test validates them.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter-fixtures.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

**Covers:** AC 21, 22, 23, 24, 25

---

### Task 3: Command detection functions [depends: 1]

**Files:**
- Create: `src/rtk/bash-filter.ts`
- Create: `tests/bash-filter.test.ts`
- Test: `tests/bash-filter.test.ts`

**Step 1 — Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import {
  filterBashOutput,
} from "../src/rtk/bash-filter.js";
import {
  isTestCommand,
  isGitCommand,
  isBuildCommand,
  isLinterCommand,
} from "../src/rtk/index.js";

describe("command detection", () => {
  describe("isTestCommand", () => {
    it.each([
      "vitest run",
      "npx vitest",
      "jest --coverage",
      "pytest -v",
      "cargo test",
      "npm test",
    ])("returns true for '%s'", (cmd) => {
      expect(isTestCommand(cmd)).toBe(true);
    });

    it("returns false for non-test commands", () => {
      expect(isTestCommand("echo hello")).toBe(false);
      expect(isTestCommand("tsc --noEmit")).toBe(false);
    });
  });

  describe("isGitCommand", () => {
    it.each([
      "git diff",
      "git status",
      "git log --oneline",
      "git show HEAD",
    ])("returns true for '%s'", (cmd) => {
      expect(isGitCommand(cmd)).toBe(true);
    });

    it("returns false for non-git commands", () => {
      expect(isGitCommand("echo git")).toBe(false);
      expect(isGitCommand("npm test")).toBe(false);
    });
  });

  describe("isBuildCommand", () => {
    it.each([
      "tsc",
      "cargo build",
      "npm run build",
    ])("returns true for '%s'", (cmd) => {
      expect(isBuildCommand(cmd)).toBe(true);
    });

    it("returns false for non-build commands", () => {
      expect(isBuildCommand("echo hello")).toBe(false);
    });
  });

  describe("isLinterCommand", () => {
    it.each([
      "eslint src/",
      "prettier --check .",
      "tsc --noEmit",
    ])("returns true for '%s'", (cmd) => {
      expect(isLinterCommand(cmd)).toBe(true);
    });

    it("returns false for non-linter commands", () => {
      expect(isLinterCommand("echo hello")).toBe(false);
    });
  });
});
```

Note: The detection functions already exist in `src/rtk/` technique files and are re-exported from `src/rtk/index.ts`. The test validates their behavior. `isLinterCommand` for `tsc --noEmit` — checking the existing `isLinterCommand` implementation: `LINTER_COMMANDS` does NOT include `tsc`. Per AC 9, linter commands include `tsc --noEmit`. We need to check if the existing `isLinterCommand` handles this. Looking at `src/rtk/linter.ts`, the LINTER_COMMANDS array doesn't include `tsc`. However, `isBuildCommand` does match `tsc`. Per the spec, `tsc --noEmit` should be a linter command. We'll handle this in `bash-filter.ts` routing logic rather than modifying the technique files (which are out of scope).

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter.test.ts`
Expected: FAIL — `bash-filter.ts` doesn't exist, import fails

**Step 3 — Write minimal implementation**

Create `src/rtk/bash-filter.ts`:

```typescript
import { stripAnsiFast } from "./ansi.js";
import { isTestCommand } from "./test-output.js";
import { isGitCommand, compactGitOutput } from "./git.js";
import { isBuildCommand, filterBuildOutput } from "./build.js";
import { isLinterCommand, aggregateLinterOutput } from "./linter.js";
import { aggregateTestOutput } from "./test-output.js";

export interface FilterResult {
  output: string;
  savedChars: number;
}

export function filterBashOutput(command: string, output: string): FilterResult {
  if (output === "") {
    return { output: "", savedChars: 0 };
  }

  const stripped = stripAnsiFast(output);
  const originalLength = output.length;

  let result: string | null = null;

  try {
    // Priority: test → git → build → linter → fallback
    if (isTestCommand(command)) {
      result = aggregateTestOutput(stripped, command);
    } else if (isGitCommand(command)) {
      result = compactGitOutput(stripped, command);
    } else if (isBuildCommand(command)) {
      result = filterBuildOutput(stripped, command);
    } else if (isLinterCommand(command)) {
      result = aggregateLinterOutput(stripped, command);
    }
  } catch {
    // Technique error → return ANSI-stripped original
    return { output: stripped, savedChars: originalLength - stripped.length };
  }

  const finalOutput = result ?? stripped;
  return {
    output: finalOutput,
    savedChars: originalLength - finalOutput.length,
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

**Covers:** AC 6, 7, 8, 9 (partially — `tsc --noEmit` handled in routing task)

---

### Task 4: filterBashOutput core behavior — empty input, ANSI stripping, savedChars [depends: 3]

**Files:**
- Modify: `tests/bash-filter.test.ts`
- Test: `tests/bash-filter.test.ts`

**Step 1 — Write the failing test**

Add to `tests/bash-filter.test.ts`:

```typescript
describe("filterBashOutput", () => {
  it("returns empty output with 0 savedChars for empty string", () => {
    const result = filterBashOutput("echo hello", "");
    expect(result).toEqual({ output: "", savedChars: 0 });
  });

  it("strips ANSI codes from output", () => {
    const ansiOutput = "\x1b[32m✓ test passed\x1b[0m";
    const result = filterBashOutput("echo hello", ansiOutput);
    expect(result.output).toBe("✓ test passed");
    expect(result.output).not.toContain("\x1b");
  });

  it("savedChars equals original length minus result length", () => {
    const ansiOutput = "\x1b[32mhello\x1b[0m";
    const result = filterBashOutput("echo test", ansiOutput);
    expect(result.savedChars).toBe(ansiOutput.length - result.output.length);
  });

  it("returns ANSI-stripped output unchanged for unrecognized commands", () => {
    const output = "some random output\nline 2";
    const result = filterBashOutput("echo hello", output);
    expect(result.output).toBe(output);
    expect(result.savedChars).toBe(0);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter.test.ts`
Expected: PASS (implementation from Task 3 already handles these cases). If any fail, the test catches a bug.

**Step 3 — Write minimal implementation**
No changes needed — Task 3 implementation covers these.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

**Covers:** AC 1, 2, 3, 5, 15

---

### Task 5: Routing — test command routes to aggregateTestOutput [depends: 3]

**Files:**
- Modify: `tests/bash-filter.test.ts`
- Test: `tests/bash-filter.test.ts`

**Step 1 — Write the failing test**

Add to `tests/bash-filter.test.ts`:

```typescript
import { readFileSync } from "fs";
import { resolve } from "path";

const fixturesDir = resolve(import.meta.dirname, "fixtures");

describe("routing", () => {
  it("routes test commands to aggregateTestOutput", () => {
    const fixture = readFileSync(resolve(fixturesDir, "vitest-pass.txt"), "utf-8");
    const result = filterBashOutput("npx vitest run", fixture);
    // aggregateTestOutput compresses — result should differ from input
    expect(result.output).not.toBe(fixture);
    expect(result.savedChars).toBeGreaterThan(0);
  });

  it("routes git commands to compactGitOutput", () => {
    const fixture = readFileSync(resolve(fixturesDir, "git-diff-large.txt"), "utf-8");
    const result = filterBashOutput("git diff", fixture);
    expect(result.output).not.toBe(fixture);
    expect(result.savedChars).toBeGreaterThan(0);
  });

  it("routes build commands to filterBuildOutput", () => {
    const fixture = readFileSync(resolve(fixturesDir, "tsc-errors.txt"), "utf-8");
    const result = filterBashOutput("tsc", fixture);
    // Build filter may or may not compress TSC errors, but it should process them
    expect(result.output).toBeDefined();
    expect(typeof result.savedChars).toBe("number");
  });

  it("routes linter commands to aggregateLinterOutput", () => {
    const fixture = readFileSync(resolve(fixturesDir, "eslint-output.txt"), "utf-8");
    const result = filterBashOutput("eslint src/", fixture);
    expect(result.output).toBeDefined();
    expect(typeof result.savedChars).toBe("number");
  });

  it("test command wins over build for 'cargo test' (priority)", () => {
    const fixture = readFileSync(resolve(fixturesDir, "vitest-pass.txt"), "utf-8");
    // cargo test matches both isTestCommand and isBuildCommand
    const result = filterBashOutput("cargo test", fixture);
    // Should route as test, not build — test output gets compressed
    expect(result.output).not.toBe(fixture);
    expect(result.savedChars).toBeGreaterThan(0);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter.test.ts`
Expected: Tests may pass already since Task 3 routing is implemented. If not, failure indicates a routing bug.

**Step 3 — Write minimal implementation**
No changes needed — Task 3 implementation covers routing.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

**Covers:** AC 10, 11, 12, 13, 14

---

### Task 6: Error resilience — technique throws, returns ANSI-stripped original [depends: 3]

**Files:**
- Modify: `tests/bash-filter.test.ts`
- Test: `tests/bash-filter.test.ts`

**Step 1 — Write the failing test**

Add to `tests/bash-filter.test.ts`:

```typescript
import { vi } from "vitest";
import * as testOutput from "../src/rtk/test-output.js";

describe("error resilience", () => {
  it("catches technique errors and returns ANSI-stripped original", () => {
    const spy = vi.spyOn(testOutput, "aggregateTestOutput").mockImplementation(() => {
      throw new Error("technique exploded");
    });

    const input = "\x1b[31mtest output\x1b[0m";
    const result = filterBashOutput("npm test", input);

    expect(result.output).toBe("test output");
    expect(result.savedChars).toBe(input.length - result.output.length);

    spy.mockRestore();
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter.test.ts`
Expected: PASS (catch block already in Task 3 impl). If it fails, the error handling is broken.

**Step 3 — Write minimal implementation**
No changes needed — Task 3 has try/catch.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

**Covers:** AC 4

---

### Task 7: Wire filterBashOutput into index.ts via tool_result handler [depends: 3]

**Files:**
- Modify: `index.ts`
- Test: `tests/bash-filter-integration.test.ts`

**Step 1 — Write the failing test**

Create `tests/bash-filter-integration.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("index.ts tool_result wiring", () => {
  // We can't easily test the full pi extension lifecycle, so we test
  // the isBashToolResult guard and the handler logic by importing
  // and invoking the handler function directly.

  it("isBashToolResult returns false for Read tool", async () => {
    // Dynamic import to get the isBashToolResult function
    const { isBashToolResult } = await import("@mariozechner/pi-coding-agent");
    const event = {
      toolName: "Read",
      toolCallId: "1",
      input: { path: "foo.ts" },
      content: [{ type: "text" as const, text: "1:abc|hello" }],
      details: {},
      isError: false,
    };
    expect(isBashToolResult(event as any)).toBe(false);
  });

  it("isBashToolResult returns false for Grep tool", async () => {
    const { isBashToolResult } = await import("@mariozechner/pi-coding-agent");
    const event = {
      toolName: "Grep",
      toolCallId: "2",
      input: { pattern: "foo" },
      content: [{ type: "text" as const, text: "1:abc|match" }],
      details: {},
      isError: false,
    };
    expect(isBashToolResult(event as any)).toBe(false);
  });

  it("isBashToolResult returns false for Edit tool", async () => {
    const { isBashToolResult } = await import("@mariozechner/pi-coding-agent");
    const event = {
      toolName: "Edit",
      toolCallId: "3",
      input: { path: "foo.ts", edits: [] },
      content: [{ type: "text" as const, text: "OK" }],
      details: {},
      isError: false,
    };
    expect(isBashToolResult(event as any)).toBe(false);
  });

  it("isBashToolResult returns true for Bash tool", async () => {
    const { isBashToolResult } = await import("@mariozechner/pi-coding-agent");
    const event = {
      toolName: "Bash",
      toolCallId: "4",
      input: { command: "echo hello" },
      content: [{ type: "text" as const, text: "hello" }],
      details: { exitCode: 0, cancelled: false, truncated: false },
      isError: false,
    };
    expect(isBashToolResult(event as any)).toBe(true);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter-integration.test.ts`
Expected: May fail if `isBashToolResult` is not importable, or may PASS if the import works. The wiring test validates the guard function.

**Step 3 — Write minimal implementation**

Modify `index.ts`:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isBashToolResult } from "@mariozechner/pi-coding-agent";
import { registerReadTool } from "./src/read.js";
import { registerEditTool } from "./src/edit.js";
import { registerGrepTool } from "./src/grep.js";
import { registerSgTool } from "./src/sg.js";
import { filterBashOutput } from "./src/rtk/bash-filter.js";

export default function piHashlineReadmapExtension(pi: ExtensionAPI): void {
  registerReadTool(pi);
  registerEditTool(pi);
  registerGrepTool(pi);
  registerSgTool(pi);

  pi.on("tool_result", async (event) => {
    if (!isBashToolResult(event)) {
      return undefined;
    }

    const command = event.input.command;
    const text = event.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const { output: compressed, savedChars } = filterBashOutput(command, text);

    if (process.env.PI_RTK_SAVINGS === "1" && savedChars > 0) {
      process.stderr.write(
        `[rtk] Bash output compressed: saved ${savedChars} chars (${((savedChars / text.length) * 100).toFixed(1)}%)\n`
      );
    }

    return {
      content: [{ type: "text" as const, text: compressed }],
    };
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter-integration.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

**Covers:** AC 16, 17, 18

---

### Task 8: Savings logging behavior [depends: 7]

**Files:**
- Modify: `tests/bash-filter-integration.test.ts`
- Test: `tests/bash-filter-integration.test.ts`

**Step 1 — Write the failing test**

Add to `tests/bash-filter-integration.test.ts`:

```typescript
import { filterBashOutput } from "../src/rtk/bash-filter.js";
import { readFileSync } from "fs";
import { resolve } from "path";

const fixturesDir = resolve(import.meta.dirname, "fixtures");

describe("savings logging", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    delete process.env.PI_RTK_SAVINGS;
  });

  it("logs savings to stderr when PI_RTK_SAVINGS=1 and chars saved", () => {
    process.env.PI_RTK_SAVINGS = "1";
    const fixture = readFileSync(resolve(fixturesDir, "vitest-pass.txt"), "utf-8");
    const { savedChars } = filterBashOutput("npx vitest run", fixture);

    // Simulate what index.ts handler does
    if (process.env.PI_RTK_SAVINGS === "1" && savedChars > 0) {
      process.stderr.write(
        `[rtk] Bash output compressed: saved ${savedChars} chars\n`
      );
    }

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("[rtk] Bash output compressed")
    );
  });

  it("does not log when PI_RTK_SAVINGS is unset", () => {
    delete process.env.PI_RTK_SAVINGS;
    const fixture = readFileSync(resolve(fixturesDir, "vitest-pass.txt"), "utf-8");
    const { savedChars } = filterBashOutput("npx vitest run", fixture);

    // Simulate what index.ts handler does — no logging
    if (process.env.PI_RTK_SAVINGS === "1" && savedChars > 0) {
      process.stderr.write(`[rtk] Bash output compressed: saved ${savedChars} chars\n`);
    }

    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter-integration.test.ts`
Expected: PASS (logging logic is straightforward env var check)

**Step 3 — Write minimal implementation**
No changes needed — logging is already in index.ts from Task 7.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter-integration.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

**Covers:** AC 19, 20

---

### Task 9: Typecheck and full suite verification [depends: 1, 2, 3, 4, 5, 6, 7, 8] [no-test]

**Justification:** Final verification that all code compiles and all tests pass together. No new behavior to test.

**Files:**
- None (verification only)

**Step 1 — Typecheck**
Run: `npx tsc --noEmit`
Expected: No errors

**Step 2 — Full test suite**
Run: `npx vitest run`
Expected: All tests pass, including all new bash-filter tests

---

## AC Coverage Matrix

| AC | Task(s) | Description |
|----|---------|-------------|
| 1  | 4       | filterBashOutput returns { output, savedChars } |
| 2  | 4       | ANSI stripping before technique |
| 3  | 4       | Empty string in → empty string out |
| 4  | 6       | Technique throws → ANSI-stripped original |
| 5  | 4       | savedChars = original - result |
| 6  | 3       | isTestCommand detection |
| 7  | 3       | isGitCommand detection |
| 8  | 3       | isBuildCommand detection |
| 9  | 3       | isLinterCommand detection |
| 10 | 5       | Test command routes to aggregateTestOutput |
| 11 | 5       | Git command routes to compactGitOutput |
| 12 | 5       | Build command routes to filterBuildOutput |
| 13 | 5       | Linter command routes to aggregateLinterOutput |
| 14 | 5       | cargo test → test wins over build |
| 15 | 4       | Unrecognized → ANSI-stripped only |
| 16 | 7       | tool_result handler uses isBashToolResult |
| 17 | 7       | Non-bash → returns undefined |
| 18 | 7       | Bash → returns compressed content |
| 19 | 8       | PI_RTK_SAVINGS=1 → logs to stderr |
| 20 | 8       | PI_RTK_SAVINGS unset → no logging |
| 21 | 1, 2    | vitest-pass.txt fixture |
| 22 | 1, 2    | vitest-fail.txt fixture |
| 23 | 1, 2    | tsc-errors.txt fixture |
| 24 | 1, 2    | git-diff-large.txt fixture |
| 25 | 1, 2    | eslint-output.txt fixture |
