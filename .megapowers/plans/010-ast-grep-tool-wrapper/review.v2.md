# Review notes — 010-ast-grep-tool-wrapper

Overall: plan is close and covers all acceptance criteria, but two tasks need minor fixes to be self-contained and executable in this repo.

## Task 2 (index.ts wiring test)
- The plan’s Step 1 snippet redeclares `root` and uses `__dirname` without defining it.
- In this repo, `tests/entry-point.test.ts` already defines `__dirname` via `import.meta.url` and defines `root` once at top-level.
- Fix: add a new `it()` in the existing file that reuses the existing `root` constant (and existing imports) rather than appending a new import block + `const root = ...`.

## Task 10 (skip unreadable files)
- Step 3 is currently descriptive; it should include the exact minimal code change.
- Fix: ensure headers/blocks are only emitted after `getFileLines(abs)` succeeds (and in Task 9 grouping, skip a file bucket entirely if its file cannot be read).
