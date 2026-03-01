# Implement Task 6 — filterBashOutput routes build commands

## Summary
Implemented Task 6 by adding build-command routing in `filterBashOutput` so build commands are sent to `filterBuildOutput`, with fallback to ANSI-stripped output when the build filter returns `null`.

## Files changed
- `tests/bash-filter.test.ts`
- `src/rtk/bash-filter.ts`

## TDD Evidence
### RED
Command:
`npx vitest run tests/bash-filter.test.ts`

Observed failure:
`AssertionError: expected "filterBuildOutput" to be called with arguments: [ 'raw build output', 'tsc' ]`

Signal sent:
`megapowers_signal({ action: "tests_failed" })`

### GREEN
Command:
`npx vitest run tests/bash-filter.test.ts`

Result:
- `1 passed (1)` test file
- `5 passed (5)` tests

Signal sent:
`megapowers_signal({ action: "tests_passed" })`

### Regression
Command:
`npx vitest run`

Result:
- `26 passed (26)` test files
- `118 passed (118)` tests
