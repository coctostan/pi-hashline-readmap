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

**Step 1 — Write the failing test**

Create `tests/bash-filter-fixtures.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fix = (name: string) => readFileSync(resolve(__dirname, "fixtures", name), "utf8");

describe("bash filter fixtures", () => {
  it("vitest-pass.txt contains passing tests and summary", () => {
    const content = fix("vitest-pass.txt");
    expect(content).toContain("passed");
    expect(content).toMatch(/Test Files\s+\d+ passed/);
    const passMatches = content.match(/✓/g);
    expect(passMatches!.length).toBeGreaterThanOrEqual(3);
  });

  it("vitest-fail.txt contains at least one failure with diff", () => {
    const content = fix("vitest-fail.txt");
    expect(content).toContain("FAIL");
    expect(content).toMatch(/Expected|Received/);
    expect(content).toMatch(/failed/);
  });

  it("tsc-errors.txt contains at least 3 TypeScript errors", () => {
    const content = fix("tsc-errors.txt");
    const errorMatches = content.match(/error TS\d+/g);
    expect(errorMatches!.length).toBeGreaterThanOrEqual(3);
  });

  it("git-diff-large.txt contains at least 5 hunks", () => {
    const content = fix("git-diff-large.txt");
    const hunkMatches = content.match(/^@@/gm);
    expect(hunkMatches!.length).toBeGreaterThanOrEqual(5);
  });

  it("eslint-output.txt contains at least 5 violations", () => {
    const content = fix("eslint-output.txt");
    const issueMatches = content.match(/^\s+\d+:\d+\s+(error|warning)/gm);
    expect(issueMatches!.length).toBeGreaterThanOrEqual(5);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter-fixtures.test.ts`  
Expected: FAIL — `ENOENT: no such file or directory, open '.../tests/fixtures/vitest-pass.txt'`

**Step 3 — Write minimal implementation**

Create the five fixture files.

Create `tests/fixtures/vitest-pass.txt`:

```
 ✓ src/utils.test.ts (3 tests) 12ms
   ✓ parseConfig returns defaults
   ✓ parseConfig merges overrides
   ✓ parseConfig throws on invalid input
 ✓ src/router.test.ts (5 tests) 45ms
   ✓ matches exact routes
   ✓ matches parameterized routes
   ✓ returns 404 for unknown paths
   ✓ handles query strings
   ✓ decodes URL components
 ✓ src/middleware.test.ts (4 tests) 23ms
   ✓ auth middleware rejects missing token
   ✓ auth middleware accepts valid token
   ✓ logging middleware records request
   ✓ cors middleware sets headers

 Test Files  3 passed (3)
      Tests  12 passed (12)
   Start at  14:32:01
   Duration  245ms
```

Create `tests/fixtures/vitest-fail.txt`:

```
 ✓ src/utils.test.ts (3 tests) 12ms
 ✗ src/router.test.ts (5 tests) 67ms
   ✓ matches exact routes
   ✓ matches parameterized routes
   ✗ returns 404 for unknown paths
   ✓ handles query strings
   ✓ decodes URL components

⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯

 FAIL  src/router.test.ts > returns 404 for unknown paths

AssertionError: expected 200 to be 404

  ❯ src/router.test.ts:34:18
     32|   const res = router.handle("/nonexistent");
     33|   expect(res.status).toBe(404);
     34|   expect(res.body).toEqual({ error: "Not Found" });
       |                  ^
     35| });

  - Expected: 404
  + Received: 200

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 Test Files  1 failed | 2 passed (3)
      Tests  1 failed | 11 passed (12)
   Start at  14:33:01
   Duration  312ms
```

Create `tests/fixtures/tsc-errors.txt`:

```
src/router.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/router.ts(45,18): error TS2345: Argument of type 'undefined' is not assignable to parameter of type 'Request'.
src/utils.ts(8,1): error TS7006: Parameter 'x' implicitly has an 'any' type.
src/middleware.ts(23,10): error TS2339: Property 'headers' does not exist on type 'BasicResponse'.
src/index.ts(5,27): error TS2307: Cannot find module './missing' or its corresponding type declarations.

Found 5 errors in 4 files.

Errors  Files
     2  src/router.ts:12
     1  src/utils.ts:8
     1  src/middleware.ts:23
     1  src/index.ts:5
```

