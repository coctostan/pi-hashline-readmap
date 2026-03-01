# Implement Task 5 — filterBashOutput routes linter commands

## Summary
Added Task 5 linter routing behavior so `filterBashOutput` now routes linter commands to `aggregateLinterOutput` (with `null` fallback to stripped output). Updated the routing test file to include the new linter routing case.

## Files changed
- `tests/bash-filter.test.ts`
- `src/rtk/bash-filter.ts`

## TDD Evidence
### RED
Command:
`npx vitest run tests/bash-filter.test.ts`

Observed failure:
`AssertionError: expected "aggregateLinterOutput" to be called with arguments: [ 'raw linter output', 'eslint .' ]`

Signal sent:
`megapowers_signal({ action: "tests_failed" })`

### GREEN
Command:
`npx vitest run tests/bash-filter.test.ts`

Result:
- `1 passed (1)` test file
- `4 passed (4)` tests

Signal sent:
`megapowers_signal({ action: "tests_passed" })`

### Regression
Command:
`npx vitest run`

Result:
- `26 passed (26)` test files
- `117 passed (117)` tests
