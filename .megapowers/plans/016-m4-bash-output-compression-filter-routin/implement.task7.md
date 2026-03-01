# Implement Task 7 — routing priority regression test

## Summary
Added the Task 7 regression test to verify routing priority for overlapping command detection (`cargo test` matches both test and build). Confirmed that test routing wins over build routing without any production code changes.

## Files changed
- `tests/bash-filter.test.ts`

## Verification Evidence
### RED/GREEN protocol signals
- `megapowers_signal({ action: "tests_failed" })`
- `megapowers_signal({ action: "tests_passed" })`

### Task test run
Command:
`npx vitest run tests/bash-filter.test.ts`

Result:
- `1 passed (1)` test file
- `6 passed (6)` tests

### Full suite regression run
Command:
`npx vitest run`

Result:
- `26 passed (26)` test files
- `119 passed (119)` tests

## Notes
- No production code changes were required for this task.
- Existing routing order from prior tasks already satisfied AC14.
