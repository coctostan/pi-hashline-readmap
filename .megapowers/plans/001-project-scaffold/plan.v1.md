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

**Justification:** Config-only — creates the package manifest. Verified by `npm install` succeeding.

**Files:**
- Create: `package.json`

**Step 1 — Make the change**

Create `package.json` at the project root. Key fields:
- `name`: `"pi-hashline-readmap"`
- `type`: `"module"`
- `pi.extensions`: `["./index.ts"]`
- Dependencies from hashline-edit: `"diff": "^8.0.2"`, `"xxhashjs": "^0.2.2"`
- Dependencies from read-map: `"tree-sitter": "0.22.4"`, `"tree-sitter-cpp": "0.23.4"`, `"tree-sitter-rust": "0.23.3"`, `"tree-sitter-clojure": "github:ghoseb/tree-sitter-clojure#78928e6"`, `"ts-morph": "27.0.2"`
- devDependencies: `"vitest": "^3.0.0"`, `"typescript": "^5.7.0"`, `"@types/node": "^22.0.0"`, `"@types/xxhashjs": "^0.2.4"`, `"@mariozechner/pi-coding-agent": "^0.52.9"`, `"@sinclair/typebox": "^0.34.0"`
- peerDependencies: `"@mariozechner/pi-coding-agent": "*"`, `"@sinclair/typebox": "*"`
- scripts: `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`

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
Expected: exits 0, `node_modules/` created, no missing peer dependency errors (warnings about tree-sitter-cpp peer dep are expected and harmless)

**Covers AC:** 1, 2, 3, 4, 5

---

### Task 2: Create TypeScript and Vitest config [no-test] [depends: 1]

**Justification:** Config-only — TypeScript and test runner config. Verified by `tsc --noEmit` on an empty project.

**Files:**
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

**Step 1 — Make the change**

