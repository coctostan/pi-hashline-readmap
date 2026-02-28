# Milestones
**Status**: ✅ Done
**Goal**: Install CLI tools that the agent uses via bash. Zero coding, immediate value.
Tasks:
- [x] `brew install ast-grep difftastic shellcheck yq comby scc sd`
- [x] Verify all tools resolve: `which sg difft shellcheck yq comby scc sd`
## M1: Foundation (MVP)
**Status**: 🔧 In Progress
**Goal**: Working combined extension — hashline read/edit/grep + structural maps on large files.
Tasks:
- [x] Project scaffold (package.json, tsconfig, deps, file structure — includes RTK technique files) — #001 ✅
- [x] Import hashline-edit source files — done as part of #001 scaffold
- [x] Import read-map mapper library into src/readmap/ — done as part of #001 scaffold
- [x] Adapt read-map imports and verify compilation — done as part of #001 (`tsc --noEmit` passes)
- [ ] Integrate map generation into read tool (the ~15-line change) — #004
- [ ] Add map cache — #004
- [ ] Update prompts/read.md — #005
- [ ] Unit & integration tests — #006
- [ ] README, LICENSE, end-to-end verification — #007
## M2: Symbol-Addressable Read
**Status**: Not Started
**Goal**: `read("file.ts", { symbol: "fn" })` → returns just that function, hashlined.
Tasks:
- [ ] Symbol lookup engine (search FileMap by name) — #008
- [ ] Add symbol param to read tool schema — #009
- [ ] Wire symbol lookup into read flow — #009
- [ ] Tests for symbol read — #009
## M3: AST-Grep Pi Tool Wrapper
**Status**: Not Started
**Goal**: Native sg tool with hashlined output.
Tasks:
- [ ] Tool registration + schema — #010
- [ ] sg --json wrapper — #010
- [ ] Hashline formatting of results — #010
- [ ] Tests — #010
## M4: Bash Output Compression (from pi-rtk)
**Status**: 🔧 Partially Complete (source files imported)
**Goal**: Absorb pi-rtk's bash output techniques (test/build/git/linter/ANSI) into the unified extension. NOT from scratch — adapted from pi-rtk v0.1.3 (MIT).
- ✗ source.ts — source code filtering changes hashed content, breaking read↔edit contract
- ✗ search.ts — search result grouping mangles >>FILE:LINE:HASH| grep anchors
Tasks:
- [x] Import RTK technique files (ansi, build, test-output, git, linter, truncate) — done as part of #001 scaffold
- [ ] Create bash-filter.ts routing entry point — #012
- [ ] Hook pi.on("tool_result") in index.ts — bash only, NEVER read/grep/edit — #012
- [ ] Tests (command detection, technique routing, hashline isolation) — #013
