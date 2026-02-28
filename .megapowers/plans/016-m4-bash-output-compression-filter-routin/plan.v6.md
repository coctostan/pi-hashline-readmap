
# Plan: Bash Output Compression Filter & Routing

**Issue:** 016-m4-bash-output-compression-filter-routin
**Test framework:** vitest (`npx vitest run`)
**Project conventions:** From `AGENT-NATIVE-TOOLS.md` — TypeScript, `.js` import specifiers, vitest for tests.

---

## Task 1: Fixture validation tests

**Files:**
- Create: `tests/bash-filter-fixtures.test.ts`
- Test: `tests/bash-filter-fixtures.test.ts`

**Covers AC:** 21, 22, 23, 24, 25

**Step 1 — Write the failing test**

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
Create the five fixture files:

`tests/fixtures/vitest-pass.txt`:
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

`tests/fixtures/vitest-fail.txt`:
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

`tests/fixtures/tsc-errors.txt`:
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

`tests/fixtures/git-diff-large.txt`:
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

`tests/fixtures/eslint-output.txt`:
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

## Task 2: filterBashOutput — empty input and ANSI stripping

**Files:**
- Create: `src/rtk/bash-filter.ts`
- Create: `tests/bash-filter.test.ts`
- Test: `tests/bash-filter.test.ts`

**Covers AC:** 1, 2, 3, 5, 15

**Step 1 — Write the failing test**

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

## Task 3: filterBashOutput — routes test commands to aggregateTestOutput [depends: 2]

**Files:**
- Modify: `src/rtk/bash-filter.ts`
- Modify: `tests/bash-filter.test.ts`
- Test: `tests/bash-filter.test.ts`

**Covers AC:** 6, 10

**Step 1 — Write the failing test**

Add to `tests/bash-filter.test.ts`:

