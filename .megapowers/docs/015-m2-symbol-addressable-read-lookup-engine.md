Code review completed for **015-m2-symbol-addressable-read-lookup-engine**.

I reviewed:

- `src/readmap/symbol-lookup.ts`
- `src/read.ts`
- `prompts/read.md`
- `tests/symbol-lookup.test.ts`
- `tests/symbol-read-integration.test.ts`

### Outcome
**Assessment: ready**

### What I found and fixed during review
I found one correctness edge case and fixed it immediately:

- In `src/readmap/symbol-lookup.ts`, dot-notation parsing could incorrectly treat `Class.method.extra` as `Class.method`.
- I updated lookup logic to require exactly two dot segments for nested matching.
- I added a regression test:
  - `tests/symbol-lookup.test.ts` — `"does not match dot-notation queries with more than one dot segment"`.

### Validation after fix
- `npm test` ✅ (17 files, 100 tests passed)
- `npm run typecheck` ✅

I saved the full report to the **code-review artifact** and advanced the workflow to **done**.