Create `tests/fixtures/git-diff-large.txt`:

```
diff --git a/src/router.ts b/src/router.ts
index abc1234..def5678 100644
--- a/src/router.ts
+++ b/src/router.ts
@@ -10,6 +10,8 @@ export class Router {
   private routes: Map<string, Handler>;
+  private middleware: Middleware[];
+  private errorHandler: ErrorHandler;
 
   constructor() {
     this.routes = new Map();
@@ -25,7 +27,12 @@ export class Router {
   handle(path: string): Response {
-    const handler = this.routes.get(path);
+    const handler = this.findHandler(path);
+    if (!handler) {
+      return { status: 404, body: { error: "Not Found" } };
+    }
+    return this.runMiddleware(handler, path);
   }
 
diff --git a/src/utils.ts b/src/utils.ts
index 111aaaa..222bbbb 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,4 +1,5 @@
+import { Config } from "./types";
 
 export function parseConfig(raw: string): Config {
-  return JSON.parse(raw);
+  return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
 }

diff --git a/src/middleware.ts b/src/middleware.ts
index 333cccc..444dddd 100644
--- a/src/middleware.ts
+++ b/src/middleware.ts
@@ -5,3 +5,15 @@ export function authMiddleware(token: string) {
     if (!token) throw new Error("Unauthorized");
+    const decoded = verifyToken(token);
+    req.user = decoded;
   };
 }
+
+export function loggingMiddleware() {
+  return (req: Request, next: () => Response) => {
+    console.log(`${req.method} ${req.path}`);
+    const res = next();
+    console.log(`  -> ${res.status}`);
+    return res;
+  };
+}

diff --git a/src/types.ts b/src/types.ts
index 555eeee..666ffff 100644
--- a/src/types.ts
+++ b/src/types.ts
@@ -8,3 +8,9 @@ export interface Config {
   port: number;
+  host: string;
+  debug: boolean;
 }
+
+export interface Middleware {
+  (req: Request, next: () => Response): Response;
+}

diff --git a/src/index.ts b/src/index.ts
index 777gggg..888hhhh 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,8 +1,12 @@
 import { Router } from "./router";
+import { authMiddleware, loggingMiddleware } from "./middleware";
 
 const router = new Router();
+router.use(loggingMiddleware());
+router.use(authMiddleware(process.env.TOKEN!));
 
 router.add("/health", () => ({ status: 200, body: "ok" }));
+router.add("/api/users", handleUsers);
 
 router.listen(3000);
+router.listen(parseInt(process.env.PORT || "3000"));
```

Create `tests/fixtures/eslint-output.txt`:

```
/home/user/project/src/router.ts
   12:5   error    Unexpected any. Specify a different type               @typescript-eslint/no-explicit-any
   23:10  warning  'tempVar' is assigned a value but never used           @typescript-eslint/no-unused-vars
   45:1   error    Missing return type on function                        @typescript-eslint/explicit-function-return-type

/home/user/project/src/utils.ts
    8:1   error    Unexpected console statement                           no-console
   15:22  warning  'err' is defined but never used                        @typescript-eslint/no-unused-vars

/home/user/project/src/middleware.ts
    3:1   error    'fs' is defined but never used                         @typescript-eslint/no-unused-vars
   18:5   error    Do not use 'any' as a type                             @typescript-eslint/no-explicit-any
   30:12  warning  Unexpected empty function                              @typescript-eslint/no-empty-function

✖ 8 problems (5 errors, 3 warnings)
  2 errors and 1 warning potentially fixable with the `--fix` option.
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter-fixtures.test.ts`  
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`  
Expected: all passing

---

### Task 2: filterBashOutput — empty input and ANSI stripping

**Files:**
- Create: `src/rtk/bash-filter.ts`
- Create: `tests/bash-filter.test.ts`
- Test: `tests/bash-filter.test.ts`

**Covers AC:** 1, 2, 3, 5, 15

**Step 1 — Write the failing test**

Create `tests/bash-filter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { filterBashOutput } from "../src/rtk/bash-filter.js";

