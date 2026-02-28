**Code review complete — ready.**

---

## Summary

**No critical findings.** One Important + two Minor issues:

**Important — `src/sg.ts:82-84`: Cache/return inconsistency in `getFileLines`**  
On read failure, the function caches `[]` (empty array, truthy) but returns `undefined`. A second lookup for the same failed file would return `[]` and bypass the `if (!lines) continue` guard, emitting a file header with phantom empty lines. Currently harmless because each abs path only gets looked up once per call, but semantically wrong. Fix: use `null` as the sentinel and return it consistently.

**Minor:**
- `getSgTool()` / `text()` test helpers duplicated across 7 test files — extract to `tests/sg-test-utils.ts` in a future pass
- `JSON.parse(stdout)` failure (line 64) bubbles as a `SyntaxError` message; a dedicated catch with a clearer message would help debugging

Everything else is solid: correct 0→1 indexing, anchors from real file content (not sg's `text` field), proper signal propagation, `toAbsoluteFile` handling all three path cases, and a genuinely end-to-end edit-compatibility test.