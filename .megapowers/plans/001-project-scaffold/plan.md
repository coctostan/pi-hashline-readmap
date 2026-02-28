# Plan: 001-project-scaffold (revised)

## Conventions Used
- `AGENTS.md` is not present in this repo root, so conventions are inferred from the spec: TypeScript + ESM + Vitest.
- Test files: `tests/**/*.test.ts`
- Full suite command: `npm test`

## AC Coverage Map
| AC | Task(s) |
|---|---|
| 1 (`package.json` name/type) | 2 |
| 2 (hashline deps) | 2 |
| 3 (read-map deps) | 2 |
| 4 (`vitest` devDependency) | 2 |
| 5 (`test` script runs vitest) | 2 |
| 6 (`tsconfig.json` ESM-compatible) | 3 |
| 7 (`vitest.config.ts`) | 4 |
| 8 (`index.ts` default function) | 5 |
| 9 (hashline files under `src/`) | 6 |
| 10 (read-map core files) | 7 |
| 11 (read-map mapper files) | 8 |
| 12 (RTK required files) | 9 |
| 13 (RTK `source.ts`/`search.ts` absent) | 10 |
| 14 (`scripts/python_outline.py`, `scripts/go_outline.go`) | 11 |
| 15 (`prompts/` exists with `.md`) | 12 |
| 16 (`tsc --noEmit` exits 0) | 13 |
| 17 (`npm test` exits 0 with at least one passing test) | 14 |

---

### Task 1: Stage upstream source packages locally [no-test]

**Justification:** Tooling/setup task only. It prepares deterministic local source inputs for later copy steps.

**Files:**
- No repo files changed (uses `/tmp/pi-hashline-readmap-upstream` staging directory)

**Step 1 — Make the change**
Run:

```bash
rm -rf /tmp/pi-hashline-readmap-upstream
mkdir -p /tmp/pi-hashline-readmap-upstream
cd /tmp/pi-hashline-readmap-upstream

npm pack pi-hashline-edit@0.3.0 pi-read-map@1.3.0 pi-rtk@0.1.3

mkdir -p pi-hashline-edit pi-read-map pi-rtk

tar -xzf pi-hashline-edit-0.3.0.tgz -C pi-hashline-edit
tar -xzf pi-read-map-1.3.0.tgz -C pi-read-map
tar -xzf pi-rtk-0.1.3.tgz -C pi-rtk
```

**Step 2 — Verify**
Run:

```bash
test -f /tmp/pi-hashline-readmap-upstream/pi-hashline-edit/package/src/read.ts && \
test -f /tmp/pi-hashline-readmap-upstream/pi-read-map/package/src/mapper.ts && \
test -f /tmp/pi-hashline-readmap-upstream/pi-rtk/package/techniques/ansi.ts
```

Expected: exits 0.

**Covers AC:** prerequisite only (supports Tasks 6–12)

---

### Task 2: Initialize package.json with combined dependencies [no-test] [depends: 1]

**Justification:** Manifest/config only.

**Files:**
- Create: `package.json`

**Step 1 — Make the change**
Create `package.json`:

```json
{
  "name": "pi-hashline-readmap",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "pi": {
    "extensions": ["./index.ts"]
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "diff": "^8.0.3",
    "xxhashjs": "^0.2.2",
    "ts-morph": "^27.0.2",
    "tree-sitter": "^0.25.0",
    "tree-sitter-cpp": "^0.23.4",
    "tree-sitter-rust": "^0.24.0",
    "tree-sitter-clojure": "^0.4.0"
  },
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@sinclair/typebox": "*"
  },
  "devDependencies": {
    "@mariozechner/pi-coding-agent": "^0.55.1",
    "@sinclair/typebox": "^0.34.48",
    "@types/node": "^25.3.2",
    "@types/xxhashjs": "^0.2.4",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18"
  }
}
```

**Step 2 — Verify**
Run:

```bash
npm install
```

Expected: exits 0 and installs dependencies.

**Covers AC:** 1, 2, 3, 4, 5

---

### Task 3: Create tsconfig.json for Node ESM [no-test] [depends: 2]

