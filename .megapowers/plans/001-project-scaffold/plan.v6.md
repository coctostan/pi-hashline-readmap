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
| 8 (index.ts exists + default function export) | 5 |
| 9 (hashline src files) | 4 |
| 10 (readmap core files) | 6 |
| 11 (readmap mappers) | 7 |
| 12 (RTK technique files) | 8 |
| 13 (no source.ts/search.ts in src/rtk) | 8 |
| 14 (scripts/python_outline.py + scripts/go_outline.go) | 9 |
| 15 (prompts dir with .md) | 10 |
| 16 (tsc --noEmit exits 0) | 11 |
| 17 (npm test exits 0) | 12 |

---

### Task 1: Initialize package.json with combined dependencies [no-test]

**Justification:** Config-only manifest creation. No runtime behavior is introduced.

**Files:**
- Create: `package.json`

**Step 1 — Make the change**

Create `package.json`:

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
Expected: exits 0 and installs dependencies.

**Covers AC:** 1, 2, 3, 4, 5

---

### Task 2: Create tsconfig.json [no-test] [depends: 1]

**Justification:** Compiler configuration only. No direct runtime behavior.

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

**Step 2 — Verify**
Run: `npx tsc --showConfig > /dev/null`
Expected: exits 0 (tsconfig parses and resolves correctly even before source files exist).

**Covers AC:** 6

---

### Task 3: Create vitest.config.ts [no-test] [depends: 1]

**Justification:** Test runner configuration only. No application behavior change.

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
Run: `npx vitest run --config vitest.config.ts --passWithNoTests`
Expected: exits 0 and reports no tests found (configuration successfully loaded).

**Covers AC:** 7

---

### Task 4: Hashline source files exist under src/ [TDD] [depends: 1, 3]

**Files:**
- Create: `tests/hashline-files.test.ts`
- Create: `src/edit-diff.ts`
- Create: `src/edit.ts`
- Create: `src/grep.ts`
- Create: `src/hashline.ts`
- Create: `src/path-utils.ts`
- Create: `src/read.ts`
- Create: `src/runtime.ts`

**Step 1 — Write the failing test**

Create `tests/hashline-files.test.ts`:

```typescript
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
    "src/runtime.ts",
  ];

  for (const file of required) {
    it(`${file} exists`, () => {
      expect(existsSync(resolve(root, file))).toBe(true);
    });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/hashline-files.test.ts`
Expected: FAIL — files are missing, e.g.:

```
FAIL  tests/hashline-files.test.ts > hashline source files (AC9) > src/read.ts exists
AssertionError: expected false to be true
```

**Step 3 — Write minimal implementation**

Copy hashline source files from upstream:

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

(`edit-diff.ts` is included because `read.ts`/`edit.ts` depend on it, even though AC9 does not explicitly list it.)

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/hashline-files.test.ts`
Expected: PASS (6 passing tests).

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all tests passing.

**Covers AC:** 9

---

### Task 5: Extension entry point exports default function [TDD] [depends: 1, 3, 4, 10]

**Note:** Depends on Task 10 because `src/read.ts` and `src/edit.ts` execute `readFileSync("../prompts/read.md")` and `readFileSync("../prompts/edit.md")` at module load time. Without prompt files present, the dynamic import will throw ENOENT.

**Files:**
- Create: `tests/entry-point.test.ts`
- Create: `index.ts`

**Step 1 — Write the failing test**

Create `tests/entry-point.test.ts`:

```typescript
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
    const entryPath = resolve(root, "index.ts");
    const mod = await import(pathToFileURL(entryPath).href);
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/entry-point.test.ts`
Expected: FAIL — `index.ts` missing, e.g.:

```
FAIL  tests/entry-point.test.ts > extension entry point (AC8) > index.ts exists
AssertionError: expected false to be true
```

**Step 3 — Write minimal implementation**

Copy hashline entry point:

```bash
cp /tmp/pi-upstream/hashline-pkg/index.ts .
```

No modifications required.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/entry-point.test.ts`
Expected: PASS (2 passing tests).

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all tests passing.

**Covers AC:** 8

---

### Task 6: Read-map core files exist under src/readmap/ [TDD] [depends: 1, 3]

**Files:**
- Create: `tests/readmap-core-files.test.ts`
- Create: `src/readmap/mapper.ts`
- Create: `src/readmap/formatter.ts`
- Create: `src/readmap/language-detect.ts`
- Create: `src/readmap/types.ts`
- Create: `src/readmap/enums.ts`
- Create: `src/readmap/constants.ts`

**Step 1 — Write the failing test**

Create `tests/readmap-core-files.test.ts`:

