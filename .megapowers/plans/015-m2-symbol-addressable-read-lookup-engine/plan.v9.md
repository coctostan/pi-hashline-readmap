# Plan Review — Issue 015-m2-symbol-addressable-read-lookup-engine

## Verdict
revise

## Findings

### Task 18 dependency gap (blocking)
- **Problem:** Task 18 expects `symbol: "initialize"` on `large.ts` to be ambiguous, but Tasks 1–11 only define non-dot matching against `map.symbols` (top-level) plus dot-notation for children.
- **Why this is risky:** In this codebase, nested methods are represented as `children` under top-level symbols. If non-dot lookup does not traverse descendants, `initialize` may resolve to not-found (or a single top-level symbol), so Task 18 Step 4 may not pass with the proposed implementation.
- **Fix required:** Add explicit lookup behavior and tests for descendant traversal in non-dot tiers (exact / case-insensitive / partial), or change Task 18 to use a mocked map with deterministic ambiguous top-level candidates.

### Task 16 test brittleness (recommended change)
- **Problem:** Step 1 hard-codes exact line numbers (`10437-10459 of 10681`) for a fixture.
- **Why this matters:** This can fail due to fixture churn unrelated to behavior.
- **Fix suggested:** Mock map lookup or derive expected line range from map/lookup result instead of hard-coding fixture-specific numbers.

## Coverage summary
- AC matrix claims full coverage, but AC16 integration coverage is not reliable until Task 18 dependency issue above is fixed.

## Conventions check
- `AGENTS.md` absent (confirmed).
- Inference from `package.json` is correct: TypeScript + Vitest + `npm test` / `npx vitest run`.
