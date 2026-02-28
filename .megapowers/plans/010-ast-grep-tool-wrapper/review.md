# Review: 010-ast-grep-tool-wrapper plan

## Summary
Plan is close and covers all ACs, but it needs revisions before implementation due to (1) test flakiness (depends on external `sg` binary), (2) mocking pitfalls with `execFile` + `promisify`, (3) incomplete/self-referential test snippets in later tasks, and (4) a few correctness gaps around file path resolution when `path` points to a file.

Key required changes:
- **Do not run the real `sg` CLI in tests.** Mock `execFile` everywhere except possibly an explicitly skipped e2e test.
- **Avoid `promisify(execFile)` captured at module init**; it prevents `vi.spyOn(child_process, 'execFile')` from working reliably. Wrap `execFile` in a Promise inside `execute()` or `promisify(cp.execFile)` inside `execute()`.
- **Resolve matched file paths correctly** when the search target is a single file vs directory (mirror `src/grep.ts`’s `searchPathIsDirectory` logic).
- Make each task’s Step 1 test snippet **self-contained** (imports/helpers or explicit file context) and avoid “update above” / missing imports.
- Fix granularity: Task 9 has two tests in one task; either combine into one `it()` or split tasks.

Verdict: **revise**.