```typescript
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
    "src/readmap/constants.ts",
  ];

  for (const file of required) {
    it(`${file} exists`, () => {
      expect(existsSync(resolve(root, file))).toBe(true);
    });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/readmap-core-files.test.ts`
Expected: FAIL — core files missing, e.g.:

```
FAIL  tests/readmap-core-files.test.ts > read-map core files (AC10) > src/readmap/mapper.ts exists
AssertionError: expected false to be true
```

**Step 3 — Write minimal implementation**

Ensure upstream package is extracted, then copy core files:

```bash
if [ ! -d /tmp/pi-read-map-pkg ]; then
  cd /tmp
  npm pack pi-read-map@1.3.0 >/dev/null
  tar -xzf /tmp/pi-read-map-1.3.0.tgz -C /tmp
  mv /tmp/package /tmp/pi-read-map-pkg
fi

mkdir -p src/readmap

cp /tmp/pi-read-map-pkg/src/mapper.ts \
   /tmp/pi-read-map-pkg/src/formatter.ts \
   /tmp/pi-read-map-pkg/src/language-detect.ts \
   /tmp/pi-read-map-pkg/src/types.ts \
   /tmp/pi-read-map-pkg/src/enums.ts \
   /tmp/pi-read-map-pkg/src/constants.ts \
   src/readmap/
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/readmap-core-files.test.ts`
Expected: PASS (5 passing tests).

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all tests passing.

**Covers AC:** 10

---

### Task 7: Required read-map mapper files exist [TDD] [depends: 1, 3, 6]

**Files:**
- Create: `tests/readmap-mappers-files.test.ts`
- Create: `src/readmap/mappers/typescript.ts`
- Create: `src/readmap/mappers/python.ts`
- Create: `src/readmap/mappers/go.ts`
- Create: `src/readmap/mappers/rust.ts`
- Create: `src/readmap/mappers/json.ts`
- Create: `src/readmap/mappers/markdown.ts`
- Create: `src/readmap/mappers/fallback.ts`
- Create (also copied for compile completeness):
  - `src/readmap/mappers/c.ts`
  - `src/readmap/mappers/cpp.ts`
  - `src/readmap/mappers/clojure.ts`
  - `src/readmap/mappers/sql.ts`
  - `src/readmap/mappers/jsonl.ts`
  - `src/readmap/mappers/yaml.ts`
  - `src/readmap/mappers/toml.ts`
  - `src/readmap/mappers/csv.ts`
  - `src/readmap/mappers/ctags.ts`

**Step 1 — Write the failing test**

Create `tests/readmap-mappers-files.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("required read-map mappers (AC11)", () => {
  const required = [
    "typescript.ts",
    "python.ts",
    "go.ts",
    "rust.ts",
    "json.ts",
    "markdown.ts",
    "fallback.ts",
  ];

  for (const mapper of required) {
    it(`src/readmap/mappers/${mapper} exists`, () => {
      expect(existsSync(resolve(root, `src/readmap/mappers/${mapper}`))).toBe(true);
    });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/readmap-mappers-files.test.ts`
Expected: FAIL — mapper files missing, e.g.:

```
FAIL  tests/readmap-mappers-files.test.ts > required read-map mappers (AC11) > src/readmap/mappers/typescript.ts exists
AssertionError: expected false to be true
```

**Step 3 — Write minimal implementation**

Copy all mapper files from read-map, then normalize relative imports by stripping `.js` extensions:

```bash
mkdir -p src/readmap/mappers
cp /tmp/pi-read-map-pkg/src/mappers/*.ts src/readmap/mappers/

node --input-type=module << 'EOF'
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith('.ts')) {
      const src = readFileSync(full, 'utf8');
      const out = src.replace(/(from\s+['"])(\.[^'"]+)\.js(['"])/g, '$1$2$3');
      if (out !== src) writeFileSync(full, out);
    }
  }
}

walk('src/readmap');
EOF
```

Verify normalization:

```bash
grep -rn "from ['\"]\..*\.js['\"]" src/readmap && echo "ERROR: .js imports still present" || echo "OK: all .js extensions removed"
```

