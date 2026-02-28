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
| 7 (vitest.config.ts) | 2 |
| 8 (index.ts entry point) | 3 |
| 9 (hashline src files) | 3 |
| 10 (readmap core files) | 4 |
| 11 (readmap mappers) | 4 |
| 12 (RTK technique files) | 5 |
| 13 (no source.ts/search.ts) | 5 |
| 14 (scripts) | 6 |
| 15 (prompts) | 3 |
| 16 (tsc --noEmit) | 7 |
| 17 (npm test passes) | 7 |

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

### Task 2: Create TypeScript and Vitest config [no-test] [depends: 1]

**Justification:** Config-only — TypeScript compiler and test runner configuration. No runtime behavior introduced. Verified by `tsc --noEmit` accepting the (empty) project.

**Files:**
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

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
Run: `npx tsc --noEmit`
Expected: exits 0, no output (no source files to typecheck yet; the config is valid and vitest is installed).

**Covers AC:** 6, 7

---

### Task 3: Hashline-edit source files are present [TDD] [depends: 1, 2]

**Files:**
- Create: `tests/hashline-files.test.ts`
- Create: `index.ts`
- Create: `src/edit-diff.ts`
- Create: `src/edit.ts`
- Create: `src/grep.ts`
- Create: `src/hashline.ts`
- Create: `src/path-utils.ts`
- Create: `src/read.ts`
- Create: `src/runtime.ts`
- Create: `prompts/read.md`
- Create: `prompts/edit.md`

**Step 1 — Write the failing test**

Create `tests/hashline-files.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("hashline-edit source files", () => {
  it("index.ts exists at project root", () => {
    expect(existsSync(resolve(root, "index.ts"))).toBe(true);
  });

  it("src/edit-diff.ts exists", () => {
    expect(existsSync(resolve(root, "src/edit-diff.ts"))).toBe(true);
  });

  it("src/edit.ts exists", () => {
    expect(existsSync(resolve(root, "src/edit.ts"))).toBe(true);
  });

  it("src/grep.ts exists", () => {
    expect(existsSync(resolve(root, "src/grep.ts"))).toBe(true);
  });

  it("src/hashline.ts exists", () => {
    expect(existsSync(resolve(root, "src/hashline.ts"))).toBe(true);
  });

  it("src/path-utils.ts exists", () => {
    expect(existsSync(resolve(root, "src/path-utils.ts"))).toBe(true);
  });

  it("src/read.ts exists", () => {
    expect(existsSync(resolve(root, "src/read.ts"))).toBe(true);
  });

  it("src/runtime.ts exists", () => {
    expect(existsSync(resolve(root, "src/runtime.ts"))).toBe(true);
  });

  it("prompts/read.md exists", () => {
    expect(existsSync(resolve(root, "prompts/read.md"))).toBe(true);
  });

  it("prompts/edit.md exists", () => {
    expect(existsSync(resolve(root, "prompts/edit.md"))).toBe(true);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/hashline-files.test.ts`
Expected: FAIL — 10 tests fail because none of the files exist yet:
```
FAIL  tests/hashline-files.test.ts > hashline-edit source files > index.ts exists at project root
AssertionError: expected false to be true
```

**Step 3 — Write minimal implementation**

The hashline-edit package is pre-extracted at `/tmp/pi-upstream/hashline-pkg/`. Copy all source files verbatim:

```bash
mkdir -p src prompts

cp /tmp/pi-upstream/hashline-pkg/index.ts .

cp /tmp/pi-upstream/hashline-pkg/src/edit-diff.ts \
   /tmp/pi-upstream/hashline-pkg/src/edit.ts \
   /tmp/pi-upstream/hashline-pkg/src/grep.ts \
   /tmp/pi-upstream/hashline-pkg/src/hashline.ts \
   /tmp/pi-upstream/hashline-pkg/src/path-utils.ts \
   /tmp/pi-upstream/hashline-pkg/src/read.ts \
   /tmp/pi-upstream/hashline-pkg/src/runtime.ts \
   src/

cp /tmp/pi-upstream/hashline-pkg/prompts/read.md \
   /tmp/pi-upstream/hashline-pkg/prompts/edit.md \
   prompts/
```

