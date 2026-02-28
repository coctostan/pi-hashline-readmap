# Plan — 007-readme-license-e2e

## Tasks

### Task 1: Write tests for README and LICENSE (TDD red)
**File:** `tests/readme-license.test.ts`
**AC:** AC-4, AC-6
**Details:**
- Follow existing `*-files.test.ts` pattern (see `hashline-files.test.ts`, `prompts-files.test.ts`)
- Test README.md exists at project root
- Test README.md contains key markers: "pi-hashline-readmap", "Installation", "Credits", "LINE:HASH", "structural map", "MIT"
- Test README.md mentions all three upstream projects (hashline-edit, read-map, rtk)
- Test LICENSE exists at project root
- Test LICENSE contains "MIT License"
- Tests will fail initially (RED) since files don't exist yet

### Task 2: Create LICENSE file
**File:** `LICENSE`
**AC:** AC-3
**Details:**
- Standard MIT license text
- Copyright 2026
- This makes the LICENSE tests from Task 1 pass

### Task 3: Create README.md
**File:** `README.md`
**AC:** AC-1, AC-2
**Details:**
- Project title and one-line description
- "Why" section — explains the read tool conflict problem
- "What You Get" section — read (hashlines + maps), edit (hash-verified), grep (hash-anchored)
- "Installation" section — `pi install .` for local, `pi install npm:pi-hashline-readmap` for published
- "Output Examples" section — small file (hashlines only) and large file (hashlines + map)
- "Development" section — `npm test`, `npm run typecheck`
- "Credits" section — hashline-edit (RimuruW), read-map (Whamp), rtk (mcowger) with links
- "License" section — MIT
- Keep it ~150-200 lines, no fluff

### Task 4: Run tests and verify green
**AC:** AC-4, AC-6
**Details:**
- Run `npm test` — all tests pass including new readme-license.test.ts
- Confirm no regressions in existing test suite

## Dependencies
- Task 1 has no dependencies (write tests first — TDD)
- Task 2 depends on Task 1 (need red tests before writing production files)
- Task 3 depends on Task 1 (need red tests before writing production files)
- Task 4 depends on Tasks 1, 2, 3
