# Implement Task 9 — index.ts wiring for bash output compression

## Summary
Implemented Task 9 by wiring a `tool_result` handler in `index.ts` that gates with `isBashToolResult`, leaves non-bash tool results unchanged (`undefined`), and compresses bash text content via `filterBashOutput`.

## Files changed
- `tests/entry-point.test.ts`
- `tests/bash-filter-integration.test.ts`
- `index.ts`

## TDD Evidence
### RED
Command:
`npx vitest run tests/bash-filter-integration.test.ts`

Observed failure:
`AssertionError: expected undefined to be defined` (tool_result handler not registered)

Signal sent:
`megapowers_signal({ action: "tests_failed" })`

### GREEN
Command:
`npx vitest run tests/bash-filter-integration.test.ts`

Result:
- `1 passed (1)` test file
- `1 passed (1)` test

Signal sent:
`megapowers_signal({ action: "tests_passed" })`

### Regression
Command:
`npx vitest run`

Result:
- `27 passed (27)` test files
- `121 passed (121)` tests
