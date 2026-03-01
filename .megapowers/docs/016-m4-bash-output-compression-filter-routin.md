Code review complete ✅

I reviewed the issue changes, fixed two important quality issues during review, re-ran validation, and finalized the report.

### What I fixed in-session
1. **Build detection was too broad** (`cargo` matched everything)  
   - Tightened `isBuildCommand` in `src/rtk/bash-filter.ts`.
   - Added regression check in `tests/bash-filter.test.ts`.

2. **Routing stopped too early on `null` technique results**  
   - Updated `filterBashOutput` routing to **fall through** to the next matching technique when one returns `null` (preserving priority, first non-null wins).
   - Added regression test for `tsc --noEmit` linter→build fallback.

I also added permanent core behavior tests for:
- empty output (`{ output: "", savedChars: 0 }`)
- unknown command ANSI-strip fallback + savings formula

### Validation rerun
- `npm test` → **27 passed**, **125 tests passed**
- `npm run typecheck` → **pass**

### Artifact + phase transition
- Saved report to:  
  `.megapowers/plans/016-m4-bash-output-compression-filter-routin/code-review.md`
- Advanced workflow phase with: `megapowers_signal({ action: "phase_next" })`

**Final assessment: ready**