**Justification:** Compiler configuration only.

**Files:**
- Create: `tsconfig.json`

**Step 1 — Make the change**
Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  },
  "include": ["index.ts", "src/**/*", "tests/**/*", "vitest.config.ts"],
  "exclude": ["node_modules", "scripts"]
}
```

**Step 2 — Verify**
Run:

```bash
npx tsc --showConfig > /dev/null
```

Expected: exits 0.

**Covers AC:** 6

---

### Task 4: Create Vitest config [no-test] [depends: 2]

**Justification:** Test-runner configuration only.

**Files:**
- Create: `vitest.config.ts`

**Step 1 — Make the change**
Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 10000
  }
});
```

**Step 2 — Verify**
Run:

```bash
npx vitest run --config vitest.config.ts --passWithNoTests
```

Expected: exits 0 and reports no tests found.

**Covers AC:** 7

---

### Task 5: Add extension entry point default export [depends: 2, 4]

**Files:**
- Create: `tests/entry-point.test.ts`
- Create: `index.ts`

**Step 1 — Write the failing test**
Create `tests/entry-point.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("extension entry point (AC8)", () => {
  it("index.ts exists", () => {
    expect(existsSync(resolve(root, "index.ts"))).toBe(true);
  });

  it("index.ts default export is a function", async () => {
    const mod = await import(pathToFileURL(resolve(root, "index.ts")).href);
    expect(typeof mod.default).toBe("function");
  });
});
```

**Step 2 — Run test, verify it fails**
Run:

```bash
npx vitest run tests/entry-point.test.ts
```

Expected: FAIL —
`AssertionError: expected false to be true` for `index.ts exists`.

**Step 3 — Write minimal implementation**
Create `index.ts`:

```ts
export default function piHashlineReadmapExtension(): void {
  // Scaffold entry point; integration wiring is intentionally out of scope.
}
```

**Step 4 — Run test, verify it passes**
Run:

```bash
npx vitest run tests/entry-point.test.ts
```

Expected: PASS (2 tests).

**Step 5 — Verify no regressions**
Run:

```bash
npm test
```

Expected: all tests passing.

**Covers AC:** 8

---

### Task 6: Add hashline source files under `src/` [depends: 1, 2, 4]

**Files:**
- Create: `tests/hashline-files.test.ts`
- Create: `src/read.ts`
- Create: `src/edit.ts`
- Create: `src/grep.ts`
- Create: `src/hashline.ts`
- Create: `src/path-utils.ts`
- Create: `src/runtime.ts`
- Create (supporting): `src/edit-diff.ts`

**Step 1 — Write the failing test**
Create `tests/hashline-files.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("hashline source files (AC9)", () => {
  const required = [
    "src/read.ts",
    "src/edit.ts",
    "src/grep.ts",
    "src/hashline.ts",
    "src/path-utils.ts",
    "src/runtime.ts"
  ];

  for (const file of required) {
    it(`${file} exists`, () => {
      expect(existsSync(resolve(root, file))).toBe(true);
    });
  }
});
```

**Step 2 — Run test, verify it fails**
Run:

```bash
npx vitest run tests/hashline-files.test.ts
```

Expected: FAIL —
`AssertionError: expected false to be true` (e.g., for `src/read.ts exists`).

**Step 3 — Write minimal implementation**
Run:

```bash
mkdir -p src
cp /tmp/pi-hashline-readmap-upstream/pi-hashline-edit/package/src/read.ts src/
cp /tmp/pi-hashline-readmap-upstream/pi-hashline-edit/package/src/edit.ts src/
cp /tmp/pi-hashline-readmap-upstream/pi-hashline-edit/package/src/grep.ts src/
cp /tmp/pi-hashline-readmap-upstream/pi-hashline-edit/package/src/hashline.ts src/
cp /tmp/pi-hashline-readmap-upstream/pi-hashline-edit/package/src/path-utils.ts src/
cp /tmp/pi-hashline-readmap-upstream/pi-hashline-edit/package/src/runtime.ts src/
cp /tmp/pi-hashline-readmap-upstream/pi-hashline-edit/package/src/edit-diff.ts src/
```

