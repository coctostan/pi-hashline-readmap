# Implement Task 8 — filterBashOutput catches technique errors

## Summary
Implemented Task 8 by adding error handling in `filterBashOutput` so any routing-technique exception now falls back to the ANSI-stripped original output (AC4). Added the corresponding regression test to verify thrown technique errors do not escape.

## Files changed
- `tests/bash-filter.test.ts`
- `src/rtk/bash-filter.ts`

## TDD Evidence
### RED
Command:
`npx vitest run tests/bash-filter.test.ts`

Observed failure:
`Error: technique exploded`

Signal sent:
`megapowers_signal({ action: "tests_failed" })`

### GREEN
Command:
`npx vitest run tests/bash-filter.test.ts`

Result:
- `1 passed (1)` test file
- `7 passed (7)` tests

Signal sent:
`megapowers_signal({ action: "tests_passed" })`

### Regression
Command:
`npx vitest run`

Result:
- `26 passed (26)` test files
- `120 passed (120)` tests
