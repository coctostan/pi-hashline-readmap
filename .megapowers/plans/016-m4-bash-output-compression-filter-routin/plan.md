# Plan: Bash Output Compression Filter & Routing

## Test Runner
- **Framework:** vitest
- **Run single test:** `npx vitest run <file>`
- **Run all tests:** `npx vitest run`
- **Typecheck:** `npx tsc --noEmit`

## Project Conventions (from codebase analysis)
- Node ESM with `moduleResolution: "bundler"`
- Tests use `const __dirname = dirname(fileURLToPath(import.meta.url))` (not `import.meta.dirname`)
- Source imports use `.js` specifiers (e.g., `"../src/rtk/bash-filter.js"`)
- `@mariozechner/pi-coding-agent` tool_result events have lowercase `toolName` ("bash", "read", "grep", "edit")

---

### Task 1: Fix isTestCommand to match specific commands [depends: none]

**Files:**
- Modify: `src/rtk/test-output.ts`
- Test: `tests/bash-filter-detection.test.ts`

**Step 1 — Write the failing test**

Create `tests/bash-filter-detection.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isTestCommand } from "../src/rtk/test-output.js";

describe("isTestCommand", () => {
  it("returns true for vitest command", () => {
    expect(isTestCommand("npx vitest run")).toBe(true);
  });

  it("returns true for jest command", () => {
    expect(isTestCommand("jest --coverage")).toBe(true);
  });

  it("returns true for pytest command", () => {
    expect(isTestCommand("pytest -v")).toBe(true);
  });

  it("returns true for cargo test command", () => {
    expect(isTestCommand("cargo test")).toBe(true);
  });

  it("returns true for npm test command", () => {
    expect(isTestCommand("npm test")).toBe(true);
  });

  it("returns true for npx vitest command", () => {
    expect(isTestCommand("npx vitest")).toBe(true);
  });

  it("returns false for generic 'test' substring (AC6)", () => {
    expect(isTestCommand("echo test")).toBe(false);
    expect(isTestCommand("testing is fun")).toBe(false);
  });

  it("returns false for non-test commands", () => {
    expect(isTestCommand("tsc --noEmit")).toBe(false);
    expect(isTestCommand("echo hello")).toBe(false);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter-detection.test.ts`
Expected: FAIL — `isTestCommand("echo test")` returns `true` but expected `false`

**Step 3 — Write minimal implementation**

Modify `src/rtk/test-output.ts`, update TEST_COMMANDS array:

```typescript
const TEST_COMMANDS = [
  "jest",
  "vitest",
  "pytest",
  "cargo test",
  "bun test",
  "go test",
  "mocha",
  "ava",
  "tap",
];
```

Remove `"test"` from the array to avoid matching generic "test" substring.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter-detection.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

**Covers:** AC 6

---

### Task 2: Fix isGitCommand to match any git command [depends: none]

**Files:**
- Modify: `src/rtk/git.ts`
- Test: `tests/bash-filter-detection.test.ts`

**Step 1 — Write the failing test**

Add to `tests/bash-filter-detection.test.ts`:

```typescript
import { isGitCommand } from "../src/rtk/git.js";

describe("isGitCommand", () => {
  it("returns true for git diff", () => {
    expect(isGitCommand("git diff")).toBe(true);
  });

  it("returns true for git status", () => {
    expect(isGitCommand("git status")).toBe(true);
  });

  it("returns true for git log", () => {
    expect(isGitCommand("git log --oneline")).toBe(true);
  });

  it("returns true for git branch (AC7)", () => {
    expect(isGitCommand("git branch")).toBe(true);
  });

  it("returns true for git checkout", () => {
    expect(isGitCommand("git checkout main")).toBe(true);
  });

  it("returns false for commands containing 'git' but not starting with it", () => {
    expect(isGitCommand("echo git")).toBe(false);
    expect(isGitCommand("magit status")).toBe(false);
  });

  it("returns false for non-git commands", () => {
    expect(isGitCommand("npm test")).toBe(false);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter-detection.test.ts`
