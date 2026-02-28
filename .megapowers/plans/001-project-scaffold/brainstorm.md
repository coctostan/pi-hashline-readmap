# Brainstorm: 001-project-scaffold

## Approach

Set up the project skeleton for `pi-hashline-readmap` — a combined pi extension merging three upstream sources: hashline-edit (hash-anchored read/edit/grep), read-map (structural file maps for large files), and rtk (bash output compression techniques). This is M1.1 from the roadmap: pure scaffolding with no integration logic.

The scaffold initializes a TypeScript project with vitest, copies source files from all three upstreams into a unified directory structure, configures combined dependencies, and verifies a clean build. hashline-edit is the base (it owns the read/edit/grep tool registrations). read-map's mapper library goes into `src/readmap/`. RTK's bash techniques go into `src/rtk/` (excluding `source.ts` and `search.ts` which would conflict with hashline). Scripts for Python/Go outline extraction are copied into `scripts/`.

No wiring happens in this issue — read-map integration is M1.3, RTK wiring is M4. The scaffold just ensures all code compiles together without conflicts.

## Key Decisions

- **hashline-edit is the base** — it owns tool registration (read, edit, grep). read-map and rtk are libraries grafted in.
- **Include RTK techniques now** — they're just files with no dependencies on the rest. Having them in-tree means M4 is purely a wiring task.
- **Exclude RTK's `source.ts` and `search.ts`** — these would conflict with hashline's read and grep tools.
- **read-map code goes in `src/readmap/`** — clean namespace separation from hashline's existing `src/` files.
- **vitest for testing** — consistent with both upstream projects.
- **Combined dependencies in one package.json** — hashline's (xxhashjs, diff) + read-map's (tree-sitter, tree-sitter-cpp, tree-sitter-rust, tree-sitter-clojure, ts-morph) + peer deps (@mariozechner/pi-coding-agent, @sinclair/typebox).

## Components

1. **`package.json`** — combined deps from all three upstreams, scripts for build/test/lint
2. **`tsconfig.json`** — TypeScript config targeting the pi extension environment
3. **`vitest.config.ts`** — test infrastructure
4. **`index.ts`** — extension entry point (from hashline-edit, unchanged for now)
5. **`src/`** — hashline-edit source files (read.ts, edit.ts, edit-diff.ts, grep.ts, hashline.ts, path-utils.ts, runtime.ts)
6. **`src/readmap/`** — read-map mapper library (mapper.ts, formatter.ts, language-detect.ts, types.ts, enums.ts, constants.ts, mappers/*.ts)
7. **`src/rtk/`** — RTK techniques (ansi.ts, build.ts, test-output.ts, git.ts, linter.ts, truncate.ts) — NOT source.ts, NOT search.ts
8. **`prompts/`** — hashline prompt templates (from hashline-edit)
9. **`scripts/`** — python_outline.py, go_outline.go (from read-map)

## Testing Strategy

- **Build verification**: `tsc --noEmit` passes with zero errors — all three codebases compile together
- **Existing unit tests**: Port and run hashline-edit's tests and read-map's unit tests to verify they pass in the new structure
- **Import resolution**: Verify all cross-module imports resolve correctly (especially read-map's `.js` → `.ts` extension adjustments)
- **No integration tests yet** — that's M1.3/M1.4 scope

## Upstream Sources

- **hashline-edit**: https://github.com/RimuruW/pi-hashline-edit (v0.3.0, MIT)
- **read-map**: https://github.com/Whamp/pi-read-map (v1.3.0, MIT)
- **rtk**: https://github.com/mcowger/pi-rtk (v0.1.3, MIT)
