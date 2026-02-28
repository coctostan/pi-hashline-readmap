Plan review feedback for issue 001-project-scaffold:

- Task 2 should be split (contains "and" and two config deliverables in one task).
- Task 3 does not explicitly verify AC8's "index.ts exports a default function"; tests only check file existence.
- Task 3 bundles multiple behaviors (entrypoint, hashline files, prompts) into one broad presence suite; consider splitting prompts into separate task/test.
- Task 6 is marked [no-test] but AC14 (script file presence) is testable with Vitest file-existence checks; convert to TDD or strengthen justification + automated verification.
- Task 7 should be split (contains "and" and two verifications in one task), or keep one verification per task for granularity.

Coverage map includes all ACs, but above items need revision before implementation.