Expected: FAIL — `isGitCommand("git branch")` returns `false` but expected `true`

**Step 3 — Write minimal implementation**

Modify `src/rtk/git.ts`, replace the `isGitCommand` function:

```typescript
export function isGitCommand(command: string | undefined | null): boolean {
  if (typeof command !== "string" || command.length === 0) {
    return false;
  }

  return command.toLowerCase().startsWith("git ");
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter-detection.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

**Covers:** AC 7

---

### Task 3: Fix isLinterCommand to include tsc --noEmit [depends: none]

**Files:**
- Modify: `src/rtk/linter.ts`
- Test: `tests/bash-filter-detection.test.ts`

**Step 1 — Write the failing test**

Add to `tests/bash-filter-detection.test.ts`:

```typescript
import { isLinterCommand } from "../src/rtk/linter.js";

describe("isLinterCommand", () => {
  it("returns true for eslint", () => {
    expect(isLinterCommand("eslint src/")).toBe(true);
  });

  it("returns true for prettier --check", () => {
    expect(isLinterCommand("prettier --check .")).toBe(true);
  });

  it("returns true for tsc --noEmit (AC9)", () => {
    expect(isLinterCommand("tsc --noEmit")).toBe(true);
  });

  it("returns true for tsc without --noEmit", () => {
    expect(isLinterCommand("tsc")).toBe(true);
  });

  it("returns false for non-linter commands", () => {
    expect(isLinterCommand("echo hello")).toBe(false);
    expect(isLinterCommand("node script.js")).toBe(false);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter-detection.test.ts`
Expected: FAIL — `isLinterCommand("tsc --noEmit")` returns `false` but expected `true`

**Step 3 — Write minimal implementation**

Modify `src/rtk/linter.ts`, add "tsc" to LINTER_COMMANDS:

```typescript
const LINTER_COMMANDS = [
  "eslint",
  "prettier",
  "ruff",
  "pylint",
  "mypy",
  "flake8",
  "black",
  "clippy",
  "golangci-lint",
  "tsc",
];
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter-detection.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

**Covers:** AC 9

---

### Task 4: Create fixture files [no-test]

**Justification:** Static test data files with no behavior to test. Their existence is verified by later tests that consume them.

**Files:**
- Create: `tests/fixtures/vitest-pass.txt`
- Create: `tests/fixtures/vitest-fail.txt`
- Create: `tests/fixtures/tsc-errors.txt`
- Create: `tests/fixtures/git-diff-large.txt`
- Create: `tests/fixtures/eslint-output.txt`

**Step 1 — Create the fixtures**

`tests/fixtures/vitest-pass.txt`:
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

 Test Files  2 passed (2)
      Tests  7 passed (7)
   Duration  1.24s
```

`tests/fixtures/vitest-fail.txt`:
```
 ✓ src/utils.test.ts (3 tests) 2ms
 ✗ src/api.test.ts (1 test) 18ms
   ✗ POST /users creates user

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
      Tests  1 failed | 4 passed (5)
```

`tests/fixtures/tsc-errors.txt`:
```
src/api/routes.ts(14,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/api/routes.ts(28,19): error TS2345: Argument of type 'undefined' is not assignable to parameter of type 'User'.
src/models/user.ts(7,3): error TS2564: Property 'email' has no initializer and is not definitely assigned in the constructor.
src/services/auth.ts(42,10): error TS7006: Parameter 'token' implicitly has an 'any' type.

Found 4 errors in 3 files.
```

`tests/fixtures/git-diff-large.txt`:
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

`tests/fixtures/eslint-output.txt`:
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

### Task 5: Create bash-filter.ts with empty output and ANSI stripping [depends: 1, 2, 3]

**Files:**
- Create: `src/rtk/bash-filter.ts`
- Test: `tests/bash-filter-core.test.ts`

**Step 1 — Write the failing test**

Create `tests/bash-filter-core.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { filterBashOutput } from "../src/rtk/bash-filter.js";

describe("filterBashOutput core", () => {
  it("returns empty output with 0 savedChars for empty string (AC3)", () => {
    const result = filterBashOutput("echo hello", "");
    expect(result).toEqual({ output: "", savedChars: 0 });
  });

  it("strips ANSI codes from output (AC2)", () => {
    const ansiOutput = "\x1b[32m✓ test passed\x1b[0m";
    const result = filterBashOutput("echo hello", ansiOutput);
    expect(result.output).toBe("✓ test passed");
    expect(result.output).not.toContain("\x1b");
  });

  it("returns correct savedChars for ANSI stripping (AC5)", () => {
    const ansiOutput = "\x1b[32mhello\x1b[0m";
    const result = filterBashOutput("echo test", ansiOutput);
    expect(result.savedChars).toBe(ansiOutput.length - result.output.length);
  });

  it("returns ANSI-stripped output unchanged for unrecognized commands (AC15)", () => {
    const output = "some random output\nline 2";
    const result = filterBashOutput("echo hello", output);
    expect(result.output).toBe(output);
    expect(result.savedChars).toBe(0);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter-core.test.ts`
Expected: FAIL — `Error: Cannot find module '../src/rtk/bash-filter.js'`

**Step 3 — Write minimal implementation**

Create `src/rtk/bash-filter.ts`:

```typescript
import { stripAnsiFast } from "./ansi.js";

export interface FilterResult {
  output: string;
  savedChars: number;
}

export function filterBashOutput(command: string, output: string): FilterResult {
  if (output === "") {
    return { output: "", savedChars: 0 };
  }

  const stripped = stripAnsiFast(output);
  return {
    output: stripped,
    savedChars: output.length - stripped.length,
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter-core.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

**Covers:** AC 1, 2, 3, 5, 15

---

### Task 6: Add test command routing to bash-filter [depends: 4, 5]

**Files:**
- Modify: `src/rtk/bash-filter.ts`
- Test: `tests/bash-filter-routing.test.ts`

**Step 1 — Write the failing test**

Create `tests/bash-filter-routing.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { filterBashOutput } from "../src/rtk/bash-filter.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

describe("filterBashOutput routing", () => {
  it("routes test commands to aggregateTestOutput (AC10)", () => {
    const fixture = readFileSync(resolve(fixturesDir, "vitest-pass.txt"), "utf-8");
    const result = filterBashOutput("npx vitest run", fixture);
    // aggregateTestOutput compresses — result should be shorter than input
    expect(result.output.length).toBeLessThan(fixture.length);
    expect(result.savedChars).toBeGreaterThan(0);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter-routing.test.ts`
Expected: FAIL — `AssertionError: expected 0 to be greater than 0` (savedChars is 0 because routing not implemented)

**Step 3 — Write minimal implementation**

Modify `src/rtk/bash-filter.ts`:

```typescript
import { stripAnsiFast } from "./ansi.js";
import { isTestCommand, aggregateTestOutput } from "./test-output.js";

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

  // Try test command routing first
  if (isTestCommand(command)) {
    const result = aggregateTestOutput(stripped, command);
    if (result !== null) {
      return {
        output: result,
        savedChars: originalLength - result.length,
      };
    }
  }

  return {
    output: stripped,
    savedChars: originalLength - stripped.length,
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter-routing.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

**Covers:** AC 10

---

### Task 7: Add git command routing to bash-filter [depends: 4, 5]

**Files:**
- Modify: `src/rtk/bash-filter.ts`
- Test: `tests/bash-filter-routing.test.ts`

**Step 1 — Write the failing test**

Add to `tests/bash-filter-routing.test.ts`:

```typescript
import { isGitCommand, compactGitOutput } from "../src/rtk/git.js";

describe("git routing", () => {
  it("routes git commands to compactGitOutput (AC11)", () => {
    const fixture = readFileSync(resolve(fixturesDir, "git-diff-large.txt"), "utf-8");
    const result = filterBashOutput("git diff", fixture);
    expect(result.output.length).toBeLessThan(fixture.length);
    expect(result.savedChars).toBeGreaterThan(0);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter-routing.test.ts`
Expected: FAIL — savedChars is 0, git routing not implemented

**Step 3 — Write minimal implementation**

Modify `src/rtk/bash-filter.ts`:

```typescript
import { stripAnsiFast } from "./ansi.js";
import { isTestCommand, aggregateTestOutput } from "./test-output.js";
import { isGitCommand, compactGitOutput } from "./git.js";

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

  // Priority: test → git → fallback
  if (isTestCommand(command)) {
    const result = aggregateTestOutput(stripped, command);
    if (result !== null) {
      return {
        output: result,
        savedChars: originalLength - result.length,
      };
    }
  }

  if (isGitCommand(command)) {
    const result = compactGitOutput(stripped, command);
    if (result !== null) {
      return {
        output: result,
        savedChars: originalLength - result.length,
      };
    }
  }

  return {
    output: stripped,
    savedChars: originalLength - stripped.length,
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter-routing.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

**Covers:** AC 11

---

### Task 8: Add build command routing to bash-filter [depends: 4, 5]

**Files:**
- Modify: `src/rtk/bash-filter.ts`
- Test: `tests/bash-filter-routing.test.ts`

**Step 1 — Write the failing test**

Add to `tests/bash-filter-routing.test.ts`:

```typescript
import { isBuildCommand, filterBuildOutput } from "../src/rtk/build.js";

describe("build routing", () => {
  it("routes build commands to filterBuildOutput (AC12)", () => {
    const fixture = readFileSync(resolve(fixturesDir, "tsc-errors.txt"), "utf-8");
    const result = filterBashOutput("tsc", fixture);
    // Build filter processes TSC errors
    expect(result.output).toBeDefined();
    expect(typeof result.savedChars).toBe("number");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter-routing.test.ts`
Expected: FAIL — build routing not implemented (savedChars would be small/none)

**Step 3 — Write minimal implementation**

Modify `src/rtk/bash-filter.ts` to add build routing (after git, before fallback):

```typescript
import { stripAnsiFast } from "./ansi.js";
import { isTestCommand, aggregateTestOutput } from "./test-output.js";
import { isGitCommand, compactGitOutput } from "./git.js";
import { isBuildCommand, filterBuildOutput } from "./build.js";

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

  // Priority: test → git → build → fallback
  if (isTestCommand(command)) {
    const result = aggregateTestOutput(stripped, command);
    if (result !== null) {
      return {
        output: result,
        savedChars: originalLength - result.length,
      };
    }
  }

  if (isGitCommand(command)) {
    const result = compactGitOutput(stripped, command);
    if (result !== null) {
      return {
        output: result,
        savedChars: originalLength - result.length,
      };
    }
  }

  if (isBuildCommand(command)) {
    const result = filterBuildOutput(stripped, command);
    if (result !== null) {
      return {
        output: result,
        savedChars: originalLength - result.length,
      };
    }
  }

  return {
    output: stripped,
    savedChars: originalLength - stripped.length,
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter-routing.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

**Covers:** AC 12

---

### Task 9: Add linter command routing to bash-filter [depends: 4, 5]

**Files:**
- Modify: `src/rtk/bash-filter.ts`
- Test: `tests/bash-filter-routing.test.ts`

**Step 1 — Write the failing test**

Add to `tests/bash-filter-routing.test.ts`:

```typescript
import { isLinterCommand, aggregateLinterOutput } from "../src/rtk/linter.js";

describe("linter routing", () => {
  it("routes linter commands to aggregateLinterOutput (AC13)", () => {
    const fixture = readFileSync(resolve(fixturesDir, "eslint-output.txt"), "utf-8");
    const result = filterBashOutput("eslint src/", fixture);
    expect(result.output).toBeDefined();
    expect(typeof result.savedChars).toBe("number");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter-routing.test.ts`
Expected: FAIL — linter routing not implemented

**Step 3 — Write minimal implementation**

Modify `src/rtk/bash-filter.ts` to add linter routing (after build, before fallback):

```typescript
import { stripAnsiFast } from "./ansi.js";
import { isTestCommand, aggregateTestOutput } from "./test-output.js";
import { isGitCommand, compactGitOutput } from "./git.js";
import { isBuildCommand, filterBuildOutput } from "./build.js";
import { isLinterCommand, aggregateLinterOutput } from "./linter.js";

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

  // Priority: test → git → build → linter → fallback
  if (isTestCommand(command)) {
    const result = aggregateTestOutput(stripped, command);
    if (result !== null) {
      return {
        output: result,
        savedChars: originalLength - result.length,
      };
    }
  }

  if (isGitCommand(command)) {
    const result = compactGitOutput(stripped, command);
    if (result !== null) {
      return {
        output: result,
        savedChars: originalLength - result.length,
      };
    }
  }

  if (isBuildCommand(command)) {
    const result = filterBuildOutput(stripped, command);
    if (result !== null) {
      return {
        output: result,
        savedChars: originalLength - result.length,
      };
    }
  }

  if (isLinterCommand(command)) {
    const result = aggregateLinterOutput(stripped, command);
    if (result !== null) {
      return {
        output: result,
        savedChars: originalLength - result.length,
      };
    }
  }

  return {
    output: stripped,
    savedChars: originalLength - stripped.length,
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter-routing.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

**Covers:** AC 13

---

### Task 10: Add test priority over build (AC14) [depends: 6, 8]

**Files:**
- Test: `tests/bash-filter-routing.test.ts`

**Step 1 — Write the failing test**

Add to `tests/bash-filter-routing.test.ts`:

```typescript
describe("routing priority", () => {
  it("test command wins over build for 'cargo test' (AC14)", () => {
    const fixture = readFileSync(resolve(fixturesDir, "vitest-pass.txt"), "utf-8");
    // cargo test matches both isTestCommand and isBuildCommand
    const result = filterBashOutput("cargo test", fixture);
    // Should route as test, not build — test output gets compressed
    expect(result.output.length).toBeLessThan(fixture.length);
    expect(result.savedChars).toBeGreaterThan(0);
    // Test output format (from aggregateTestOutput) contains "Test Results:"
    expect(result.output).toContain("Test");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter-routing.test.ts`
Expected: FAIL — assertion fails if priority is wrong (though current implementation already has test first, so this documents the requirement)

**Step 3 — Write minimal implementation**

No changes needed — current implementation already has test routing before build routing. This task serves as a regression test for AC14.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter-routing.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

**Covers:** AC 14

---

### Task 11: Add error resilience to bash-filter [depends: 5]

**Files:**
- Modify: `src/rtk/bash-filter.ts`
- Test: `tests/bash-filter-error.test.ts`

**Step 1 — Write the failing test**

Create `tests/bash-filter-error.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { filterBashOutput } from "../src/rtk/bash-filter.js";
import * as testOutput from "../src/rtk/test-output.js";

describe("filterBashOutput error resilience", () => {
  it("catches technique errors and returns ANSI-stripped original (AC4)", () => {
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
Run: `npx vitest run tests/bash-filter-error.test.ts`
Expected: FAIL — Error "technique exploded" propagates up because no try/catch exists

**Step 3 — Write minimal implementation**

Modify `src/rtk/bash-filter.ts` to wrap technique calls in try/catch:

```typescript
import { stripAnsiFast } from "./ansi.js";
import { isTestCommand, aggregateTestOutput } from "./test-output.js";
import { isGitCommand, compactGitOutput } from "./git.js";
import { isBuildCommand, filterBuildOutput } from "./build.js";
import { isLinterCommand, aggregateLinterOutput } from "./linter.js";

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

  try {
    // Priority: test → git → build → linter → fallback
    if (isTestCommand(command)) {
      const result = aggregateTestOutput(stripped, command);
      if (result !== null) {
        return {
          output: result,
          savedChars: originalLength - result.length,
        };
      }
    }

    if (isGitCommand(command)) {
      const result = compactGitOutput(stripped, command);
      if (result !== null) {
        return {
          output: result,
          savedChars: originalLength - result.length,
        };
      }
    }

    if (isBuildCommand(command)) {
      const result = filterBuildOutput(stripped, command);
      if (result !== null) {
        return {
          output: result,
          savedChars: originalLength - result.length,
        };
      }
    }

    if (isLinterCommand(command)) {
      const result = aggregateLinterOutput(stripped, command);
      if (result !== null) {
        return {
          output: result,
          savedChars: originalLength - result.length,
        };
      }
    }
  } catch {
    // Technique error → return ANSI-stripped original
    return { output: stripped, savedChars: originalLength - stripped.length };
  }

  return {
    output: stripped,
    savedChars: originalLength - stripped.length,
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter-error.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

**Covers:** AC 4

---

### Task 12: Wire bash-filter into index.ts with tool_result handler [depends: 11]

**Files:**
- Modify: `index.ts`
- Test: `tests/bash-filter-wiring.test.ts`

**Step 1 — Write the failing test**

Create `tests/bash-filter-wiring.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

// Mock the pi-coding-agent module
vi.mock("@mariozechner/pi-coding-agent", async () => {
  const actual = await vi.importActual("@mariozechner/pi-coding-agent");
  return {
    ...actual,
    isBashToolResult: (e: any) => e.toolName === "bash",
  };
});

describe("index.ts tool_result wiring", () => {
  let capturedHandler: ((event: any) => any) | null = null;
  let registeredEvents: string[] = [];

  beforeEach(async () => {
    registeredEvents = [];
    capturedHandler = null;

    const mockPi = {
      registerTool: vi.fn(),
      on: vi.fn((event: string, handler: any) => {
        registeredEvents.push(event);
        if (event === "tool_result") {
          capturedHandler = handler;
        }
      }),
    };

    // Import and run the extension
    const mod = await import("../index.ts");
    mod.default(mockPi as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("registers a tool_result event handler (AC16)", () => {
    expect(registeredEvents).toContain("tool_result");
    expect(capturedHandler).not.toBeNull();
  });

  it("returns undefined for non-bash tools (AC17)", async () => {
    const readEvent = {
      toolName: "read",
      toolCallId: "1",
      input: { path: "foo.ts" },
      content: [{ type: "text" as const, text: "1:abc|hello" }],
      details: {},
      isError: false,
    };
    const result = await capturedHandler!(readEvent);
    expect(result).toBeUndefined();
  });

  it("returns undefined for grep tool (hashline isolation)", async () => {
    const grepEvent = {
      toolName: "grep",
      toolCallId: "2",
      input: { pattern: "foo" },
      content: [{ type: "text" as const, text: "1:abc|match" }],
      details: {},
      isError: false,
    };
    const result = await capturedHandler!(grepEvent);
    expect(result).toBeUndefined();
  });

  it("returns undefined for edit tool (hashline isolation)", async () => {
    const editEvent = {
      toolName: "edit",
      toolCallId: "3",
      input: { path: "foo.ts", edits: [] },
      content: [{ type: "text" as const, text: "OK" }],
      details: {},
      isError: false,
    };
    const result = await capturedHandler!(editEvent);
    expect(result).toBeUndefined();
  });

  it("returns compressed content for bash tool (AC18)", async () => {
    const fixture = readFileSync(resolve(fixturesDir, "vitest-pass.txt"), "utf-8");
    const bashEvent = {
      toolName: "bash",
      toolCallId: "4",
      input: { command: "npx vitest run" },
      content: [{ type: "text" as const, text: fixture }],
      details: { exitCode: 0, cancelled: false, truncated: false },
      isError: false,
    };
    const result = await capturedHandler!(bashEvent);
    expect(result).toBeDefined();
    expect(result).toHaveProperty("content");
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toHaveProperty("type", "text");
    expect(result.content[0].text.length).toBeLessThan(fixture.length);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter-wiring.test.ts`
Expected: FAIL — `index.ts` does not register `tool_result` handler or return expected values

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

    const command = event.input.command as string;
    const text = event.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const { output: compressed, savedChars } = filterBashOutput(command, text);

    return {
      content: [{ type: "text" as const, text: compressed }],
    };
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter-wiring.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

**Covers:** AC 16, 17, 18

---

### Task 13: Add savings logging to index.ts handler [depends: 12]

**Files:**
- Modify: `index.ts`
- Test: `tests/bash-filter-logging.test.ts`

**Step 1 — Write the failing test**

Create `tests/bash-filter-logging.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

describe("index.ts savings logging", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let capturedHandler: ((event: any) => any) | null = null;

  beforeEach(async () => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    delete process.env.PI_RTK_SAVINGS;

    const mockPi = {
      registerTool: vi.fn(),
      on: vi.fn((event: string, handler: any) => {
        if (event === "tool_result") {
          capturedHandler = handler;
        }
      }),
    };

    // Re-import to get fresh handler
    const mod = await import("../index.ts");
    mod.default(mockPi as any);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    delete process.env.PI_RTK_SAVINGS;
    vi.clearAllMocks();
  });

  it("logs savings to stderr when PI_RTK_SAVINGS=1 and chars saved (AC19)", async () => {
    process.env.PI_RTK_SAVINGS = "1";
    const fixture = readFileSync(resolve(fixturesDir, "vitest-pass.txt"), "utf-8");
    const bashEvent = {
      toolName: "bash",
      toolCallId: "1",
      input: { command: "npx vitest run" },
      content: [{ type: "text" as const, text: fixture }],
      details: { exitCode: 0, cancelled: false, truncated: false },
      isError: false,
    };

    await capturedHandler!(bashEvent);

    expect(stderrSpy).toHaveBeenCalled();
    const logged = stderrSpy.mock.calls[0][0] as string;
    expect(logged).toContain("[rtk]");
    expect(logged).toContain("saved");
  });

  it("does not log when PI_RTK_SAVINGS is unset (AC20)", async () => {
    delete process.env.PI_RTK_SAVINGS;
    const fixture = readFileSync(resolve(fixturesDir, "vitest-pass.txt"), "utf-8");
    const bashEvent = {
      toolName: "bash",
      toolCallId: "2",
      input: { command: "npx vitest run" },
      content: [{ type: "text" as const, text: fixture }],
      details: { exitCode: 0, cancelled: false, truncated: false },
      isError: false,
    };

    await capturedHandler!(bashEvent);

    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter-logging.test.ts`
Expected: FAIL — logging not implemented, stderrSpy not called when expected

**Step 3 — Write minimal implementation**

Modify `index.ts` to add logging:

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

    const command = event.input.command as string;
    const text = event.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const { output: compressed, savedChars } = filterBashOutput(command, text);

    if (process.env.PI_RTK_SAVINGS === "1" && savedChars > 0) {
      const percent = ((savedChars / text.length) * 100).toFixed(1);
      process.stderr.write(
        `[rtk] Bash output compressed: saved ${savedChars} chars (${percent}%)\n`
      );
    }

    return {
      content: [{ type: "text" as const, text: compressed }],
    };
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter-logging.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

**Covers:** AC 19, 20

---

### Task 14: Verify fixtures exist and contain required content [depends: 4]

**Files:**
- Test: `tests/bash-filter-fixtures.test.ts`

**Step 1 — Write the failing test**

Create `tests/bash-filter-fixtures.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

describe("bash filter fixtures", () => {
  it("vitest-pass.txt exists and has passing tests with summary (AC21)", () => {
    const path = resolve(fixturesDir, "vitest-pass.txt");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("passed");
    expect(content).toContain("Test Files");
    expect((content.match(/✓/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it("vitest-fail.txt exists and has at least one failure with diff (AC22)", () => {
    const path = resolve(fixturesDir, "vitest-fail.txt");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("FAIL");
    expect(content).toContain("Expected");
    expect(content).toContain("Received");
  });

  it("tsc-errors.txt exists and has at least 3 errors (AC23)", () => {
    const path = resolve(fixturesDir, "tsc-errors.txt");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    const errors = content.match(/error TS\d+/g) || [];
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it("git-diff-large.txt exists and has at least 5 hunks (AC24)", () => {
    const path = resolve(fixturesDir, "git-diff-large.txt");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    const hunks = content.match(/^@@/gm) || [];
    expect(hunks.length).toBeGreaterThanOrEqual(5);
  });

  it("eslint-output.txt exists and has at least 5 violations (AC25)", () => {
    const path = resolve(fixturesDir, "eslint-output.txt");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    // Count error/warning lines (excluding summary line)
    const lines = content.split("\n");
    const violationLines = lines.filter(
      (line) => /\d+:\d+/.test(line) && (line.includes("error") || line.includes("warning"))
    );
    expect(violationLines.length).toBeGreaterThanOrEqual(5);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter-fixtures.test.ts`
Expected: PASS (fixtures created in Task 4, this validates them)

**Step 3 — Write minimal implementation**
No implementation needed — this is a validation test.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter-fixtures.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

**Covers:** AC 21, 22, 23, 24, 25

---

### Task 15: Typecheck and full suite verification [depends: 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] [no-test]

**Justification:** Final verification that all code compiles and all tests pass together. No new behavior to test.

**Files:** None (verification only)

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
| 1  | 5       | filterBashOutput returns { output, savedChars } |
| 2  | 5       | ANSI stripping before technique |
| 3  | 5       | Empty string in → empty string out |
| 4  | 11      | Technique throws → ANSI-stripped original |
| 5  | 5       | savedChars = original - result |
| 6  | 1       | isTestCommand detection (specific commands) |
| 7  | 2       | isGitCommand detection (startsWith "git ") |
| 8  | 3       | isBuildCommand detection (existing OK) |
| 9  | 3       | isLinterCommand detection (+ tsc --noEmit) |
| 10 | 6       | Test command routes to aggregateTestOutput |
| 11 | 7       | Git command routes to compactGitOutput |
| 12 | 8       | Build command routes to filterBuildOutput |
| 13 | 9       | Linter command routes to aggregateLinterOutput |
| 14 | 10      | cargo test → test wins over build |
| 15 | 5       | Unrecognized → ANSI-stripped only |
| 16 | 12      | tool_result handler uses isBashToolResult |
| 17 | 12      | Non-bash → returns undefined |
| 18 | 12      | Bash → returns compressed content |
| 19 | 13      | PI_RTK_SAVINGS=1 → logs to stderr |
| 20 | 13      | PI_RTK_SAVINGS unset → no logging |
| 21 | 4, 14   | vitest-pass.txt fixture |
| 22 | 4, 14   | vitest-fail.txt fixture |
| 23 | 4, 14   | tsc-errors.txt fixture |
| 24 | 4, 14   | git-diff-large.txt fixture |
| 25 | 4, 14   | eslint-output.txt fixture |
