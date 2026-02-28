# Plan Review: 001-project-scaffold

## Project conventions check
- `AGENTS.md` is not present in the repo root. Conventions are therefore inferred from the spec/plan: TypeScript + ESM + Vitest, tests under `tests/**/*.test.ts`, `npm test` runs Vitest.

---

## Per-Task Assessment

### Task 1: Initialize package.json with combined dependencies — ❌ REVISE
- **Self-containment risk:** Later tasks rely on copying upstream sources, but Task 1 doesn’t establish how upstream code is obtained/where it lives (see Tasks 4/5/8/10). Consider adding an explicit “fetch/extract upstream sources” task (or document that `/tmp/pi-upstream/...` is guaranteed by the harness).
- **Install reliability risk:** `tree-sitter-clojure` is specified as a GitHub dependency (`github:...#sha`). This can fail in environments without git/GitHub access and makes `npm install` less reproducible. Prefer a published npm version (or document why git dep is required and verify it works).
- **Version correctness risk:** `ts-morph` version `27.0.2` may not match what upstream uses; if it’s wrong, `npm install` will fail. Safer: derive versions from the upstream package(s) you’re vendoring.

### Task 2: Create tsconfig.json — ✅ PASS
No issues.

### Task 3: Create vitest.config.ts — ✅ PASS
No issues.

### Task 4: Hashline source files exist under src/ — ❌ REVISE
- **Self-containment:** Step 3 copies from `/tmp/pi-upstream/hashline-pkg/...` without any prior task that creates that directory. Add a preparatory task or include steps to fetch/extract hashline-edit sources.
- **Optional robustness:** You copy `src/edit-diff.ts` for compile completeness, but the test does not assert its existence. If it’s required for later `tsc --noEmit`, consider including it in the existence list (or explicitly state you’ll rely on Task 11 to catch missing transitive files).

### Task 5: Extension entry point exports default function — ❌ REVISE
- **Ordering/dependency violation:** Task 5 depends on Task 10, but Task 10 is scheduled later. This breaks the “tasks 1..N-1 provide prerequisites” rule.
  - Fix by **moving Task 10 before Task 5**, or (better) make `index.ts` a minimal stub that doesn’t import modules with prompt-file side effects.
- **Out-of-scope concern:** Copying the upstream hashline `index.ts` may introduce tool wiring/integration logic, which the spec says is out of scope (“No integration logic; just files, dependencies, and a clean build”). A minimal `index.ts` satisfying AC8 is more aligned: `export default function () {}`.
- **Self-containment:** Uses `/tmp/pi-upstream/hashline-pkg/index.ts` without establishing it exists.

### Task 6: Read-map core files exist under src/readmap/ — ✅ PASS
No issues (extra `enums.ts` is fine for completeness).

### Task 7: Required read-map mapper files exist — ❌ REVISE
- **Risky implementation step:** Stripping `.js` extensions from relative imports may be incorrect for Node ESM workflows (many TS projects intentionally keep `.js` in TS sources so emitted JS runs in Node). This change could harm runtime correctness even if `tsc --noEmit` passes.
  - Prefer adjusting `tsconfig` (`moduleResolution: "NodeNext"`) to support upstream import style, or only change imports if you confirm TypeScript actually errors.
- **Self-containment:** Assumes `/tmp/pi-read-map-pkg` exists (created in Task 6), so OK—*provided* Task 6 is kept and succeeds.

### Task 8: RTK technique files exist and forbidden files are absent — ❌ REVISE
- **Test bug:** `readdirSync(rtk, { recursive: true })` is not a supported option on `fs.readdirSync` in many Node versions and may throw at runtime. Replace with a small manual directory walk (or use `fs.promises.opendir`).
- **Granularity:** This task covers **two ACs (12 and 13)** in one test file. It’s not fatal, but it violates the “one task = one behavior/AC” spirit. Consider splitting into two tasks/tests: (a) required files exist, (b) forbidden files absent.
- **Self-containment:** Copies from `/tmp/pi-upstream/rtk-pkg/...` without a task describing how that directory is created.

### Task 9: Outline scripts exist — ✅ PASS
No issues.

### Task 10: Prompt files exist — ❌ REVISE
- **Test doesn’t match actual dependency:** The test only checks “at least one .md file”, but Task 5’s note says `read.ts`/`edit.ts` require **`prompts/read.md` and `prompts/edit.md`** specifically.
  - Either (a) update the test to assert both `prompts/read.md` and `prompts/edit.md` exist, or (b) remove the hard runtime dependency by making `index.ts` not import those modules at load time.
- **Ordering:** If Task 5 truly needs these prompt files, Task 10 must run **before** Task 5.
- **Self-containment:** Copies from `/tmp/pi-upstream/hashline-pkg/prompts/...` without ensuring that upstream dir exists.

### Task 11: TypeScript compiles cleanly — ✅ PASS
No issues (command-level AC; reasonable as `[no-test]`).

### Task 12: Full test suite passes — ✅ PASS
No issues.

---

## Missing Coverage
None. All ACs 1–17 are mapped to at least one task.

---

## Verdict
**revise**

### Must-fix items
1. **Fix Task ordering:** remove forward dependency (Task 5 depends on Task 10) by reordering or by making `index.ts` a minimal stub with no side effects.
2. **Make upstream sourcing self-contained:** add an explicit task/steps to obtain/extract the three upstream codebases (hashline-edit, read-map, rtk) or clearly state that `/tmp/pi-upstream/...` is guaranteed and how it is created.
3. **Fix Task 8 test implementation:** replace `readdirSync(..., { recursive: true })` with a supported recursive walk.
4. **Align prompt tests with actual needs:** if `read.md`/`edit.md` are required, assert them explicitly (or remove the dependency).
5. **Reconsider `.js` import stripping in Task 7:** only do it if required after confirming TypeScript errors; otherwise prefer a tsconfig that matches upstream ESM patterns.
