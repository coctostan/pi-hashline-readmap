## Files Reviewed
- `src/rtk/bash-filter.ts` — command detection, routing/fallback behavior, ANSI handling, savings computation
- `index.ts` — `tool_result` wiring, bash-only gating, content rewrite, savings logging
- `tests/bash-filter.test.ts` — unit coverage for detection/routing/error/core behavior
- `tests/bash-filter-integration.test.ts` — extension-level behavior (bash-only mutation + logging env toggle)
- `tests/bash-filter-fixtures.test.ts` — fixture realism/threshold checks
- `tests/fixtures/vitest-pass.txt`, `tests/fixtures/vitest-fail.txt`, `tests/fixtures/tsc-errors.txt`, `tests/fixtures/git-diff-large.txt`, `tests/fixtures/eslint-output.txt` — fixture corpus quality
- `tests/entry-point.test.ts` — entry-point registration smoke coverage

## Strengths
- `index.ts:15-17` correctly gates processing with `isBashToolResult(event)` and returns `undefined` for non-bash tool results, preserving hashline tools.
- `index.ts:21-24` safely normalizes bash text content before compression, and `index.ts:32-34` returns the expected text content shape.
- `src/rtk/bash-filter.ts:37` strips ANSI prior to routing; `src/rtk/bash-filter.ts:59-61` provides resilient fallback on technique exceptions.
- `src/rtk/bash-filter.ts:41-57` now uses ordered routing with null fallthrough, preserving precedence while allowing overlapping categories to still find a valid compressor.
- `tests/bash-filter-integration.test.ts:38-41` explicitly verifies non-bash tools (`read/grep/edit/sg`) remain untouched.
- `tests/bash-filter-integration.test.ts:68-81` verifies `PI_RTK_SAVINGS` logging behavior for both enabled and disabled states.
- `tests/bash-filter.test.ts:40-50` now includes direct regression coverage for empty-output and unknown-command fallback behavior.

## Findings

### Critical
None.

### Important
1. **[Resolved in this review] Over-broad build detection for Cargo commands**
   - **File:line:** `src/rtk/bash-filter.ts:24`, `tests/bash-filter.test.ts:29`
   - **What was wrong:** Build detection previously matched any command containing `"cargo"`, which over-classified non-build commands.
   - **Why it mattered:** It increased false-positive routing and made command-class semantics less predictable.
   - **How it was fixed:** Detection was narrowed to explicit tokens (`cargo build`, `cargo check`, `cargo test`) and a regression assertion was added (`cargo clippy` is not a build command).

2. **[Resolved in this review] No fallback to build compressor when linter route returned `null`**
   - **File:line:** `src/rtk/bash-filter.ts:41-57`, `tests/bash-filter.test.ts:95-103`
   - **What was wrong:** For overlapping commands like `tsc --noEmit`, linter routing could return `null` and stop, skipping build compression entirely.
   - **Why it mattered:** A common typecheck command could miss available compression despite matching a build route.
   - **How it was fixed:** Routing now evaluates in priority order but continues when a matched technique returns `null`, selecting the first non-null compressor result.

### Minor
None.

## Recommendations
- Consider centralizing command taxonomy between `bash-filter.ts` and RTK technique modules to reduce future drift as supported command lists evolve.
- Keep the newly added core-regression tests in `tests/bash-filter.test.ts` as part of normal CI gates (they replaced previously ad-hoc verify-only checks).

## Assessment
ready

All reviewed changes are now in good shape after in-session fixes. I re-ran:
- `npm test` → **27 passed**, **125 passed tests**
- `npm run typecheck` → **pass**

No outstanding critical/important/minor issues remain.