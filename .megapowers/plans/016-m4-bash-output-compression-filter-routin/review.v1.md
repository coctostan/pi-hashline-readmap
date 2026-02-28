Plan review for Issue 016-m4-bash-output-compression-filter-routin

Key required revisions:
- AC8 (isBuildCommand detection) is not tested/covered; coverage matrix incorrectly maps AC8 to Task 3.
- Task 1 implementation removes "test" but fails AC6 for "npm test" unless "npm test" is explicitly included.
- Task 3 makes isLinterCommand match generic "tsc"; AC9 only requires "tsc --noEmit". This creates overlap with isBuildCommand and can violate AC13 routing expectations unless explicitly handled.
- Routing tests (Tasks 6–9) are brittle/weak (length-based assertions; build/linter tests don’t actually prove routing). Prefer spying/mocking technique functions or checking distinctive markers.
- Task 8/9 Step 2 expected failures are vague; Task 10 claims a failing Step 2 though it will likely pass with planned priority order.
- Task 14 describes a “failing test” but should pass given dependency on fixture creation.
- index.ts wiring/logging tests should reset modules between runs (vi.resetModules()) to avoid ESM module cache issues.

Recommendation: return to plan phase and update tasks accordingly.