```typescript
import { vi } from "vitest";
import * as testOutput from "../src/rtk/test-output.js";

describe("filterBashOutput routing", () => {
  it("routes test commands to aggregateTestOutput", () => {
    const spy = vi.spyOn(testOutput, "aggregateTestOutput").mockReturnValue("compressed test output");
    const result = filterBashOutput("npm test", "raw test output");
    expect(spy).toHaveBeenCalled();
    expect(result.output).toBe("compressed test output");
    spy.mockRestore();
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter.test.ts`
Expected: FAIL — `AssertionError: expected "spy" to have been called` (filterBashOutput only does ANSI-stripping, doesn't call aggregateTestOutput)

**Step 3 — Write minimal implementation**

Update `src/rtk/bash-filter.ts`:

```typescript
import { stripAnsi } from "./ansi.js";
import { isTestCommand, aggregateTestOutput } from "./test-output.js";

export interface FilterResult {
  output: string;
  savedChars: number;
}

export function filterBashOutput(command: string, output: string): FilterResult {
  if (output === "") {
    return { output: "", savedChars: 0 };
  }

  const stripped = stripAnsi(output);

  let result: string;
  if (isTestCommand(command)) {
    result = aggregateTestOutput(stripped);
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

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

---

## Task 4: filterBashOutput — routes git commands to compactGitOutput [depends: 2]

**Files:**
- Modify: `src/rtk/bash-filter.ts`
- Modify: `src/rtk/git.ts`
- Modify: `tests/bash-filter.test.ts`
- Test: `tests/bash-filter.test.ts`

**Covers AC:** 7, 11

Note: AC7 says `isGitCommand` returns true for "commands starting with `git`". The current implementation in `src/rtk/git.ts` only matches specific subcommands (`git diff`, `git status`, `git log`, `git show`, `git stash`). This task also updates `isGitCommand` to match any command starting with `git` per the spec. (The spec's "Out of Scope: don't modify technique files" refers to the compression technique functions themselves, not the command detection predicates which are part of the routing layer being built.)

**Step 1 — Write the failing test**

Add to `tests/bash-filter.test.ts` inside the "filterBashOutput routing" describe:

```typescript
import * as gitModule from "../src/rtk/git.js";

it("routes git commands to compactGitOutput", () => {
  const spy = vi.spyOn(gitModule, "compactGitOutput").mockReturnValue("compressed git output");
  const result = filterBashOutput("git diff", "raw git output");
  expect(spy).toHaveBeenCalled();
  expect(result.output).toBe("compressed git output");
  spy.mockRestore();
});

it("routes any command starting with 'git' to compactGitOutput", () => {
  const spy = vi.spyOn(gitModule, "compactGitOutput").mockReturnValue("compressed");
  const result = filterBashOutput("git commit -m 'fix'", "commit output");
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter.test.ts`
Expected: FAIL — `AssertionError: expected "spy" to have been called` (filterBashOutput doesn't route git commands yet)

**Step 3 — Write minimal implementation**

1. Update `src/rtk/git.ts` — change `isGitCommand` to match any command starting with `git`:

Replace the `isGitCommand` function:

```typescript
export function isGitCommand(command: string | undefined | null): boolean {
	if (typeof command !== "string" || command.length === 0) {
		return false;
	}

	const cmdLower = command.toLowerCase().trimStart();
	return cmdLower === "git" || cmdLower.startsWith("git ");
}
```

(The `GIT_COMMANDS` array is still used internally by `compactGitOutput` for dispatch — don't remove it.)

2. Update `src/rtk/bash-filter.ts` to add git routing after the test check:

```typescript
import { isGitCommand, compactGitOutput } from "./git.js";

// In filterBashOutput, update the if/else chain:
if (isTestCommand(command)) {
  result = aggregateTestOutput(stripped);
} else if (isGitCommand(command)) {
  result = compactGitOutput(stripped);
} else {
  result = stripped;
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

---

## Task 5: filterBashOutput — routes build commands to filterBuildOutput (build-first ordering) [depends: 2]

**Files:**
- Modify: `src/rtk/bash-filter.ts`
- Modify: `tests/bash-filter.test.ts`
- Test: `tests/bash-filter.test.ts`

**Covers AC:** 8, 12

Note: This task intentionally inserts build routing **before** test routing in the if/else chain. This makes Task 7 (priority test) fail deterministically, forcing the correct reorder in that task.

**Step 1 — Write the failing test**

Add to `tests/bash-filter.test.ts` inside the "filterBashOutput routing" describe:

```typescript
import * as buildModule from "../src/rtk/build.js";

it("routes build commands to filterBuildOutput", () => {
  const spy = vi.spyOn(buildModule, "filterBuildOutput").mockReturnValue("compressed build output");
  const result = filterBashOutput("tsc", "raw build output");
  expect(spy).toHaveBeenCalled();
  expect(result.output).toBe("compressed build output");
  spy.mockRestore();
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter.test.ts`
Expected: FAIL — `AssertionError: expected "spy" to have been called` (filterBashOutput doesn't route build commands yet)

**Step 3 — Write minimal implementation**

Update `src/rtk/bash-filter.ts` — add build routing. Insert `isBuildCommand` check **before** `isTestCommand` (deliberately wrong order — Task 7 will fix):

```typescript
import { stripAnsi } from "./ansi.js";
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

  const stripped = stripAnsi(output);

  let result: string;
  if (isBuildCommand(command)) {
    result = filterBuildOutput(stripped);
  } else if (isTestCommand(command)) {
    result = aggregateTestOutput(stripped);
  } else if (isGitCommand(command)) {
    result = compactGitOutput(stripped);
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
Expected: PASS (all existing tests still pass — `npm test` doesn't match `isBuildCommand`, `tsc` doesn't match `isTestCommand`, so no conflicts)

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

---

## Task 6: filterBashOutput — routes linter commands to aggregateLinterOutput [depends: 2]

**Files:**
- Modify: `src/rtk/bash-filter.ts`
- Modify: `tests/bash-filter.test.ts`
- Test: `tests/bash-filter.test.ts`

**Covers AC:** 9, 13

**Step 1 — Write the failing test**

Add to `tests/bash-filter.test.ts` inside the "filterBashOutput routing" describe:

```typescript
import * as linterModule from "../src/rtk/linter.js";

it("routes linter commands to aggregateLinterOutput", () => {
  const spy = vi.spyOn(linterModule, "aggregateLinterOutput").mockReturnValue("compressed linter output");
  const result = filterBashOutput("eslint .", "raw linter output");
  expect(spy).toHaveBeenCalled();
  expect(result.output).toBe("compressed linter output");
  spy.mockRestore();
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter.test.ts`
Expected: FAIL — `AssertionError: expected "spy" to have been called` (filterBashOutput doesn't route linter commands yet)

**Step 3 — Write minimal implementation**

Update `src/rtk/bash-filter.ts` to add linter routing at the end of the if/else chain (before the fallback `else`):

```typescript
import { isLinterCommand, aggregateLinterOutput } from "./linter.js";

// Add to the if/else chain, before the final else:
} else if (isLinterCommand(command)) {
  result = aggregateLinterOutput(stripped);
} else {
  result = stripped;
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

---

## Task 7: filterBashOutput — test command wins over build command (priority) [depends: 3, 5]

**Files:**
- Modify: `src/rtk/bash-filter.ts`
- Modify: `tests/bash-filter.test.ts`
- Test: `tests/bash-filter.test.ts`

**Covers AC:** 14

**Step 1 — Write the failing test**

Add to `tests/bash-filter.test.ts` inside the "filterBashOutput routing" describe:

```typescript
it("routes a command matching both isTestCommand and isBuildCommand as test command", () => {
  // "npm test && npm run build" matches isTestCommand (contains "test") AND isBuildCommand (contains "npm run build")
  const testSpy = vi.spyOn(testOutput, "aggregateTestOutput").mockReturnValue("test wins");
  const buildSpy = vi.spyOn(buildModule, "filterBuildOutput").mockReturnValue("build wins");

  const result = filterBashOutput("npm test && npm run build", "some output");

  expect(testSpy).toHaveBeenCalled();
  expect(buildSpy).not.toHaveBeenCalled();
  expect(result.output).toBe("test wins");

  testSpy.mockRestore();
  buildSpy.mockRestore();
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter.test.ts`
Expected: FAIL — `AssertionError: expected "aggregateTestOutput" spy to have been called` (build is checked before test due to Task 5's deliberate ordering, so `filterBuildOutput` gets called instead)

**Step 3 — Write minimal implementation**

Update `src/rtk/bash-filter.ts` — reorder the if/else chain so `isTestCommand` is checked **before** `isBuildCommand`:

```typescript
  let result: string;
  if (isTestCommand(command)) {
    result = aggregateTestOutput(stripped);
  } else if (isGitCommand(command)) {
    result = compactGitOutput(stripped);
  } else if (isBuildCommand(command)) {
    result = filterBuildOutput(stripped);
  } else if (isLinterCommand(command)) {
    result = aggregateLinterOutput(stripped);
  } else {
    result = stripped;
  }
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/bash-filter.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

---

## Task 8: filterBashOutput — technique error returns ANSI-stripped original [depends: 3]

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
Expected: FAIL — `Error: technique exploded` (unhandled throw propagates)

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
      result = aggregateTestOutput(stripped);
    } else if (isGitCommand(command)) {
      result = compactGitOutput(stripped);
    } else if (isBuildCommand(command)) {
      result = filterBuildOutput(stripped);
    } else if (isLinterCommand(command)) {
      result = aggregateLinterOutput(stripped);
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

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

---

## Task 9: index.ts wiring — isBashToolResult gate and compression (no logging) [depends: 8]

**Files:**
- Modify: `index.ts`
- Modify: `tests/entry-point.test.ts` (update mock to include `on`)
- Create: `tests/bash-filter-integration.test.ts`
- Test: `tests/bash-filter-integration.test.ts`

**Covers AC:** 16, 17, 18

**Step 1 — Write the failing test**

First, update `tests/entry-point.test.ts` — the `registers sg tool` test's mockPi needs an `on` method so it won't break when `index.ts` starts calling `pi.on(...)`. Change the mockPi object to:

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
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/bash-filter-integration.test.ts`
Expected: FAIL — `AssertionError: expected undefined to be defined` (handlers["tool_result"] is undefined because index.ts doesn't register a tool_result handler yet)

**Step 3 — Write minimal implementation**

Update `index.ts` — add the tool_result handler **without** logging (logging added in Task 10):

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
Expected: all passing (entry-point.test.ts must also pass with the updated mock)

---

## Task 10: Savings logging — PI_RTK_SAVINGS=1 [depends: 9]

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
Expected: FAIL — `AssertionError: expected "write" spy to have been called with "[RTK] Saved"` (index.ts handler doesn't log savings yet)

**Step 3 — Write minimal implementation**

Update the `tool_result` handler in `index.ts` to add savings logging:

```typescript
  pi.on("tool_result", (event) => {
    if (!isBashToolResult(event)) {
      return undefined;
    }

    const command = (event.input as { command?: string }).command ?? "";
    const originalText = event.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    const { output, savedChars } = filterBashOutput(command, originalText);

    if (process.env.PI_RTK_SAVINGS === "1" && savedChars > 0) {
      process.stderr.write(`[RTK] Saved ${savedChars} chars (${command})\n`);
    }

    return {
      content: [{ type: "text" as const, text: output }],
    };
  });
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
| 6 | 3 | isTestCommand (via routing spy test) |
| 7 | 4 | isGitCommand (updated to startsWith("git"), tested via routing spy) |
| 8 | 5 | isBuildCommand (via routing spy test) |
| 9 | 6 | isLinterCommand (via routing spy test) |
| 10 | 3 | Test routing |
| 11 | 4 | Git routing |
| 12 | 5 | Build routing |
| 13 | 6 | Linter routing |
| 14 | 7 | Test > build priority (`npm test && npm run build`) |
| 15 | 2 | Fallback ANSI-strip |
| 16 | 9 | tool_result handler registration |
| 17 | 9 | Non-bash returns undefined |
| 18 | 9 | Bash returns compressed content |
| 19 | 10 | PI_RTK_SAVINGS=1 logging |
| 20 | 10 | No logging when unset |
| 21-25 | 1 | Fixture files |
