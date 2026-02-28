## Goal

Build `src/rtk/bash-filter.ts` — a pure routing function that detects the bash command type, applies the appropriate RTK compression technique, and returns compressed output with savings metrics. Wire this into `index.ts` via `pi.on("tool_result")` so that every bash tool result is automatically compressed before reaching the LLM, while hashline output from Read/Grep/Edit tools is never touched. Add fixture files and tests.

---

## Acceptance Criteria

**`filterBashOutput` function**

1. `filterBashOutput(command: string, output: string)` returns `{ output: string, savedChars: number }`.
2. `filterBashOutput` strips ANSI escape codes from `output` before applying any technique.
3. `filterBashOutput("echo hello", "")` returns `{ output: "", savedChars: 0 }`.
4. When a technique throws an error, `filterBashOutput` catches it and returns the ANSI-stripped original output.
5. `savedChars` equals `original output length minus result output length`.

**Command detection**

6. `isTestCommand` returns `true` for commands containing: `vitest`, `jest`, `pytest`, `cargo test`, `npm test`, `npx vitest`.
7. `isGitCommand` returns `true` for commands starting with `git`.
8. `isBuildCommand` returns `true` for commands containing: `tsc`, `cargo build`, `npm run build`.
9. `isLinterCommand` returns `true` for commands containing: `eslint`, `prettier --check`, `tsc --noEmit`.

**Routing**

10. `filterBashOutput` with a test command routes to `aggregateTestOutput`.
11. `filterBashOutput` with a git command routes to `compactGitOutput`.
12. `filterBashOutput` with a build command routes to `filterBuildOutput`.
13. `filterBashOutput` with a linter command routes to `aggregateLinterOutput`.
14. `filterBashOutput` with a command matching both `isTestCommand` and `isBuildCommand` (e.g., `cargo test`) routes as a test command.
15. `filterBashOutput` with a command matching none of the above returns ANSI-stripped output with no other changes applied.

**`index.ts` wiring**

16. `index.ts` registers a `tool_result` event handler that calls `isBashToolResult(event)` to determine whether to process the result.
17. When `isBashToolResult(event)` returns `false`, the handler returns `undefined` (content is not modified).
18. When `isBashToolResult(event)` returns `true`, the handler returns `{ content: [{ type: "text", text: compressedOutput }] }`.

**Logging**

19. When `PI_RTK_SAVINGS=1` is set, the handler logs a savings summary to `process.stderr` after compression.
20. When `PI_RTK_SAVINGS` is unset, no savings logging occurs.

**Fixtures**

21. `tests/fixtures/vitest-pass.txt` exists and contains a realistic vitest passing run output (multiple passing tests, summary line).
22. `tests/fixtures/vitest-fail.txt` exists and contains a realistic vitest failing run output (at least one failure with diff).
23. `tests/fixtures/tsc-errors.txt` exists and contains realistic TypeScript compiler error output (at least 3 errors).
24. `tests/fixtures/git-diff-large.txt` exists and contains a realistic multi-file git diff (at least 5 hunks).
25. `tests/fixtures/eslint-output.txt` exists and contains realistic ESLint output (at least 5 violations).

---

## Out of Scope

- Configuration beyond the `PI_RTK_SAVINGS` env var
- Handling binary/non-UTF-8 bash output specially
- Modifying the RTK technique files (`build.ts`, `test-output.ts`, etc.)
- Truncation of fallback output (ANSI-strip only, no length cap)
- Any tool result other than `Bash` (Read, Grep, Edit, sg are never processed)

---

## Open Questions

_(none)_