**Step 4 — Run test, verify it passes**
Run:

```bash
npx vitest run tests/hashline-files.test.ts
```

Expected: PASS (6 tests).

**Step 5 — Verify no regressions**
Run:

```bash
npm test
```

Expected: all tests passing.

**Covers AC:** 9

---

### Task 7: Add read-map core files under `src/readmap/` [depends: 1, 2, 4]

**Files:**
- Create: `tests/readmap-core-files.test.ts`
- Create: `src/readmap/mapper.ts`
- Create: `src/readmap/formatter.ts`
- Create: `src/readmap/language-detect.ts`
- Create: `src/readmap/types.ts`
- Create: `src/readmap/constants.ts`
- Create (supporting): `src/readmap/enums.ts`

**Step 1 — Write the failing test**
Create `tests/readmap-core-files.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("read-map core files (AC10)", () => {
  const required = [
    "src/readmap/mapper.ts",
    "src/readmap/formatter.ts",
    "src/readmap/language-detect.ts",
    "src/readmap/types.ts",
    "src/readmap/constants.ts"
  ];

  for (const file of required) {
    it(`${file} exists`, () => {
      expect(existsSync(resolve(root, file))).toBe(true);
    });
  }
});
```

**Step 2 — Run test, verify it fails**
Run:

```bash
npx vitest run tests/readmap-core-files.test.ts
```

Expected: FAIL —
`AssertionError: expected false to be true` (e.g., `src/readmap/mapper.ts exists`).

**Step 3 — Write minimal implementation**
Run:

```bash
mkdir -p src/readmap
cp /tmp/pi-hashline-readmap-upstream/pi-read-map/package/src/mapper.ts src/readmap/
cp /tmp/pi-hashline-readmap-upstream/pi-read-map/package/src/formatter.ts src/readmap/
cp /tmp/pi-hashline-readmap-upstream/pi-read-map/package/src/language-detect.ts src/readmap/
cp /tmp/pi-hashline-readmap-upstream/pi-read-map/package/src/types.ts src/readmap/
cp /tmp/pi-hashline-readmap-upstream/pi-read-map/package/src/constants.ts src/readmap/
cp /tmp/pi-hashline-readmap-upstream/pi-read-map/package/src/enums.ts src/readmap/
```

**Step 4 — Run test, verify it passes**
Run:

```bash
npx vitest run tests/readmap-core-files.test.ts
```

Expected: PASS (5 tests).

**Step 5 — Verify no regressions**
Run:

```bash
npm test
```

Expected: all tests passing.

**Covers AC:** 10

---

### Task 8: Add required read-map mapper files [depends: 1, 2, 4, 7]

**Files:**
- Create: `tests/readmap-mappers-files.test.ts`
- Create: `src/readmap/mappers/typescript.ts`
- Create: `src/readmap/mappers/python.ts`
- Create: `src/readmap/mappers/go.ts`
- Create: `src/readmap/mappers/rust.ts`
- Create: `src/readmap/mappers/json.ts`
- Create: `src/readmap/mappers/markdown.ts`
- Create: `src/readmap/mappers/fallback.ts`
- Create (supporting, copied): additional mapper files from upstream `src/readmap/mappers/*.ts`

**Step 1 — Write the failing test**
Create `tests/readmap-mappers-files.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("required read-map mapper files (AC11)", () => {
  const required = [
    "typescript.ts",
    "python.ts",
    "go.ts",
    "rust.ts",
    "json.ts",
    "markdown.ts",
    "fallback.ts"
  ];

  for (const mapper of required) {
    it(`src/readmap/mappers/${mapper} exists`, () => {
      expect(existsSync(resolve(root, `src/readmap/mappers/${mapper}`))).toBe(true);
    });
  }
});
```

**Step 2 — Run test, verify it fails**
Run:

```bash
npx vitest run tests/readmap-mappers-files.test.ts
```

Expected: FAIL —
`AssertionError: expected false to be true` (e.g., `src/readmap/mappers/typescript.ts exists`).

**Step 3 — Write minimal implementation**
Run:

