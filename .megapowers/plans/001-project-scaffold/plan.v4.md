# Plan: 001-project-scaffold

## AC Coverage Map
| AC | Task(s) |
|----|---------|
| 1 (package.json name/type) | 1 |
| 2 (hashline deps) | 1 |
| 3 (read-map deps) | 1 |
| 4 (vitest devDep) | 1 |
| 5 (test script) | 1 |
| 6 (tsconfig) | 2 |
| 7 (vitest.config.ts) | 3 |
| 8 (index.ts exports default function) | 4 |
| 9 (hashline src files) | 5 |
| 10 (readmap core files) | 6 |
| 11 (readmap mappers) | 6 |
| 12 (RTK technique files) | 7 |
| 13 (no source.ts/search.ts) | 7 |
| 14 (scripts) | 8 |
| 15 (prompts) | 9 |
| 16 (tsc --noEmit) | 10 |
| 17 (npm test passes) | 11 |

---

### Task 1: Initialize package.json with combined dependencies [no-test]

**Justification:** Config-only — creates the package manifest. No executable code. Verified by `npm install` succeeding.

**Files:**
- Create: `package.json`

**Step 1 — Make the change**

Create `package.json` at the project root:

```json
{
  "name": "pi-hashline-readmap",
  "version": "0.1.0",
  "description": "Combined pi extension: hashline read/edit/grep + structural file maps + bash output compression",
  "type": "module",
  "pi": {
    "extensions": ["./index.ts"]
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "keywords": ["pi-package", "pi", "coding-agent", "extension", "hashline"],
  "license": "MIT",
  "dependencies": {
    "diff": "^8.0.2",
    "xxhashjs": "^0.2.2",
    "tree-sitter": "0.22.4",
    "tree-sitter-cpp": "0.23.4",
    "tree-sitter-rust": "0.23.3",
    "tree-sitter-clojure": "github:ghoseb/tree-sitter-clojure#78928e6",
    "ts-morph": "27.0.2"
  },
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@sinclair/typebox": "*"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/xxhashjs": "^0.2.4",
    "@mariozechner/pi-coding-agent": "^0.52.9",
    "@sinclair/typebox": "^0.34.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 2 — Verify**
Run: `npm install`
Expected: exits 0, `node_modules/` created. Peer dependency warnings about tree-sitter-cpp are expected and harmless.

**Covers AC:** 1, 2, 3, 4, 5

---

### Task 2: Create tsconfig.json [no-test] [depends: 1]

**Justification:** Config-only — TypeScript compiler configuration. No runtime behavior. Verified by `npx tsc --noEmit` accepting the empty project.

**Files:**
- Create: `tsconfig.json`

**Step 1 — Make the change**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["index.ts", "src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "scripts"]
}
```

Note: `noUncheckedIndexedAccess` is intentionally omitted to avoid spurious errors from upstream code that was not written with that constraint.

**Step 2 — Verify**
Run: `npx tsc --noEmit`
Expected: exits 0 with no output (no source files to typecheck yet).

**Covers AC:** 6

---

### Task 3: Create vitest.config.ts [no-test] [depends: 1]

**Justification:** Config-only — test runner configuration. No runtime behavior. Verified by vitest resolving the config file.

**Files:**
- Create: `vitest.config.ts`

