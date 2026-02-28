Review of revised plan for 001-project-scaffold:

Key issues requiring revision:

1) Task 2 verification likely fails in an empty repo:
- Step 2 runs `npx tsc --noEmit` before any TS sources exist.
- TypeScript commonly exits non-zero with `TS18003: No inputs were found in config file ...` when include globs match nothing.
- Fix: verify config with `npx tsc --showConfig > /dev/null` (or `node -e` parse+assert key compilerOptions). Keep the real `tsc --noEmit` success check in Task 10 for AC16.

2) Task 3 verification command masks exit codes and expects non-zero:
- `npx vitest run 2>&1 | head -5` will typically exit 0 because of the pipe to `head`, even if vitest fails.
- Expecting non-zero is also awkward for a verification step.
- Fix: verify by importing the config (after Task 1 install), e.g. `node --input-type=module -e "import('./vitest.config.ts').then(()=>console.log('ok'))"`, or `npx vitest --version` (binary presence) + defer config validation to when tests exist.

3) Task dependencies missing:
- Tasks 3–9 run `npx vitest ...` but do not declare `[depends: 1]` even though Task 1 performs `npm install`.
- Fix: add `[depends: 1]` to any task that requires installed deps.

4) Task 4 dynamic import likely broken:
- Test uses `await import(resolve(root, 'index.ts'))`.
- In Node ESM, dynamic import of a filesystem path should be `await import(pathToFileURL(path).href)`; plain absolute paths are not reliably valid module specifiers.
- Fix: use `import { pathToFileURL } from 'url'` and `await import(pathToFileURL(resolve(root,'index.ts')).href)`.

5) Task 5 violates required TDD structure:
- Step 1 says “Write the failing test”, but Step 2 expects PASS immediately because Task 4 already created the files.
- This violates the workflow requirement that each TDD task has a real red→green cycle.
- Fix options:
  a) Reorder/split so hashline src copying happens in its own task BEFORE the entrypoint task:
     - New Task 4: AC9 file-existence test → copy src/ (and edit-diff.ts for compilation).
     - New Task 5: AC8 entrypoint test (with proper file URL import) → copy index.ts.
     This keeps each task’s test failing when introduced.
  b) If you want to keep Task 4 copying both index.ts and src/, then remove Task 5 entirely and update the AC coverage map accordingly.

Everything else looks good (Task 6 import-fix script is concrete; Task 7 now tests recursive forbidden-file absence; scripts/prompts tasks are TDD and self-contained; Task 10/11 [no-test] justifications are valid).

Verdict: REVISE (apply the fixes above).