```bash
mkdir -p src/readmap/mappers
cp /tmp/pi-hashline-readmap-upstream/pi-read-map/package/src/mappers/*.ts src/readmap/mappers/
```

**Step 4 — Run test, verify it passes**
Run:

```bash
npx vitest run tests/readmap-mappers-files.test.ts
```

Expected: PASS (7 tests).

**Step 5 — Verify no regressions**
Run:

```bash
npm test
```

Expected: all tests passing.

**Covers AC:** 11

---

### Task 9: Add required RTK technique files under `src/rtk/` [depends: 1, 2, 4]

**Files:**
- Create: `tests/rtk-required-files.test.ts`
- Create: `src/rtk/ansi.ts`
- Create: `src/rtk/build.ts`
- Create: `src/rtk/test-output.ts`
- Create: `src/rtk/git.ts`
- Create: `src/rtk/linter.ts`
- Create: `src/rtk/truncate.ts`
- Create (temporary/supporting): other upstream technique files copied in same step

**Step 1 — Write the failing test**
Create `tests/rtk-required-files.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("RTK required files (AC12)", () => {
  const required = [
    "src/rtk/ansi.ts",
    "src/rtk/build.ts",
    "src/rtk/test-output.ts",
    "src/rtk/git.ts",
    "src/rtk/linter.ts",
    "src/rtk/truncate.ts"
  ];

  for (const file of required) {
    it(`${file} exists`, () => {
      expect(existsSync(resolve(root, file))).toBe(true);
    });
  }
});
```

**Step 2 — Run test, verify it fails**
Run:

```bash
npx vitest run tests/rtk-required-files.test.ts
```

Expected: FAIL —
`AssertionError: expected false to be true` (e.g., `src/rtk/ansi.ts exists`).

**Step 3 — Write minimal implementation**
Run:

```bash
mkdir -p src/rtk
cp /tmp/pi-hashline-readmap-upstream/pi-rtk/package/techniques/*.ts src/rtk/
```

(AC12 only checks required files exist; AC13 cleanup is handled in Task 10.)

**Step 4 — Run test, verify it passes**
Run:

```bash
npx vitest run tests/rtk-required-files.test.ts
```

Expected: PASS (6 tests).

**Step 5 — Verify no regressions**
Run:

```bash
npm test
```

Expected: all tests passing.

**Covers AC:** 12

---

### Task 10: Remove forbidden RTK files (`source.ts`, `search.ts`) [depends: 9]

**Files:**
- Create: `tests/rtk-forbidden-files.test.ts`
- Modify: `src/rtk/` (delete forbidden files)

**Step 1 — Write the failing test**
Create `tests/rtk-forbidden-files.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkFiles(full));
    } else {
      out.push(relative(dir, full));
    }
  }
  return out;
}

describe("RTK forbidden files (AC13)", () => {
  it("src/rtk/source.ts does not exist", () => {
    expect(existsSync(resolve(root, "src/rtk/source.ts"))).toBe(false);
  });

  it("src/rtk/search.ts does not exist", () => {
    expect(existsSync(resolve(root, "src/rtk/search.ts"))).toBe(false);
  });

  it("no nested source.ts/search.ts exists under src/rtk", () => {
    const rtkRoot = resolve(root, "src/rtk");
    const files = walkFiles(rtkRoot);
    expect(files.some((f) => f.endsWith("source.ts"))).toBe(false);
    expect(files.some((f) => f.endsWith("search.ts"))).toBe(false);
  });
});
```

**Step 2 — Run test, verify it fails**
Run:

```bash
npx vitest run tests/rtk-forbidden-files.test.ts
```

Expected: FAIL —
`AssertionError: expected true to be false` for `src/rtk/source.ts does not exist` (and/or `search.ts`).

**Step 3 — Write minimal implementation**
Run:

```bash
rm -f src/rtk/source.ts src/rtk/search.ts
```

**Step 4 — Run test, verify it passes**
Run:

```bash
npx vitest run tests/rtk-forbidden-files.test.ts
```

Expected: PASS (3 tests).

**Step 5 — Verify no regressions**
Run:

```bash
npm test
```

Expected: all tests passing.