Create `tsconfig.json` (based on read-map's config, compatible with pi extensions):

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
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["index.ts", "src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "scripts"]
}
```

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
Expected: exits 0 (no source files to check yet, but config is valid)

**Covers AC:** 6, 7

---

### Task 3: Copy hashline-edit source files [no-test] [depends: 1, 2]

**Justification:** Copies source from upstream npm package. No behavior change — verified by compilation in Task 7.

**Files:**
- Create: `index.ts` (from pi-hashline-edit)
- Create: `src/read.ts` (from pi-hashline-edit)
- Create: `src/edit.ts` (from pi-hashline-edit)
- Create: `src/edit-diff.ts` (from pi-hashline-edit)
- Create: `src/grep.ts` (from pi-hashline-edit)
- Create: `src/hashline.ts` (from pi-hashline-edit)
- Create: `src/path-utils.ts` (from pi-hashline-edit)
- Create: `src/runtime.ts` (from pi-hashline-edit)
- Create: `prompts/read.md` (from pi-hashline-edit)
- Create: `prompts/edit.md` (from pi-hashline-edit)

**Step 1 — Make the change**

Copy all source files from the pi-hashline-edit npm package (v0.3.0) into the project:
- `index.ts` → `index.ts` (project root)
- `src/*.ts` → `src/*.ts`
- `prompts/*.md` → `prompts/*.md`

These files are copied verbatim. No modifications needed — hashline-edit uses relative imports (`./src/edit`, `./hashline`, etc.) that will resolve correctly in the new structure.

Source: `npm pack pi-hashline-edit@0.3.0` or extract from `/tmp/pi-upstream/hashline-pkg/`

**Step 2 — Verify**
Run: `ls index.ts src/read.ts src/edit.ts src/edit-diff.ts src/grep.ts src/hashline.ts src/path-utils.ts src/runtime.ts prompts/read.md prompts/edit.md`
Expected: all files exist, no errors

**Covers AC:** 8, 9, 15

---

### Task 4: Copy read-map mapper library [no-test] [depends: 1, 2]

**Justification:** Copies library source from upstream. No behavior change — verified by compilation in Task 7.

**Files:**
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
- Create: `src/readmap/mappers/c.ts`
- Create: `src/readmap/mappers/cpp.ts`
- Create: `src/readmap/mappers/clojure.ts`
- Create: `src/readmap/mappers/sql.ts`
- Create: `src/readmap/mappers/json.ts`
- Create: `src/readmap/mappers/jsonl.ts`
- Create: `src/readmap/mappers/yaml.ts`
- Create: `src/readmap/mappers/toml.ts`
- Create: `src/readmap/mappers/csv.ts`
- Create: `src/readmap/mappers/markdown.ts`
- Create: `src/readmap/mappers/ctags.ts`
- Create: `src/readmap/mappers/fallback.ts`

**Step 1 — Make the change**

Copy read-map's library code from the cloned repo at `/tmp/pi-github-repos/Whamp/pi-read-map/src/` into `src/readmap/`:
- `mapper.ts`, `formatter.ts`, `language-detect.ts`, `types.ts`, `enums.ts`, `constants.ts` → `src/readmap/`
- `mappers/*.ts` (all 16 files) → `src/readmap/mappers/`

**Do NOT copy** `src/index.ts` from read-map — that's the pi extension entry point we don't need.

**Import path fix:** All read-map files use `.js` extensions in imports (e.g., `from "./types.js"`). These need to be changed to extensionless imports (e.g., `from "./types"`) to match the `moduleResolution: "bundler"` tsconfig and be consistent with hashline-edit's style.

Apply this transformation to all copied files:
```bash
# In all src/readmap/**/*.ts files:
# Replace: from "./types.js"    →  from "./types"
# Replace: from "./constants.js" →  from "./constants"
# etc. (strip .js from all relative imports)
sd '(from\s+["\'])(\.[^"\']*?)\.js(["\'])' '$1$2$3' src/readmap/*.ts src/readmap/mappers/*.ts
```

**Step 2 — Verify**
Run: `ls src/readmap/mapper.ts src/readmap/formatter.ts src/readmap/language-detect.ts src/readmap/types.ts src/readmap/constants.ts src/readmap/mappers/typescript.ts src/readmap/mappers/python.ts src/readmap/mappers/go.ts src/readmap/mappers/rust.ts src/readmap/mappers/json.ts src/readmap/mappers/markdown.ts src/readmap/mappers/fallback.ts`
Expected: all files exist

Run: `grep '\.js"' src/readmap/*.ts src/readmap/mappers/*.ts`
Expected: no matches (all .js extensions removed from imports)

**Covers AC:** 10, 11

---

### Task 5: Copy RTK technique files [no-test] [depends: 1, 2]

**Justification:** Copies technique files from upstream. No behavior change — verified by compilation in Task 7.

**Files:**
- Create: `src/rtk/ansi.ts`
- Create: `src/rtk/build.ts`
- Create: `src/rtk/test-output.ts`
- Create: `src/rtk/git.ts`
- Create: `src/rtk/linter.ts`
- Create: `src/rtk/truncate.ts`

**Step 1 — Make the change**

Copy 6 technique files from pi-rtk (v0.1.3) at `/tmp/pi-upstream/rtk-pkg/techniques/` into `src/rtk/`:
- `ansi.ts`, `build.ts`, `test-output.ts`, `git.ts`, `linter.ts`, `truncate.ts`

**Do NOT copy:**
- `source.ts` — would conflict with hashline's read tool
- `search.ts` — would conflict with hashline's grep tool
- `index.ts` — the barrel export includes source/search, not needed yet

Each technique file is self-contained with zero imports — they copy verbatim with no modifications needed.

**Step 2 — Verify**
Run: `ls src/rtk/ansi.ts src/rtk/build.ts src/rtk/test-output.ts src/rtk/git.ts src/rtk/linter.ts src/rtk/truncate.ts`
Expected: all 6 files exist

Run: `ls src/rtk/source.ts src/rtk/search.ts 2>&1`
Expected: "No such file or directory" for both

**Covers AC:** 12, 13

---

### Task 6: Copy outline scripts [no-test] [depends: 1]

**Justification:** Copies helper scripts from upstream. No code logic change.

**Files:**
- Create: `scripts/python_outline.py`
- Create: `scripts/go_outline.go`

**Step 1 — Make the change**

Copy from read-map repo at `/tmp/pi-github-repos/Whamp/pi-read-map/scripts/`:
- `python_outline.py` → `scripts/python_outline.py`
- `go_outline.go` → `scripts/go_outline.go`

These are standalone scripts called via subprocess by the Python and Go mappers. Copy verbatim.

**Step 2 — Verify**
Run: `ls scripts/python_outline.py scripts/go_outline.go`
Expected: both files exist

**Covers AC:** 14

---

### Task 7: Verify clean build and add smoke test [depends: 1, 2, 3, 4, 5, 6]

**Files:**
- Create: `tests/scaffold.test.ts`

**Step 1 — Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { resolve } from "path";

describe("project scaffold", () => {
  const root = resolve(import.meta.dirname, "..");

  it("index.ts exports a default function", async () => {
    const mod = await import(resolve(root, "index.ts"));
    expect(typeof mod.default).toBe("function");
  });

  it("readmap mapper module is importable", async () => {
    const mod = await import(resolve(root, "src/readmap/mapper.ts"));
    expect(mod.generateMap).toBeDefined();
  });

  it("readmap formatter module is importable", async () => {
    const mod = await import(resolve(root, "src/readmap/formatter.ts"));
    expect(mod.formatFileMapWithBudget).toBeDefined();
  });

  it("RTK ansi technique is importable", async () => {
    const mod = await import(resolve(root, "src/rtk/ansi.ts"));
    expect(typeof mod.stripAnsi).toBe("function");
  });

  it("RTK source.ts does not exist", () => {
    expect(existsSync(resolve(root, "src/rtk/source.ts"))).toBe(false);
  });

  it("RTK search.ts does not exist", () => {
    expect(existsSync(resolve(root, "src/rtk/search.ts"))).toBe(false);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/scaffold.test.ts`
Expected: FAIL — tests fail because files don't exist or aren't importable yet (if prior tasks aren't done). If prior tasks are done, some may pass already.

**Step 3 — Write minimal implementation**
No new production code — this task verifies that Tasks 1-6 produced a working scaffold. If any test fails:
1. Run `npx tsc --noEmit` to identify type errors
2. Fix import paths or missing type declarations as needed
3. Common fixes: missing type imports in read-map files, `.js` extension leftovers

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/scaffold.test.ts`
Expected: PASS — all 6 tests pass

**Step 5 — Verify no regressions**
Run: `npx tsc --noEmit && npx vitest run`
Expected: TypeScript compiles with 0 errors AND all tests pass

**Covers AC:** 16, 17