No modifications are needed. Hashline-edit uses extensionless relative imports (e.g., `from "./hashline"`) which are compatible with `moduleResolution: "bundler"`.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/hashline-files.test.ts`
Expected: PASS — all 10 tests pass.

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all tests passing (only `tests/hashline-files.test.ts` exists at this point — 10 passing).

**Covers AC:** 8, 9, 15

---

### Task 4: Read-map library files are present [TDD] [depends: 1, 2]

**Files:**
- Create: `tests/readmap-files.test.ts`
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

describe("read-map core library files", () => {
  it("src/readmap/mapper.ts exists", () => {
    expect(existsSync(resolve(root, "src/readmap/mapper.ts"))).toBe(true);
  });

  it("src/readmap/formatter.ts exists", () => {
    expect(existsSync(resolve(root, "src/readmap/formatter.ts"))).toBe(true);
  });

  it("src/readmap/language-detect.ts exists", () => {
    expect(existsSync(resolve(root, "src/readmap/language-detect.ts"))).toBe(true);
  });

  it("src/readmap/types.ts exists", () => {
    expect(existsSync(resolve(root, "src/readmap/types.ts"))).toBe(true);
  });

  it("src/readmap/constants.ts exists", () => {
    expect(existsSync(resolve(root, "src/readmap/constants.ts"))).toBe(true);
  });
});

describe("read-map language mapper files (required by AC11)", () => {
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
Expected: FAIL — 12 tests fail because the `src/readmap/` directory does not exist:
```
FAIL  tests/readmap-files.test.ts > read-map core library files > src/readmap/mapper.ts exists
AssertionError: expected false to be true
```

**Step 3 — Write minimal implementation**

Fetch and extract the read-map package (v1.3.0 published on npm as `pi-read-map`):

```bash
cd /tmp && npm pack pi-read-map@1.3.0 2>/dev/null
tar -xzf /tmp/pi-read-map-1.3.0.tgz -C /tmp
mv /tmp/package /tmp/pi-read-map-pkg
```

Copy library files into `src/readmap/`:

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

The read-map package uses `.js` extensions in relative imports (e.g., `from "./types.js"`). With `moduleResolution: "bundler"` TypeScript resolves these correctly at compile time, but strip them for consistency with the rest of the codebase:

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
      const fixed = original.replace(/(from\s+['"])(\.[^'"]+)\.js(['"'])/g, "$1$2$3");
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
Expected: all tests passing (22 total: 10 from Task 3, 12 from this task).

**Covers AC:** 10, 11

---

### Task 5: RTK technique files are present [TDD] [depends: 1, 2]

**Files:**
- Create: `tests/rtk-files.test.ts`
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
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("RTK technique files are present", () => {
  it("src/rtk/ansi.ts exists", () => {
    expect(existsSync(resolve(root, "src/rtk/ansi.ts"))).toBe(true);
  });

  it("src/rtk/build.ts exists", () => {
    expect(existsSync(resolve(root, "src/rtk/build.ts"))).toBe(true);
  });

  it("src/rtk/test-output.ts exists", () => {
    expect(existsSync(resolve(root, "src/rtk/test-output.ts"))).toBe(true);
  });

  it("src/rtk/git.ts exists", () => {
    expect(existsSync(resolve(root, "src/rtk/git.ts"))).toBe(true);
  });

  it("src/rtk/linter.ts exists", () => {
    expect(existsSync(resolve(root, "src/rtk/linter.ts"))).toBe(true);
  });

  it("src/rtk/truncate.ts exists", () => {
    expect(existsSync(resolve(root, "src/rtk/truncate.ts"))).toBe(true);
  });
});

describe("RTK forbidden files are absent (AC13)", () => {
  it("src/rtk/source.ts does NOT exist anywhere under src/rtk/", () => {
    // Checks the direct path; the find-based verification in Step 2 checks recursively
    expect(existsSync(resolve(root, "src/rtk/source.ts"))).toBe(false);
  });

  it("src/rtk/search.ts does NOT exist anywhere under src/rtk/", () => {
    expect(existsSync(resolve(root, "src/rtk/search.ts"))).toBe(false);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/rtk-files.test.ts`
