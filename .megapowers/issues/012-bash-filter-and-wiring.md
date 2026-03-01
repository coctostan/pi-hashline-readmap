---
id: 12
type: feature
status: closed
created: 2026-02-26T21:11:00Z
milestone: M4
priority: 9
---

# Create bash-filter.ts and wire into index.ts

**New file: `src/rtk/bash-filter.ts`**
- Detect command type (test, build, git, lint, other)
- Apply chain: stripAnsi → detect type → filter/aggregate
- Return compressed output + savings info
- Graceful fallback for unrecognized commands (ANSI-strip only)

**Wire into index.ts:**
```typescript
pi.on('tool_result', (event) => {
  // CRITICAL: Only bash results. NEVER touch read/grep/edit.
  if (event.toolName !== 'Bash' && event.toolName !== 'bash') return;
  const result = filterBashOutput(command, event.output);
  event.output = result.output;
});
```

**Safety rules:**
1. Only process bash tool results
2. Never process read, grep, or edit — hashline integrity is inviolable
3. Always strip ANSI first
4. Technique errors → return ANSI-stripped original
