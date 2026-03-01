# Implement Task 10 — Savings logging (`PI_RTK_SAVINGS=1`)

## Summary
Implemented Task 10 by extending the `tool_result` bash compression path in `index.ts` to log savings to stderr only when `PI_RTK_SAVINGS` is set to `"1"`, while remaining silent when unset.

## Files changed
- `tests/bash-filter-integration.test.ts`
- `index.ts`

## TDD Evidence
### RED
Command:
`npx vitest run tests/bash-filter-integration.test.ts`

Observed failure:
`AssertionError: expected "Mock" to be called with arguments: [ StringContaining "[RTK] Saved" ]` (number of calls: 0)

Signal sent:
`megapowers_signal({ action: "tests_failed" })`

### GREEN
Command:
`npx vitest run tests/bash-filter-integration.test.ts`

Result:
- `1 passed (1)` test file
- `2 passed (2)` tests

Signal sent:
`megapowers_signal({ action: "tests_passed" })`

### Regression
Command:
`npx vitest run`

Result:
- `27 passed (27)` test files
- `122 passed (122)` tests