Expected output: `OK: all .js extensions removed`

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/readmap-mappers-files.test.ts`
Expected: PASS (7 passing tests).

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all tests passing.

**Covers AC:** 11

---

### Task 8: RTK technique files exist and forbidden files are absent [TDD] [depends: 1, 3]

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
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("RTK technique files (AC12)", () => {
  const required = [
    "src/rtk/ansi.ts",
    "src/rtk/build.ts",
    "src/rtk/test-output.ts",
    "src/rtk/git.ts",
    "src/rtk/linter.ts",
    "src/rtk/truncate.ts",
  ];

  for (const file of required) {
    it(`${file} exists`, () => {
      expect(existsSync(resolve(root, file))).toBe(true);
    });
  }
});

describe("RTK forbidden files (AC13)", () => {
  it("source.ts does not exist anywhere under src/rtk", () => {
    const rtk = resolve(root, "src/rtk");
    if (!existsSync(rtk)) return;
    const files = readdirSync(rtk, { recursive: true }) as string[];
    expect(files.filter((f) => String(f).endsWith("source.ts"))).toEqual([]);
  });

  it("search.ts does not exist anywhere under src/rtk", () => {
    const rtk = resolve(root, "src/rtk");
    if (!existsSync(rtk)) return;
    const files = readdirSync(rtk, { recursive: true }) as string[];
    expect(files.filter((f) => String(f).endsWith("search.ts"))).toEqual([]);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/rtk-files.test.ts`
Expected: FAIL — required files missing, e.g.:

```
FAIL  tests/rtk-files.test.ts > RTK technique files (AC12) > src/rtk/ansi.ts exists
AssertionError: expected false to be true
```

**Step 3 — Write minimal implementation**

Copy only allowed RTK files:

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

Do not copy `source.ts`, `search.ts`, or `index.ts`.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/rtk-files.test.ts`
Expected: PASS (8 passing tests).

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all tests passing.

**Covers AC:** 12, 13

---

### Task 9: Outline scripts exist [TDD] [depends: 1, 3, 6]

**Files:**
- Create: `tests/scripts-files.test.ts`
- Create: `scripts/python_outline.py`
- Create: `scripts/go_outline.go`

**Step 1 — Write the failing test**

Create `tests/scripts-files.test.ts`:

```typescript
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
Run: `npx vitest run tests/scripts-files.test.ts`
Expected: FAIL — scripts missing, e.g.:

```
FAIL  tests/scripts-files.test.ts > outline scripts (AC14) > scripts/python_outline.py exists
AssertionError: expected false to be true
```

**Step 3 — Write minimal implementation**

Copy scripts from extracted read-map package:

```bash
mkdir -p scripts
cp /tmp/pi-read-map-pkg/scripts/python_outline.py scripts/
cp /tmp/pi-read-map-pkg/scripts/go_outline.go scripts/
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/scripts-files.test.ts`
Expected: PASS (2 passing tests).

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all tests passing.

**Covers AC:** 14

---

### Task 10: Prompt files exist [TDD] [depends: 1, 3]

**Files:**
- Create: `tests/prompts-files.test.ts`
- Create: `prompts/read.md`
- Create: `prompts/edit.md`

**Step 1 — Write the failing test**

Create `tests/prompts-files.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("prompts directory (AC15)", () => {
  it("prompts/ exists", () => {
    expect(existsSync(resolve(root, "prompts"))).toBe(true);
  });

  it("prompts/ has at least one .md file", () => {
    const files = readdirSync(resolve(root, "prompts"));
    expect(files.some((f) => f.endsWith(".md"))).toBe(true);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/prompts-files.test.ts`
Expected: FAIL — prompts directory missing, e.g.:

```
FAIL  tests/prompts-files.test.ts > prompts directory (AC15) > prompts/ exists
AssertionError: expected false to be true
```

**Step 3 — Write minimal implementation**

Copy prompt files from hashline upstream:

```bash
mkdir -p prompts
cp /tmp/pi-upstream/hashline-pkg/prompts/read.md \
   /tmp/pi-upstream/hashline-pkg/prompts/edit.md \
   prompts/
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/prompts-files.test.ts`
Expected: PASS (2 passing tests).

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all tests passing.

**Covers AC:** 15

---

### Task 11: TypeScript compiles cleanly [no-test] [depends: 2, 4, 5, 6, 7, 8, 9, 10]

**Justification:** AC16 is itself a command-level verification (`tsc --noEmit` exit code). This is not a unit-testable behavior.

**Files:**
- Modify if needed: `index.ts`, `src/**/*` (only minimal type fixes if compiler errors appear)

**Step 1 — Make the change**

Run:

```bash
npx tsc --noEmit
```

If it fails, apply minimal fixes only for reported errors (e.g., missed `.js` import normalization or strict typing issues) until it passes.

**Step 2 — Verify**
Run: `npx tsc --noEmit`
Expected: exits 0 with zero type errors.

**Covers AC:** 16

---

### Task 12: Full test suite passes [no-test] [depends: 11]

**Justification:** AC17 is itself a command-level verification (`npm test` exit code).

**Files:** none

**Step 1 — Make the change**

No code changes. Run:

```bash
npm test
```

**Step 2 — Verify**
Run: `npm test`
Expected: exits 0 with all test files passing.

**Covers AC:** 17