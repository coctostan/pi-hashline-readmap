# Milestones

## M0: Prerequisites
**Status**: ✅ Done
**Goal**: Install CLI tools that the agent uses via bash. Zero coding, immediate value.
Tasks:
- [x] `brew install ast-grep difftastic shellcheck yq comby scc sd`
- [x] Verify all tools resolve: `which sg difft shellcheck yq comby scc sd`

## M1: Foundation (MVP)
**Status**: ✅ Done
**Goal**: Working combined extension — hashline read/edit/grep + structural maps on large files.
Tasks:
- [x] Project scaffold (package.json, tsconfig, deps, file structure — includes RTK technique files) — #001
- [x] Import hashline-edit source files — #002 (done as part of #001)
- [x] Import read-map mapper library into src/readmap/ — #003 (done as part of #001)
- [x] Integrate map generation into read tool + map cache — #014 (#004)
- [x] Update prompts/read.md — #014 (#005)
- [x] Unit & integration tests — #014 (#006)
- [x] README, LICENSE, end-to-end verification — #007

## M2: Symbol-Addressable Read
**Status**: ✅ Done
**Goal**: `read("file.ts", { symbol: "fn" })` → returns just that function, hashlined.
Tasks:
- [x] Symbol lookup engine (search FileMap by name) — #015 (#008)
- [x] Add symbol param to read tool schema — #015 (#009)
- [x] Wire symbol lookup into read flow — #015 (#009)
- [x] Tests for symbol read — #015 (#009)

## M3: AST-Grep Pi Tool Wrapper
**Status**: ✅ Done
**Goal**: Native sg tool with hashlined output.
Tasks:
- [x] Tool registration + schema — #010
- [x] sg --json wrapper — #010
- [x] Hashline formatting of results — #010
- [x] Tests — #010

## M4: Bash Output Compression (from pi-rtk)
**Status**: ✅ Done
**Goal**: Absorb pi-rtk's bash output techniques (test/build/git/linter/ANSI) into the unified extension.
Tasks:
- [x] Import RTK technique files (ansi, build, test-output, git, linter, truncate) — #011 (done as part of #001)
- [x] Create bash-filter.ts routing entry point — #016 (#012)
- [x] Hook pi.on("tool_result") in index.ts — #016 (#012)
- [x] Tests (command detection, technique routing, hashline isolation) — #016 (#013)
