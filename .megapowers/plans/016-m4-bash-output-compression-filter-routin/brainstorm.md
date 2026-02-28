## Approach

The RTK technique files (`ansi.ts`, `build.ts`, `test-output.ts`, `git.ts`, `linter.ts`, `truncate.ts`) are already ported and compiling. This milestone is purely the **routing layer and wiring** — not porting techniques from scratch.

`src/rtk/bash-filter.ts` is a single pure function: takes `command: string` + `output: string`, detects the command type, applies `stripAnsi` first, then routes to the right technique. Detection priority is: **test → git → build → linter → fallback** (fallback = ANSI-strip only, output unchanged). It returns `{ output: string, savedChars: number }` — always, even on fallback where `savedChars` may be 0.

Wiring into `index.ts` uses `pi.on("tool_result", ...)` with `isBashToolResult(event)` as the gate. The bash command comes from `event.input.command`. The tool result content is `[{ type: "text", text: "..." }]` — we extract the text, compress, return a new content block. The **critical safety invariant** — hashline results from Read/Grep/Edit are never touched — is enforced by the `isBashToolResult` guard. If any technique throws, we catch and return ANSI-stripped original. Savings are logged to stderr when `PI_RTK_SAVINGS=1` is set — checked at the call site in `index.ts`, not inside `bash-filter.ts` itself (keeps the filter pure and testable).

## Key Decisions

- **Detection priority: test → git → build → linter → fallback** — test wins over build for commands like `cargo test`; git output is structurally distinct so it should be caught before build
- **`bash-filter.ts` is pure** — takes `(command, output)`, returns `{ output, savedChars }`. No side effects, no env var checks. Easy to unit test.
- **Logging lives in `index.ts`** — checks `PI_RTK_SAVINGS` env var, logs to stderr. Keeps the filter function testable in isolation.
- **`isBashToolResult(event)` is the only gate needed** — checking `event.toolName` would also work, but the typed guard is the idiomatic API and also narrows `event.input` to `{ command: string }`
- **ANSI-strip always happens first** — even for fallback. Clean output regardless of technique match.
- **Error isolation matches the "silent enhancement" pattern** from M1 — technique errors return ANSI-stripped original, never propagate

## Components

1. **`src/rtk/bash-filter.ts`** (new) — pure routing function `filterBashOutput(command, output): { output, savedChars }`
2. **`index.ts`** (modified) — add `isBashToolResult` import + `tool_result` event handler with savings logging
3. **`tests/bash-filter.test.ts`** (new) — unit tests for filter function
4. **`tests/bash-filter-integration.test.ts`** (new) — critical hashline isolation tests
5. **`tests/fixtures/`** (new files) — `vitest-pass.txt`, `vitest-fail.txt`, `tsc-errors.txt`, `git-diff-large.txt`, `eslint-output.txt`

## Testing Strategy

**Unit tests (`bash-filter.test.ts`):**
- Command detection: each `isXxxCommand` predicate correct for representative inputs
- Routing: `npm test` → test technique, `tsc` → build technique, `git diff` → git technique, `eslint` → linter technique, `echo hello` → fallback (ANSI-strip only)
- `savedChars` is accurate (`original.length - compressed.length`)
- Technique throws → catches, returns ANSI-stripped original
- Empty string in → empty string out
- ANSI codes always stripped (even fallback)

**Integration/isolation tests (`bash-filter-integration.test.ts`):**
- `tool_result` with `toolName='Read'` → content UNCHANGED (isBashToolResult returns false)
- `tool_result` with `toolName='Grep'` → UNCHANGED
- `tool_result` with `toolName='Edit'` → UNCHANGED
- `tool_result` with `toolName='Bash'` → output IS compressed

**Fixtures** are realistic captured outputs (not synthetic), placed in `tests/fixtures/` alongside existing ones.
