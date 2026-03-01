# Learnings — 016-m4-bash-output-compression-filter-routin

- **Routing order matters more than matching breadth**: The original `isBuildCommand` matched `"cargo"` as a broad token, which made `cargo test` a build command. The right fix wasn't to widen test detection — it was to narrow build detection to specific known tokens (`cargo build`, `cargo check`, `cargo test`) and then let the ordered routing naturally prefer test over build. Matching logic and routing priority are two separate concerns.

- **`null`-fallthrough routing beats nested `if/else`**: The initial implementation used a flat `if/else if` chain that stopped as soon as a route matched, even when the matched technique returned `null`. Replacing this with a priority-ordered list of `{ matches, apply }` entries — iterating to find the first non-null result — makes the fallthrough behavior explicit, testable, and easy to extend without touching the loop structure.

- **Test breadth should follow AC breadth**: The verify step used a temporary file to cover empty-output and unknown-command branches because those weren't in the regular test file. Those tests belonged in `bash-filter.test.ts` from the start — if a branch is reachable and has an AC, it should have a permanent test, not a spot-check that gets deleted.

- **`isBashToolResult` is safer than a manual `toolName` check**: Delegating the bash gate to the typed SDK helper (`isBashToolResult`) rather than string-comparing `event.toolName` avoids hardcoding casing assumptions and gets type narrowing of `event.input` for free. This was the right call.

- **Integration test import cache-busting is fragile but necessary**: The savings logging test appended `?t=<timestamp>` to the module URL to force re-evaluation under different env states. This works, but it relies on Node's ESM cache behavior staying stable. A cleaner design would extract the savings side-effect into a passed-in function or observable, making it injectable in tests.

- **"Overlap is a feature, not a bug" — but needs a test**: The fact that `cargo test` matches both `isTestCommand` and `isBuildCommand` is intentional and valuable (it lets test routing win while build detection still covers `cargo build`). Without an explicit regression test for the overlap case (`cargo test` → test wins), this invariant could silently break if someone reordered the routing.

- **Fixture files are low-effort, high-value**: Five static text files covering realistic vitest, tsc, git diff, and eslint output give technique tests something real to compress. The threshold assertions (≥3 errors, ≥5 hunks, etc.) are simple and stable. Future technique improvements can compare fixture compression ratios directly without constructing synthetic inputs.