**Covers AC:** 13

---

### Task 11: Add outline scripts under `scripts/` [depends: 1, 2, 4]

**Files:**
- Create: `tests/scripts-files.test.ts`
- Create: `scripts/python_outline.py`
- Create: `scripts/go_outline.go`

**Step 1 — Write the failing test**
Create `tests/scripts-files.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("outline scripts (AC14)", () => {
  it("scripts/python_outline.py exists", () => {
    expect(existsSync(resolve(root, "scripts/python_outline.py"))).toBe(true);
  });

  it("scripts/go_outline.go exists", () => {
    expect(existsSync(resolve(root, "scripts/go_outline.go"))).toBe(true);
  });
});
```

**Step 2 — Run test, verify it fails**
Run:

```bash
npx vitest run tests/scripts-files.test.ts
```

Expected: FAIL —
`AssertionError: expected false to be true` for missing script file(s).

**Step 3 — Write minimal implementation**
Run:

```bash
mkdir -p scripts
cp /tmp/pi-hashline-readmap-upstream/pi-read-map/package/scripts/python_outline.py scripts/
cp /tmp/pi-hashline-readmap-upstream/pi-read-map/package/scripts/go_outline.go scripts/
```

**Step 4 — Run test, verify it passes**
Run:

```bash
npx vitest run tests/scripts-files.test.ts
```

Expected: PASS (2 tests).

**Step 5 — Verify no regressions**
Run:

```bash
npm test
```

Expected: all tests passing.

**Covers AC:** 14

---

### Task 12: Add prompts directory with markdown prompt files [depends: 1, 2, 4]

**Files:**
- Create: `tests/prompts-files.test.ts`
- Create: `prompts/read.md`
- Create: `prompts/edit.md`

**Step 1 — Write the failing test**
Create `tests/prompts-files.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("prompts directory (AC15)", () => {
  it("prompts directory exists", () => {
    expect(existsSync(resolve(root, "prompts"))).toBe(true);
  });

  it("prompts contains at least one .md file", () => {
    const promptsDir = resolve(root, "prompts");
    expect(existsSync(promptsDir)).toBe(true);
    const files = readdirSync(promptsDir);
    expect(files.some((f) => f.endsWith(".md"))).toBe(true);
  });
});
```

**Step 2 — Run test, verify it fails**
Run:

```bash
npx vitest run tests/prompts-files.test.ts
```

Expected: FAIL —
`AssertionError: expected false to be true` for `prompts directory exists`.

**Step 3 — Write minimal implementation**
Run:

```bash
mkdir -p prompts
cp /tmp/pi-hashline-readmap-upstream/pi-hashline-edit/package/prompts/read.md prompts/
cp /tmp/pi-hashline-readmap-upstream/pi-hashline-edit/package/prompts/edit.md prompts/
```

**Step 4 — Run test, verify it passes**
Run:

```bash
npx vitest run tests/prompts-files.test.ts
```

Expected: PASS (2 tests).

**Step 5 — Verify no regressions**
Run:

```bash
npm test
```

Expected: all tests passing.

**Covers AC:** 15

---

### Task 13: Verify TypeScript compiles cleanly [no-test] [depends: 3, 5, 6, 7, 8, 9, 10, 11, 12]

**Justification:** AC16 is itself a command-level build/typecheck criterion.

**Files:**
- None required (modify only if compiler reports concrete errors)

**Step 1 — Make the change**
Run:

```bash
npx tsc --noEmit
```

If errors appear, apply the smallest concrete fix for the reported error in the relevant file, then rerun.

**Step 2 — Verify**
Run:

```bash
npx tsc --noEmit
```

Expected: exits 0 with zero type errors.

**Covers AC:** 16

---

### Task 14: Verify full test suite passes [no-test] [depends: 13]

**Justification:** AC17 is itself a command-level test-runner criterion.

**Files:**
- None

**Step 1 — Make the change**
Run:

```bash
npm test
```

**Step 2 — Verify**
Run:

```bash
npm test
```

Expected: exits 0, Vitest reports passing tests (at least one passing test).

**Covers AC:** 17
