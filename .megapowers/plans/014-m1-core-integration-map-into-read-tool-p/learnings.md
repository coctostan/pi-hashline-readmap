# Learnings — Issue #014: M1 Core Integration — Map into Read Tool

- **Silent-catch discipline pays off immediately.** AC-2.7 (read tool must never error due to map generation) forced a try/catch wrapper around all map logic. The unit test that mocks `getOrGenerateMap` to throw verified this in one line — a clean, testable contract from the start.

- **mtime-keyed cache is simple and correct for a single session.** Using `Map<absPath, { mtimeMs, map }>` avoids any LRU complexity. Checking `stat()` on every cache read adds one syscall per read-tool call, which is negligible. The simpler design made the cache tests trivial to write.

- **Real temp files beat mocks for cache tests.** Using `os.tmpdir()` + actual file writes/`utimes()` instead of mocking `fs.stat` gave confidence the cache invalidation logic actually works. The `utimes()` trick (advance mtime by 10s) cleanly separates "same file, changed" from "re-read same file".

- **Fixture size matters: >2000 lines is non-negotiable.** The `large.ts` fixture at 10,680 lines was the key integration anchor — it reliably triggers the truncation threshold, ensuring AC-8.2's "map is appended" test never becomes a false negative from a file that's just under the limit.

- **The parallel task ordering in the plan (Tasks 1, 4, 5 in parallel; then 2; then 3; then 6) was a good call.** Fixtures (Task 5) and prompt (Task 4) had zero dependencies on the implementation, so building them first gave the integration tests (Task 6) a stable base to run against immediately.

- **`formatFileMapWithBudget` already handles the "no symbols" case gracefully.** Plain text files produce an empty or minimal map without any special-casing in `read.ts`. The formatter's tiered reduction logic absorbed what could have been an awkward edge case.

- **Entry-point test checking `.length === 1` (function arity) is a lightweight contract test.** It doesn't test behavior but does catch the common mistake of exporting a zero-arg function. Worth keeping as a permanent smoke test for the extension entry point.