**Step 1 — Make the change**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 10000,
  },
});
```

**Step 2 — Verify**
Run: `npx vitest run 2>&1 | head -5`
Expected: vitest starts successfully and reports "no test files found" (no tests exist yet). Exits non-zero because no tests found, but the config itself is valid.

**Covers AC:** 7

---

### Task 4: Extension entry point exports a default function [TDD] [depends: 2, 3]

**Files:**
- Test: `tests/entry-point.test.ts`
- Create: `index.ts`

**Step 1 — Write the failing test**

Create `tests/entry-point.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("extension entry point (AC8)", () => {
  it("index.ts exists at project root", () => {
    expect(existsSync(resolve(root, "index.ts"))).toBe(true);
  });

  it("index.ts exports a default function", async () => {
    const mod = await import(resolve(root, "index.ts"));
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/entry-point.test.ts`
Expected: FAIL — both tests fail. The first because `index.ts` does not exist:
```
FAIL  tests/entry-point.test.ts > extension entry point (AC8) > index.ts exists at project root
AssertionError: expected false to be true
```

**Step 3 — Write minimal implementation**

Copy `index.ts` from the hashline-edit upstream package:

```bash
cp /tmp/pi-upstream/hashline-pkg/index.ts .
```

This file already exports `default function (pi: ExtensionAPI): void` (confirmed by inspection of the upstream source). It imports from `./src/edit`, `./src/grep`, `./src/read` — those files don't exist yet, but vitest will resolve the dynamic import regardless because it only needs to check the export shape. However, if the import fails at runtime, we need the src files too. To keep this task minimal and self-contained, also copy the required source files:

```bash
mkdir -p src
cp /tmp/pi-upstream/hashline-pkg/src/edit-diff.ts \
   /tmp/pi-upstream/hashline-pkg/src/edit.ts \
   /tmp/pi-upstream/hashline-pkg/src/grep.ts \
   /tmp/pi-upstream/hashline-pkg/src/hashline.ts \
   /tmp/pi-upstream/hashline-pkg/src/path-utils.ts \
   /tmp/pi-upstream/hashline-pkg/src/read.ts \
   /tmp/pi-upstream/hashline-pkg/src/runtime.ts \
   src/
```

No modifications needed. Hashline-edit uses extensionless relative imports (e.g., `from "./hashline"`) which are compatible with `moduleResolution: "bundler"`.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/entry-point.test.ts`
Expected: PASS — both tests pass. `index.ts` exists and its default export is a function.

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all tests passing (2 tests in 1 file).

**Covers AC:** 8

---

### Task 5: Hashline-edit source files exist [TDD] [depends: 4]

**Files:**
- Test: `tests/hashline-files.test.ts`

**Step 1 — Write the failing test**

Create `tests/hashline-files.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("hashline-edit source files (AC9)", () => {
  const requiredFiles = [
    "src/read.ts",
    "src/edit.ts",
    "src/grep.ts",
    "src/hashline.ts",
    "src/path-utils.ts",
    "src/runtime.ts",
  ];

  for (const file of requiredFiles) {
    it(`${file} exists`, () => {
      expect(existsSync(resolve(root, file))).toBe(true);
    });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/hashline-files.test.ts`
Expected: PASS — all 6 tests pass because Task 4 already copied these files. This test codifies the AC9 contract. If it passes immediately, proceed to Step 5 (no Step 3 needed).

Note: This test passes immediately because Task 4 copied the hashline source files as a dependency of `index.ts`. The test's value is regression protection — ensuring these files are never accidentally deleted.

**Step 3 — Write minimal implementation**

No implementation needed — files already exist from Task 4.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/hashline-files.test.ts`
Expected: PASS — 6 tests pass.

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all tests passing (8 tests across 2 files).

**Covers AC:** 9

---

### Task 6: Read-map library files exist [TDD] [depends: 2, 3]

**Files:**
- Test: `tests/readmap-files.test.ts`
- Create: `src/readmap/mapper.ts`
- Create: `src/readmap/formatter.ts`
- Create: `src/readmap/language-detect.ts`
- Create: `src/readmap/types.ts`
- Create: `src/readmap/enums.ts`
- Create: `src/readmap/constants.ts`
- Create: `src/readmap/mappers/typescript.ts`
- Create: `src/readmap/mappers/python.ts`
- Create: `src/readmap/mappers/go.ts`
- Create: `src/readmap/mappers/rust.ts`
- Create: `src/readmap/mappers/json.ts`
- Create: `src/readmap/mappers/markdown.ts`
- Create: `src/readmap/mappers/fallback.ts`
- Create: `src/readmap/mappers/c.ts`
- Create: `src/readmap/mappers/cpp.ts`
- Create: `src/readmap/mappers/clojure.ts`
- Create: `src/readmap/mappers/sql.ts`
- Create: `src/readmap/mappers/jsonl.ts`
- Create: `src/readmap/mappers/yaml.ts`
- Create: `src/readmap/mappers/toml.ts`
- Create: `src/readmap/mappers/csv.ts`
- Create: `src/readmap/mappers/ctags.ts`

**Step 1 — Write the failing test**

Create `tests/readmap-files.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("read-map core library files (AC10)", () => {
  const coreFiles = [
    "src/readmap/mapper.ts",
    "src/readmap/formatter.ts",
    "src/readmap/language-detect.ts",
    "src/readmap/types.ts",
    "src/readmap/constants.ts",
  ];

  for (const file of coreFiles) {
    it(`${file} exists`, () => {
      expect(existsSync(resolve(root, file))).toBe(true);
    });
  }
});

describe("read-map language mapper files (AC11)", () => {
  const requiredMappers = [
    "typescript.ts",
    "python.ts",
    "go.ts",
    "rust.ts",
    "json.ts",
    "markdown.ts",
    "fallback.ts",
  ];

  for (const mapper of requiredMappers) {
    it(`src/readmap/mappers/${mapper} exists`, () => {
      expect(existsSync(resolve(root, `src/readmap/mappers/${mapper}`))).toBe(true);
    });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/readmap-files.test.ts`
Expected: FAIL — all 12 tests fail because `src/readmap/` does not exist:
```
FAIL  tests/readmap-files.test.ts > read-map core library files (AC10) > src/readmap/mapper.ts exists
AssertionError: expected false to be true
```

**Step 3 — Write minimal implementation**

The read-map package is pre-extracted at `/tmp/pi-read-map-pkg/`. Copy library files into `src/readmap/`:

```bash
mkdir -p src/readmap/mappers

# Core files (do NOT copy src/index.ts — that's the upstream extension entry point, not needed here)
cp /tmp/pi-read-map-pkg/src/mapper.ts \
   /tmp/pi-read-map-pkg/src/formatter.ts \
   /tmp/pi-read-map-pkg/src/language-detect.ts \
   /tmp/pi-read-map-pkg/src/types.ts \
   /tmp/pi-read-map-pkg/src/enums.ts \
   /tmp/pi-read-map-pkg/src/constants.ts \
   src/readmap/

# All mapper files (16 language mappers)
cp /tmp/pi-read-map-pkg/src/mappers/*.ts src/readmap/mappers/
```

The read-map package uses `.js` extensions in relative imports (e.g., `from "./types.js"`). Strip these for consistency with the hashline codebase which uses extensionless imports:

```bash
node --input-type=module << 'EOF'
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

function fixImports(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      fixImports(fullPath);
    } else if (entry.name.endsWith(".ts")) {
      const original = readFileSync(fullPath, "utf8");
      const fixed = original.replace(/(from\s+['"])(\.[^'"]+)\.js(['"])/g, "$1$2$3");
      if (fixed !== original) writeFileSync(fullPath, fixed);
    }
  }
}

fixImports("src/readmap");
console.log("Done: removed .js extensions from relative imports in src/readmap/");
EOF
```

Verify no `.js` remnants:
```bash
grep -rn "from ['\"]\..*\.js['\"]" src/readmap/ && echo "ERROR: .js imports still present" || echo "OK: all .js extensions removed"
```
Expected output: `OK: all .js extensions removed`

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/readmap-files.test.ts`
Expected: PASS — all 12 tests pass.

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all tests passing (20 tests across 3 files: 2 + 6 + 12).

**Covers AC:** 10, 11

---

### Task 7: RTK technique files exist and forbidden files are absent [TDD] [depends: 2, 3]

**Files:**
- Test: `tests/rtk-files.test.ts`
- Create: `src/rtk/ansi.ts`
- Create: `src/rtk/build.ts`
- Create: `src/rtk/test-output.ts`
- Create: `src/rtk/git.ts`
- Create: `src/rtk/linter.ts`
- Create: `src/rtk/truncate.ts`

**Step 1 — Write the failing test**

Create `tests/rtk-files.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("RTK technique files are present (AC12)", () => {
  const requiredFiles = [
    "src/rtk/ansi.ts",
    "src/rtk/build.ts",
    "src/rtk/test-output.ts",
    "src/rtk/git.ts",
    "src/rtk/linter.ts",
    "src/rtk/truncate.ts",
  ];

  for (const file of requiredFiles) {
    it(`${file} exists`, () => {
      expect(existsSync(resolve(root, file))).toBe(true);
    });
  }
});

describe("RTK forbidden files are absent (AC13)", () => {
  it("no source.ts exists anywhere under src/rtk/", () => {
    const rtkDir = resolve(root, "src/rtk");
    if (!existsSync(rtkDir)) return; // dir doesn't exist yet — absence satisfied
    const files = readdirSync(rtkDir, { recursive: true }) as string[];
    const forbidden = files.filter((f) => String(f).endsWith("source.ts"));
    expect(forbidden).toEqual([]);
  });

  it("no search.ts exists anywhere under src/rtk/", () => {
    const rtkDir = resolve(root, "src/rtk");
    if (!existsSync(rtkDir)) return; // dir doesn't exist yet — absence satisfied
    const files = readdirSync(rtkDir, { recursive: true }) as string[];
    const forbidden = files.filter((f) => String(f).endsWith("search.ts"));
    expect(forbidden).toEqual([]);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/rtk-files.test.ts`
Expected: FAIL — the 6 "present" tests fail because `src/rtk/` does not exist. The 2 "absent" tests pass (directory doesn't exist, absence satisfied). Overall suite fails:
```
FAIL  tests/rtk-files.test.ts > RTK technique files are present (AC12) > src/rtk/ansi.ts exists
AssertionError: expected false to be true
```

**Step 3 — Write minimal implementation**

Copy only the 6 technique files from the RTK upstream, explicitly omitting `source.ts`, `search.ts`, and `index.ts`:

```bash
mkdir -p src/rtk

cp /tmp/pi-upstream/rtk-pkg/techniques/ansi.ts \
   /tmp/pi-upstream/rtk-pkg/techniques/build.ts \
   /tmp/pi-upstream/rtk-pkg/techniques/test-output.ts \
   /tmp/pi-upstream/rtk-pkg/techniques/git.ts \
   /tmp/pi-upstream/rtk-pkg/techniques/linter.ts \
   /tmp/pi-upstream/rtk-pkg/techniques/truncate.ts \
   src/rtk/
```

All 6 RTK technique files are self-contained with zero imports (confirmed by `grep -n '^import ' /tmp/pi-upstream/rtk-pkg/techniques/*.ts` returning empty) — no path adjustments needed.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/rtk-files.test.ts`
Expected: PASS — all 8 tests pass (6 present + 2 absent).

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all tests passing (28 tests across 4 files: 2 + 6 + 12 + 8).

**Covers AC:** 12, 13

---

### Task 8: Outline scripts exist [TDD] [depends: 6]

**Files:**
- Test: `tests/scripts-files.test.ts`
- Create: `scripts/python_outline.py`
- Create: `scripts/go_outline.go`

**Step 1 — Write the failing test**

Create `tests/scripts-files.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

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
Run: `npx vitest run tests/scripts-files.test.ts`
Expected: FAIL — both tests fail because `scripts/` does not exist:
```
FAIL  tests/scripts-files.test.ts > outline scripts (AC14) > scripts/python_outline.py exists
AssertionError: expected false to be true
```

**Step 3 — Write minimal implementation**

Copy scripts from the read-map upstream (already extracted at `/tmp/pi-read-map-pkg/` by Task 6):

```bash
mkdir -p scripts

cp /tmp/pi-read-map-pkg/scripts/python_outline.py scripts/
cp /tmp/pi-read-map-pkg/scripts/go_outline.go scripts/
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/scripts-files.test.ts`
Expected: PASS — both tests pass.

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all tests passing (30 tests across 5 files: 2 + 6 + 12 + 8 + 2).

**Covers AC:** 14

---

### Task 9: Prompt files exist [TDD] [depends: 2, 3]

**Files:**
- Test: `tests/prompts-files.test.ts`
- Create: `prompts/read.md`
- Create: `prompts/edit.md`

**Step 1 — Write the failing test**

Create `tests/prompts-files.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("prompt files (AC15)", () => {
  it("prompts/ directory exists", () => {
    expect(existsSync(resolve(root, "prompts"))).toBe(true);
  });

  it("prompts/ contains at least one .md file", () => {
    const promptsDir = resolve(root, "prompts");
    const files = readdirSync(promptsDir);
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    expect(mdFiles.length).toBeGreaterThanOrEqual(1);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/prompts-files.test.ts`
Expected: FAIL — the first test fails because `prompts/` does not exist:
```
FAIL  tests/prompts-files.test.ts > prompt files (AC15) > prompts/ directory exists
AssertionError: expected false to be true
```

**Step 3 — Write minimal implementation**

Copy prompt files from the hashline-edit upstream:

```bash
mkdir -p prompts

cp /tmp/pi-upstream/hashline-pkg/prompts/read.md \
   /tmp/pi-upstream/hashline-pkg/prompts/edit.md \
   prompts/
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/prompts-files.test.ts`
Expected: PASS — both tests pass. `prompts/` exists and contains 2 `.md` files.

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all tests passing (32 tests across 6 files: 2 + 6 + 12 + 8 + 2 + 2).

**Covers AC:** 15

---

### Task 10: Clean TypeScript compilation [no-test] [depends: 4, 5, 6, 7, 8, 9]

**Justification:** AC16 is "tsc --noEmit exits with code 0" — the acceptance criterion IS the verification command. No vitest test can meaningfully wrap this; tsc itself is the test. This task may require fixing type errors in copied upstream sources.

**Files:** potentially any file under `src/` or `index.ts` (only to fix type errors)

**Step 1 — Make the change**

Run TypeScript compilation check:

```bash
npx tsc --noEmit
```

If `tsc` exits 0: no action required — proceed to Step 2.

If `tsc` reports errors, apply the relevant fix from this list of known potential issues:

| Error pattern | Cause | Fix |
|---|---|---|
| `TS1205: Re-exporting a type when 'verbatimModuleSyntax'` | strict re-export | Change `export { X }` to `export type { X }` |
| `TS2307: Cannot find module './foo.js'` | `.js` extension not stripped | Re-run the import-fix script from Task 6 Step 3 on the flagged directory |
| `TS7006: Parameter implicitly has an 'any' type` | Missing type annotation in upstream | Add explicit `: unknown` or the correct type |
| `TS2305: Module has no exported member` | Export mismatch between upstream packages | Update the import to match the actual export |

Apply only the minimal fixes necessary for `tsc --noEmit` to exit 0. Do not refactor or restructure.

**Step 2 — Verify**
Run: `npx tsc --noEmit`
Expected: exits 0 with no output (zero type errors across all source files).

**Covers AC:** 16

---

### Task 11: Full test suite passes [no-test] [depends: 10]

**Justification:** AC17 is "npm test exits with code 0" — the acceptance criterion IS the verification command. This is a final integration check confirming all prior TDD tasks' tests still pass after any type-error fixes applied in Task 10.

**Files:** none (no new code)

**Step 1 — Make the change**

No code changes. Run the full test suite:

```bash
npm test
```

**Step 2 — Verify**
Run: `npm test`
Expected: exits 0. Vitest discovers and runs 32 tests across 6 test files, all passing:
```
 ✓ tests/entry-point.test.ts (2)
 ✓ tests/hashline-files.test.ts (6)
 ✓ tests/readmap-files.test.ts (12)
 ✓ tests/rtk-files.test.ts (8)
 ✓ tests/scripts-files.test.ts (2)
 ✓ tests/prompts-files.test.ts (2)

 Test Files  6 passed (6)
 Tests       32 passed (32)
```

**Covers AC:** 17