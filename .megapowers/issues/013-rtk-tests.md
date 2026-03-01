---
id: 13
type: feature
status: closed
created: 2026-02-26T21:12:00Z
milestone: M4
priority: 10
---

# Tests for bash filter: routing, compression, hashline isolation

**Unit tests:**
- Command detection: isTestCommand, isBuildCommand, isGitCommand, isLinterCommand
- Each technique produces valid compressed output
- Routing: correct technique applied per command type
- Unrecognized commands: ANSI-stripped but unchanged

**Integration tests (CRITICAL):**
- tool_result with toolName='Read' → output UNCHANGED
- tool_result with toolName='Grep' → output UNCHANGED
- tool_result with toolName='Edit' → output UNCHANGED
- tool_result with toolName='Bash' → output COMPRESSED

**Error resilience:**
- Technique throws → return ANSI-stripped original
- Empty output → empty string
- Binary output → truncated with notice

**Fixtures:** vitest-pass.txt, vitest-fail.txt, tsc-errors.txt, git-diff-large.txt, eslint-output.txt
