# Learnings: AST-Grep Tool Wrapper (M3)

- **`vi.mock` vs `vi.spyOn` for `child_process`**: Using `vi.spyOn(cp, "execFile")` per-test (with `afterEach(() => vi.restoreAllMocks())`) worked reliably here because all sg tests import `node:child_process` as `* as cp` and spy on the same reference. The key is that the spy is on the module namespace object, not the raw export — this approach is consistent and avoids the hoisting complexity of `vi.mock`.

- **Cache sentinel type matters**: Caching `[]` for an unreadable file but returning `undefined` creates a type contract violation. Even when harmless in current code (each abs path is looked up once per execute call due to the grouping step), mismatched cache semantics are a maintenance trap. Use `null` as the explicit "failed to read" sentinel — `Map<string, string[] | null>` — and return it consistently.

- **`toAbsoluteFile` needs three cases, not two**: sg can return (a) absolute paths (most common when searching by absolute path), (b) relative paths when searching a directory, or (c) the search path itself when the target is a single file. Missing case (c) would produce wrong paths. All three branches need to exist and should be independently tested.

- **Test helper duplication signals a missing shared module**: `getSgTool()` and `text()` were copied to 7 test files. When the same 8-line helper appears verbatim across every test file for a module, that's a clear signal to create `tests/sg-test-utils.ts` from the start — before the test count grows.

- **`prompts/sg.md` as description doubles as user-facing doc**: Loading the prompt file as `description` means the tool description (surfaced in the pi UI) and the developer-facing docs are the same artifact. Keeping it short and scannable (one-liner per metavariable, one workflow example) serves both audiences well.

- **Two "no matches" return paths are both correct**: The early-return on empty JSON array and the fallback on empty `blocks` after grouping handle distinct scenarios — don't collapse them. The second path catches the case where sg returned matches but every matched file was unreadable, which is a valid operational state worth handling separately.

- **`maxBuffer: 10MB` must be set explicitly**: Node's `execFile` default buffer is 1MB. sg on a large monorepo can easily return 2-5MB of JSON. 10MB is pragmatic without being extravagant — and without setting it explicitly you discover the silent truncation only in production when a search returns a mysterious partial result.