describe("filterBashOutput", () => {
  it("returns { output, savedChars } shape", () => {
    const result = filterBashOutput("echo hello", "some output");
    expect(result).toHaveProperty("output");
    expect(result).toHaveProperty("savedChars");
    expect(typeof result.output).toBe("string");
    expect(typeof result.savedChars).toBe("number");
  });

  it("returns empty output for empty input", () => {
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
    const result = filterBashOutput("echo hi", ansiOutput);
    expect(result.savedChars).toBe(ansiOutput.length - result.output.length);
  });

  it("returns ANSI-stripped output unchanged for unrecognized commands", () => {
    const input = "\x1b[32mhello world\x1b[0m";
    const result = filterBashOutput("echo hello", input);
    expect(result.output).toBe("hello world");
    expect(result.savedChars).toBe(input.length - "hello world".length);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter.test.ts`  
Expected: FAIL — `Cannot find module '../src/rtk/bash-filter.js'`

**Step 3 — Write minimal implementation**

Create `src/rtk/bash-filter.ts`:

```typescript
import { stripAnsi } from "./ansi.js";

export interface FilterResult {
  output: string;
  savedChars: number;
}

export function filterBashOutput(command: string, output: string): FilterResult {
  if (output === "") {
    return { output: "", savedChars: 0 };
  }

  const stripped = stripAnsi(output);
  return {
    output: stripped,
    savedChars: output.length - stripped.length,
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter.test.ts`  
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`  
Expected: all passing

---

### Task 3: filterBashOutput — command detection and test command routing **[depends: 2]**
**Files:**
- Modify: `src/rtk/bash-filter.ts`
- Modify: `tests/bash-filter.test.ts`
- Test: `tests/bash-filter.test.ts`
**Covers AC:** 6, 7, 8, 9, 10

**Step 1 — Write the failing test**

Add to `tests/bash-filter.test.ts`:

```typescript
import { vi } from "vitest";
import { isTestCommand, isGitCommand, isBuildCommand, isLinterCommand } from "../src/rtk/bash-filter.js";
import * as testOutput from "../src/rtk/test-output.js";
describe("command detection", () => {
  it.each([
    ["vitest", true],
    ["jest", true],
    ["pytest", true],
    ["cargo test", true],
    ["npm test", true],
    ["npx vitest", true],
    ["echo hello", false],
  ])("isTestCommand(%j) === %j", (cmd, expected) => {
    expect(isTestCommand(cmd)).toBe(expected);
  });

  it.each([
    ["git diff", true],
    ["git commit -m 'fix'", true],
    ["git status", true],
    ["echo git", false],
  ])("isGitCommand(%j) === %j", (cmd, expected) => {
    expect(isGitCommand(cmd)).toBe(expected);
  });

  it.each([
    ["tsc", true],
    ["cargo build", true],
    ["npm run build", true],
    ["echo hello", false],
  ])("isBuildCommand(%j) === %j", (cmd, expected) => {
    expect(isBuildCommand(cmd)).toBe(expected);
  });

  it.each([
    ["eslint .", true],
    ["prettier --check .", true],
    ["tsc --noEmit", true],
    ["echo hello", false],
  ])("isLinterCommand(%j) === %j", (cmd, expected) => {
    expect(isLinterCommand(cmd)).toBe(expected);
  });
});
describe("filterBashOutput routing", () => {
  it("routes test commands to aggregateTestOutput", () => {
    const spy = vi.spyOn(testOutput, "aggregateTestOutput").mockReturnValue("compressed test output");
    const result = filterBashOutput("npm test", "raw test output");
    expect(spy).toHaveBeenCalledWith("raw test output", "npm test");
    expect(result.output).toBe("compressed test output");
    spy.mockRestore();
  });

  it("falls back to stripped output when technique returns null", () => {
    const spy = vi.spyOn(testOutput, "aggregateTestOutput").mockReturnValue(null);
    const result = filterBashOutput("npm test", "\x1b[32mraw test\x1b[0m");
    expect(result.output).toBe("raw test");
    spy.mockRestore();
  });
});
```
**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter.test.ts`  
Expected: FAIL — `isTestCommand is not exported from '../src/rtk/bash-filter.js'`

**Step 3 — Write minimal implementation**

Update `src/rtk/bash-filter.ts`:

```typescript
import { stripAnsi } from "./ansi.js";
import { aggregateTestOutput } from "./test-output.js";
export interface FilterResult {
  output: string;
  savedChars: number;
}

export function isTestCommand(command: string): boolean {
  const c = command.toLowerCase();
  return ["vitest", "jest", "pytest", "cargo test", "npm test", "npx vitest"].some((t) => c.includes(t));
}

export function isGitCommand(command: string): boolean {
  const c = command.toLowerCase().trimStart();
  return c === "git" || c.startsWith("git ");
}

export function isBuildCommand(command: string): boolean {
  const c = command.toLowerCase();
  return ["tsc", "cargo build", "npm run build"].some((t) => c.includes(t));
}

export function isLinterCommand(command: string): boolean {
  const c = command.toLowerCase();
  return ["eslint", "prettier --check", "tsc --noemit"].some((t) => c.includes(t));
}
export function filterBashOutput(command: string, output: string): FilterResult {
  if (output === "") {
    return { output: "", savedChars: 0 };
  }

  const stripped = stripAnsi(output);
  let result: string;
  if (isTestCommand(command)) {
    result = aggregateTestOutput(stripped, command) ?? stripped;
  } else {
    result = stripped;
  }
  return {
    output: result,
    savedChars: output.length - result.length,
  };
}
```
**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter.test.ts`  
Expected: PASS
Run: `npx vitest run`  
Expected: all passing

---

### Task 4: filterBashOutput — routes git commands to compactGitOutput **[depends: 3]**
**Files:**
- Modify: `src/rtk/bash-filter.ts`
- Modify: `tests/bash-filter.test.ts`
- Test: `tests/bash-filter.test.ts`
**Covers AC:** 11

**Note:** AC7 (`isGitCommand`) is already covered by Task 3's table-driven detection tests. This task adds the routing to the technique function.

**Step 1 — Write the failing test**

Add to `tests/bash-filter.test.ts` inside the "filterBashOutput routing" describe:

```typescript
import * as gitModule from "../src/rtk/git.js";
  const spy = vi.spyOn(gitModule, "compactGitOutput").mockReturnValue("compressed git output");
  const result = filterBashOutput("git diff", "raw git output");
  expect(spy).toHaveBeenCalledWith("raw git output", "git diff");
  expect(result.output).toBe("compressed git output");
  spy.mockRestore();
});

it("falls back to stripped when compactGitOutput returns null", () => {
  const spy = vi.spyOn(gitModule, "compactGitOutput").mockReturnValue(null);
  const result = filterBashOutput("git commit -m 'fix'", "commit output");
  expect(spy).toHaveBeenCalledWith("commit output", "git commit -m 'fix'");
  expect(result.output).toBe("commit output");
  spy.mockRestore();
});
```
**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter.test.ts`  
Expected: FAIL — `AssertionError: expected "spy" to have been called`
**Step 3 — Write minimal implementation**

Update `src/rtk/bash-filter.ts` — add git import and routing after the test check:

```typescript
import { compactGitOutput } from "./git.js";
// In filterBashOutput, update the if/else chain:
if (isTestCommand(command)) {
  result = aggregateTestOutput(stripped, command) ?? stripped;
} else if (isGitCommand(command)) {
  result = compactGitOutput(stripped, command) ?? stripped;
} else {
  result = stripped;
}
```
**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter.test.ts`  
Expected: PASS
Run: `npx vitest run`  
Expected: all passing
---

### Task 5: filterBashOutput — routes linter commands to aggregateLinterOutput **[depends: 4]**
**Files:**
- Modify: `src/rtk/bash-filter.ts`
- Modify: `tests/bash-filter.test.ts`
- Test: `tests/bash-filter.test.ts`
**Covers AC:** 13

**Note:** Priority order is test → git → linter → build → fallback. Linter is checked before build so that `tsc --noEmit` routes to linter (AC9) rather than build.

**Step 1 — Write the failing test**

Add to `tests/bash-filter.test.ts` inside the "filterBashOutput routing" describe:

```typescript
import * as linterModule from "../src/rtk/linter.js";

it("routes linter commands to aggregateLinterOutput", () => {
  const spy = vi.spyOn(linterModule, "aggregateLinterOutput").mockReturnValue("compressed linter output");
  const result = filterBashOutput("eslint .", "raw linter output");
  expect(spy).toHaveBeenCalledWith("raw linter output", "eslint .");
  expect(result.output).toBe("compressed linter output");
  spy.mockRestore();
});

it("falls back to stripped when aggregateLinterOutput returns null", () => {
  const spy = vi.spyOn(linterModule, "aggregateLinterOutput").mockReturnValue(null);
  const result = filterBashOutput("eslint .", "raw linter output");
  expect(result.output).toBe("raw linter output");
  spy.mockRestore();
});
```
**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter.test.ts`  
Expected: FAIL — `AssertionError: expected "spy" to have been called`
**Step 3 — Write minimal implementation**

Update `src/rtk/bash-filter.ts` — add linter import and routing. Chain is now test → git → linter → fallback:

```typescript
import { aggregateLinterOutput } from "./linter.js";

// In filterBashOutput, update the if/else chain:
if (isTestCommand(command)) {
  result = aggregateTestOutput(stripped, command) ?? stripped;
} else if (isGitCommand(command)) {
  result = compactGitOutput(stripped, command) ?? stripped;
} else if (isLinterCommand(command)) {
  result = aggregateLinterOutput(stripped, command) ?? stripped;
} else {
  result = stripped;
}
```
**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter.test.ts`  
Expected: PASS
Run: `npx vitest run`  
Expected: all passing
---

### Task 6: filterBashOutput — routes build commands to filterBuildOutput **[depends: 5]**
**Files:**
- Modify: `src/rtk/bash-filter.ts`
- Modify: `tests/bash-filter.test.ts`
- Test: `tests/bash-filter.test.ts`
**Covers AC:** 12

**Step 1 — Write the failing test**

Add to `tests/bash-filter.test.ts` inside the "filterBashOutput routing" describe:

```typescript
import * as buildModule from "../src/rtk/build.js";

it("routes build commands to filterBuildOutput", () => {
  const spy = vi.spyOn(buildModule, "filterBuildOutput").mockReturnValue("compressed build output");
  const result = filterBashOutput("tsc", "raw build output");
  expect(spy).toHaveBeenCalledWith("raw build output", "tsc");
  expect(result.output).toBe("compressed build output");
  spy.mockRestore();
});

it("falls back to stripped when filterBuildOutput returns null", () => {
  const spy = vi.spyOn(buildModule, "filterBuildOutput").mockReturnValue(null);
  const result = filterBashOutput("npm run build", "raw build output");
  expect(result.output).toBe("raw build output");
  spy.mockRestore();
});
```
**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter.test.ts`  
Expected: FAIL — `AssertionError: expected "spy" to have been called`
**Step 3 — Write minimal implementation**

Update `src/rtk/bash-filter.ts` — add build import and routing. Final chain: test → git → linter → build → fallback:

```typescript
import { filterBuildOutput as filterBuild } from "./build.js";

// In filterBashOutput, update the if/else chain:
if (isTestCommand(command)) {
  result = aggregateTestOutput(stripped, command) ?? stripped;
} else if (isGitCommand(command)) {
  result = compactGitOutput(stripped, command) ?? stripped;
} else if (isLinterCommand(command)) {
  result = aggregateLinterOutput(stripped, command) ?? stripped;
} else if (isBuildCommand(command)) {
  result = filterBuild(stripped, command) ?? stripped;
} else {
  result = stripped;
}
```
**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter.test.ts`  
Expected: PASS
Run: `npx vitest run`  
Expected: all passing
---

### Task 7: filterBashOutput — routing priority tests **[depends: 6]**
**Files:**
- Modify: `tests/bash-filter.test.ts`
- Test: `tests/bash-filter.test.ts`
**Covers AC:** 14

**Note:** Priority is already correct from Tasks 3–6 (test → git → linter → build → fallback). This task adds tests that lock down the priority behavior for overlapping commands.

**Step 1 — Write the failing test**

Add to `tests/bash-filter.test.ts` inside the "filterBashOutput routing" describe:

```typescript
it("test command wins over build when both match (AC14)", () => {
  // "npm test && npm run build" matches isTestCommand AND isBuildCommand
  const testSpy = vi.spyOn(testOutput, "aggregateTestOutput").mockReturnValue("test wins");
  const buildSpy = vi.spyOn(buildModule, "filterBuildOutput").mockReturnValue("build wins");

  const result = filterBashOutput("npm test && npm run build", "some output");

  expect(testSpy).toHaveBeenCalledWith("some output", "npm test && npm run build");
  expect(buildSpy).not.toHaveBeenCalled();
  expect(result.output).toBe("test wins");
  buildSpy.mockRestore();
});

it("linter wins over build for 'tsc --noEmit'", () => {
  const linterSpy = vi.spyOn(linterModule, "aggregateLinterOutput").mockReturnValue("linter wins");
  const buildSpy = vi.spyOn(buildModule, "filterBuildOutput").mockReturnValue("build wins");

  const result = filterBashOutput("tsc --noEmit", "some output");

  expect(linterSpy).toHaveBeenCalledWith("some output", "tsc --noEmit");
  expect(buildSpy).not.toHaveBeenCalled();
  expect(result.output).toBe("linter wins");

  linterSpy.mockRestore();
  buildSpy.mockRestore();
});
```
**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter.test.ts`  
Expected: PASS — priority is already correct from the implementation order in Tasks 3–6. This task is a regression lock; both tests should pass immediately.

**Step 3 — No implementation change needed**

The correct priority order (test → git → linter → build → fallback) was already established in Tasks 3–6.
**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter.test.ts`  
Expected: PASS
Run: `npx vitest run`  
Expected: all passing
---

### Task 8: filterBashOutput — technique error returns ANSI-stripped original **[depends: 6]**
**Files:**
- Modify: `src/rtk/bash-filter.ts`
- Modify: `tests/bash-filter.test.ts`
- Test: `tests/bash-filter.test.ts`
**Covers AC:** 4

**Step 1 — Write the failing test**

Add to `tests/bash-filter.test.ts` inside the "filterBashOutput" describe:

```typescript
it("catches technique errors and returns ANSI-stripped original", () => {
  const spy = vi.spyOn(testOutput, "aggregateTestOutput").mockImplementation(() => {
    throw new Error("technique exploded");
  });
  const input = "\x1b[31mtest output\x1b[0m";
  const result = filterBashOutput("npm test", input);
  expect(result.output).toBe("test output");
  expect(result.savedChars).toBe(input.length - "test output".length);
  spy.mockRestore();
});
```
**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter.test.ts`  
Expected: FAIL — `Error: technique exploded`
**Step 3 — Write minimal implementation**

Wrap the routing logic in a try/catch in `src/rtk/bash-filter.ts`:

```typescript
export function filterBashOutput(command: string, output: string): FilterResult {
  if (output === "") {
    return { output: "", savedChars: 0 };
  }

  const stripped = stripAnsi(output);
  let result: string;
  try {
    if (isTestCommand(command)) {
      result = aggregateTestOutput(stripped, command) ?? stripped;
    } else if (isGitCommand(command)) {
      result = compactGitOutput(stripped, command) ?? stripped;
    } else if (isLinterCommand(command)) {
      result = aggregateLinterOutput(stripped, command) ?? stripped;
    } else if (isBuildCommand(command)) {
      result = filterBuild(stripped, command) ?? stripped;
    } else {
      result = stripped;
    }
  } catch {
    result = stripped;
  }
  return {
    output: result,
    savedChars: output.length - result.length,
  };
}
```
**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter.test.ts`  
Expected: PASS
Run: `npx vitest run`  
Expected: all passing
---

### Task 9: index.ts wiring — isBashToolResult gate and compression (no logging) **[depends: 8]**

**Files:**
- Modify: `index.ts`
- Modify: `tests/entry-point.test.ts`
- Create: `tests/bash-filter-integration.test.ts`
- Test: `tests/bash-filter-integration.test.ts`

**Covers AC:** 16, 17, 18

**Step 1 — Write the failing test**

First, update `tests/entry-point.test.ts` — the `registers sg tool` test's mockPi needs an `on` method so it won't break when `index.ts` starts calling `pi.on(...)`.

Change the mockPi object to:

```typescript
const mockPi = {
  registerTool(def: any) {
    tools.push(def.name);
  },
  on() {},
};
```

Then create `tests/bash-filter-integration.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("bash filter integration", () => {
  it("tool_result handler returns compressed content for Bash tool results", async () => {
    const mod = await import(pathToFileURL(resolve(root, "index.ts")).href);
    const handlers: Record<string, Function> = {};
    const mockPi = {
      registerTool() {},
      on(event: string, handler: Function) {
        handlers[event] = handler;
      },
    };
    mod.default(mockPi as any);

    expect(handlers["tool_result"]).toBeDefined();

    const bashEvent = {
      type: "tool_result" as const,
      toolName: "bash",
      toolCallId: "test-1",
      input: { command: "echo hello" },
      content: [{ type: "text" as const, text: "\x1b[32mhello\x1b[0m" }],
      isError: false,
      details: undefined,
    };

    const result = await handlers["tool_result"](bashEvent);
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).not.toContain("\x1b");
  });

  it("tool_result handler returns undefined for Read tool results", async () => {
    const mod = await import(pathToFileURL(resolve(root, "index.ts")).href);
    const handlers: Record<string, Function> = {};
    const mockPi = {
      registerTool() {},
      on(event: string, handler: Function) {
        handlers[event] = handler;
      },
    };
    mod.default(mockPi as any);

    const readEvent = {
      type: "tool_result" as const,
      toolName: "read",
      toolCallId: "test-2",
      input: { path: "foo.ts" },
      content: [{ type: "text" as const, text: "1:ab|some hashline content" }],
      isError: false,
      details: undefined,
    };

    const result = await handlers["tool_result"](readEvent);
    expect(result).toBeUndefined();
  });

  it("tool_result handler returns undefined for Grep tool results", async () => {
    const mod = await import(pathToFileURL(resolve(root, "index.ts")).href);
    const handlers: Record<string, Function> = {};
    const mockPi = {
      registerTool() {},
      on(event: string, handler: Function) {
        handlers[event] = handler;
      },
    };
    mod.default(mockPi as any);

    const grepEvent = {
      type: "tool_result" as const,
      toolName: "grep",
      toolCallId: "test-3",
      input: { pattern: "foo" },
      content: [{ type: "text" as const, text: "1:ab|match line" }],
      isError: false,
      details: undefined,
    };

    const result = await handlers["tool_result"](grepEvent);
    expect(result).toBeUndefined();
  });

  it("tool_result handler returns undefined for Edit tool results", async () => {
    const mod = await import(pathToFileURL(resolve(root, "index.ts")).href);
    const handlers: Record<string, Function> = {};
    const mockPi = {
      registerTool() {},
      on(event: string, handler: Function) {
        handlers[event] = handler;
      },
    };
    mod.default(mockPi as any);

    const editEvent = {
      type: "tool_result" as const,
      toolName: "edit",
      toolCallId: "test-4",
      input: { path: "foo.ts", edits: [] },
      content: [{ type: "text" as const, text: "Applied 1 edit" }],
      isError: false,
      details: undefined,
    };

    const result = await handlers["tool_result"](editEvent);
    expect(result).toBeUndefined();
  });

  it("tool_result handler returns undefined for sg tool results", async () => {
    const mod = await import(pathToFileURL(resolve(root, "index.ts")).href);
    const handlers: Record<string, Function> = {};
    const mockPi = {
      registerTool() {},
      on(event: string, handler: Function) {
        handlers[event] = handler;
      },
    };
    mod.default(mockPi as any);

    const sgEvent = {
      type: "tool_result" as const,
      toolName: "sg",
      toolCallId: "test-5",
      input: { pattern: "console.log($$$ARGS)" },
      content: [{ type: "text" as const, text: ">>1:ab|console.log('hello')" }],
      isError: false,
      details: undefined,
    };

    const result = await handlers["tool_result"](sgEvent);
    expect(result).toBeUndefined();
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter-integration.test.ts`  
Expected: FAIL — `AssertionError: expected undefined to be defined` (handlers["tool_result"] is undefined)

**Step 3 — Write minimal implementation**

Update `index.ts` — add the tool_result handler **without** logging:

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

  pi.on("tool_result", (event) => {
    if (!isBashToolResult(event)) {
      return undefined;
    }

    const command = (event.input as { command?: string }).command ?? "";
    const originalText = event.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    const { output } = filterBashOutput(command, originalText);

    return {
      content: [{ type: "text" as const, text: output }],
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

---

### Task 10: Savings logging — PI_RTK_SAVINGS=1 **[depends: 9]**

**Files:**
- Modify: `index.ts`
- Modify: `tests/bash-filter-integration.test.ts`
- Test: `tests/bash-filter-integration.test.ts`

**Covers AC:** 19, 20

**Step 1 — Write the failing test**

Add to `tests/bash-filter-integration.test.ts`:

```typescript
import { vi } from "vitest";

describe("savings logging", () => {
  it("logs savings to stderr when PI_RTK_SAVINGS=1", async () => {
    const origEnv = process.env.PI_RTK_SAVINGS;
    process.env.PI_RTK_SAVINGS = "1";
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    const mod = await import(pathToFileURL(resolve(root, "index.ts")).href + "?t=" + Date.now());
    const handlers: Record<string, Function> = {};
    const mockPi = {
      registerTool() {},
      on(event: string, handler: Function) {
        handlers[event] = handler;
      },
    };
    mod.default(mockPi as any);

    const bashEvent = {
      type: "tool_result" as const,
      toolName: "bash",
      toolCallId: "test-log",
      input: { command: "echo hello" },
      content: [{ type: "text" as const, text: "\x1b[32mhello\x1b[0m" }],
      isError: false,
      details: undefined,
    };

    await handlers["tool_result"](bashEvent);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("[RTK] Saved"));

    stderrSpy.mockRestore();
    process.env.PI_RTK_SAVINGS = origEnv;
  });

  it("does not log savings when PI_RTK_SAVINGS is unset", async () => {
    const origEnv = process.env.PI_RTK_SAVINGS;
    delete process.env.PI_RTK_SAVINGS;
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    const mod = await import(pathToFileURL(resolve(root, "index.ts")).href + "?t=" + Date.now());
    const handlers: Record<string, Function> = {};
    const mockPi = {
      registerTool() {},
      on(event: string, handler: Function) {
        handlers[event] = handler;
      },
    };
    mod.default(mockPi as any);

    const bashEvent = {
      type: "tool_result" as const,
      toolName: "bash",
      toolCallId: "test-nolog",
      input: { command: "echo hello" },
      content: [{ type: "text" as const, text: "\x1b[32mhello\x1b[0m" }],
      isError: false,
      details: undefined,
    };

    await handlers["tool_result"](bashEvent);
    const rtkCalls = stderrSpy.mock.calls.filter((c) => String(c[0]).includes("[RTK]"));
    expect(rtkCalls).toHaveLength(0);

    stderrSpy.mockRestore();
    process.env.PI_RTK_SAVINGS = origEnv;
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter-integration.test.ts`  
Expected: FAIL — `AssertionError: expected "write" spy to have been called with "[RTK] Saved"`

**Step 3 — Write minimal implementation**

Update the `tool_result` handler in `index.ts` to add savings logging:

```typescript
const { output, savedChars } = filterBashOutput(command, originalText);

if (process.env.PI_RTK_SAVINGS === "1") {
  process.stderr.write(`[RTK] Saved ${savedChars} chars (${command})\n`);
}

return {
  content: [{ type: "text" as const, text: output }],
};
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter-integration.test.ts`  
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`  
Expected: all passing

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