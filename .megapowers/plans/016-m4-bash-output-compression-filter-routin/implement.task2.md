# Implement Task 2 — filterBashOutput (empty input + ANSI stripping)

## Summary
Implemented `filterBashOutput` with Task 2 minimal behavior: empty output passthrough, ANSI stripping fallback, and `savedChars` computation.
Also added the Task 2 unit test covering AC1/AC2/AC3/AC5/AC15.

## Subagent attempt
Attempted delegation via `subagent` (per user request), but tool failed repeatedly with workspace creation error:
`Cannot access .../.megapowers/subagents/oneshot-<id>/workspace (No such file or directory)`.
After creating `.megapowers/subagents/` and retrying, the same error persisted, so Task 2 was completed inline.

## Files changed
- `tests/bash-filter.test.ts` (created)
- `src/rtk/bash-filter.ts` (created)

## TDD Evidence
### RED
Command:
`npx vitest run tests/bash-filter.test.ts`

Observed failure:
`Error: Cannot find module '../src/rtk/bash-filter.js'`

Signal sent:
`megapowers_signal({ action: "tests_failed" })`

### GREEN
Command:
`npx vitest run tests/bash-filter.test.ts`

Result:
- `1 passed (1)`

Signal sent:
`megapowers_signal({ action: "tests_passed" })`

### Regression
Command:
`npx vitest run`

Result:
- `26 passed (26)` test files
- `114 passed (114)` tests

## Notes
Implementation intentionally limited to Task 2 scope (no command routing logic added yet).