---
id: 16
type: feature
status: in-progress
created: 2026-02-27T14:38:56.847Z
sources: [12, 13]
---

# M4 Bash Output Compression: Filter Routing + Wiring + Tests

Wire the already-imported RTK technique files into a bash output filter and prove hashline isolation with tests.

## Scope
- #012: New src/rtk/bash-filter.ts — detect command type (test/build/git/lint/other) → apply chain: stripAnsi → detect → filter/aggregate. Wire into index.ts via pi.on('tool_result') for Bash tool ONLY. Never touch read/grep/edit output.
- #013: Unit tests (command detection, each technique, routing correctness, unrecognized commands) + integration tests (CRITICAL: Read/Grep/Edit output unchanged, Bash output compressed) + error resilience + fixtures (vitest-pass.txt, tsc-errors.txt, git-diff-large.txt, eslint-output.txt)

## Execution Order
1. #012 first (build the filter + wiring)
2. #013 next (tests proving it works and doesn't break hashlines)

## Key Constraints
- SAFETY: Only process toolName='Bash' — hashline integrity is inviolable
- Technique errors → return ANSI-stripped original (never crash)
- RTK source files already in src/rtk/ from #001 scaffold

## Depends On
Nothing — fully independent. Can run in parallel with Batch A.