Expected: FAIL — the 6 "present" tests fail because `src/rtk/` does not exist yet. The 2 "absent" tests pass (files don't exist). Overall suite fails:
```
FAIL  tests/rtk-files.test.ts > RTK technique files are present > src/rtk/ansi.ts exists
AssertionError: expected false to be true
```

**Step 3 — Write minimal implementation**

The RTK package is pre-extracted at `/tmp/pi-upstream/rtk-pkg/`. Copy only the 6 technique files — explicitly omitting `source.ts`, `search.ts`, and `index.ts`:

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

All 6 RTK technique files are self-contained with zero imports — no path adjustments needed.

Verify forbidden files are absent (recursive check per AC13):
```bash
find src/rtk -name "source.ts" -o -name "search.ts"
```
Expected: no output (both files are absent).

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/rtk-files.test.ts`
Expected: PASS — all 8 tests pass (6 present + 2 absent).

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all tests passing (30 total: 10 + 12 + 8).

**Covers AC:** 12, 13

---

### Task 6: Outline scripts are present [no-test] [depends: 4]

**Justification:** The scripts are Python and Go files — not TypeScript — so they cannot be imported or tested by vitest. File presence is the only meaningful check. Task 4 already extracted the read-map package to `/tmp/pi-read-map-pkg/`; this task copies the scripts from that pre-existing extraction.

**Files:**
- Create: `scripts/python_outline.py`
- Create: `scripts/go_outline.go`

**Step 1 — Make the change**

```bash
mkdir -p scripts

cp /tmp/pi-read-map-pkg/scripts/python_outline.py scripts/
cp /tmp/pi-read-map-pkg/scripts/go_outline.go scripts/
```

**Step 2 — Verify**
Run: `ls scripts/python_outline.py scripts/go_outline.go`
Expected: both files listed, exits 0.

Run: `npm test`
Expected: all 30 tests still passing (no regressions from a file copy).

**Covers AC:** 14

---

### Task 7: Verify clean build and all tests pass [no-test] [depends: 3, 4, 5, 6]

**Justification:** AC16 (`tsc --noEmit` exits 0) and AC17 (`npm test` exits 0) ARE the verification steps — the "test" is the exit code of these two commands. No new behavior is introduced; this task confirms that all copied upstream sources compile together cleanly under our shared tsconfig. The tests from Tasks 3–5 provide the passing test count that satisfies AC17.

**Files:** none (no new code)

**Step 1 — Make the change**

Run TypeScript compilation check:

```bash
npx tsc --noEmit
```

If `tsc` exits 0: no action required — proceed to Step 2.

If `tsc` reports errors, apply the relevant fix from this list of known potential issues:

| Error pattern | Cause | Fix |
|---|---|---|
| `TS1205: Re-exporting a type when using 'isolatedModules' requires using 'export type'` | `verbatimModuleSyntax` strict re-export | Change `export { SomeName }` to `export type { SomeName }` in the flagged file |
| `TS2307: Cannot find module './foo.js'` | `.js` extension not stripped | Re-run the Node.js import-fix script from Task 4 Step 3 on the flagged directory |
| `TS7006: Parameter implicitly has an 'any' type` | Missing parameter type in upstream code | Add explicit `: unknown` or the correct type to the flagged parameter |

**Step 2 — Verify**

Run: `npx tsc --noEmit`
Expected: exits 0 with no output (zero type errors across all source files).

Run: `npm test`
Expected: exits 0. Vitest discovers and runs 30 tests across 3 test files, all passing:
```
 ✓ tests/hashline-files.test.ts (10)
 ✓ tests/readmap-files.test.ts (12)
 ✓ tests/rtk-files.test.ts (8)

 Test Files  3 passed (3)
 Tests       30 passed (30)
```

**Covers AC:** 16, 17
