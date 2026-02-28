---
id: 2
type: feature
status: closed
created: 2026-02-26T21:01:00Z
milestone: M1
priority: 2
---

# Import hashline-edit source files

Copy all source files from pi-hashline-edit v0.3.0 into the project:

**Files to copy (verbatim, no modifications):**
- `index.ts` → `index.ts` (extension entry point)
- `src/read.ts` → `src/read.ts`
- `src/edit.ts` → `src/edit.ts`
- `src/edit-diff.ts` → `src/edit-diff.ts`
- `src/grep.ts` → `src/grep.ts`
- `src/hashline.ts` → `src/hashline.ts`
- `src/path-utils.ts` → `src/path-utils.ts`
- `src/runtime.ts` → `src/runtime.ts`
- `prompts/read.md` → `prompts/read.md`
- `prompts/edit.md` → `prompts/edit.md`

**Source**: https://github.com/RimuruW/pi-hashline-edit (v0.3.0)

**Verify**: `npx tsc --noEmit` succeeds with hashline source in place.

> **Closed**: Fully completed as part of #001 (project scaffold). All hashline-edit source files are in place and `tsc --noEmit` passes.
