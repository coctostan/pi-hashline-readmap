# Spec: 001-project-scaffold

## Goal

Scaffold a TypeScript pi extension project (`pi-hashline-readmap`) that unifies source code from three upstream MIT-licensed projects — hashline-edit, read-map, and rtk — into a single compilable codebase with working test infrastructure. No integration logic; just files, dependencies, and a clean build.

## Acceptance Criteria

1. `package.json` exists at the project root with `name` set to `pi-hashline-readmap` and `type` set to `module`
2. `package.json` includes hashline-edit runtime dependencies: `xxhashjs`, `diff`
3. `package.json` includes read-map runtime dependencies: `ts-morph`, `tree-sitter`, `tree-sitter-cpp`, `tree-sitter-rust`, `tree-sitter-clojure`
4. `package.json` includes `vitest` as a devDependency
5. `package.json` has a `test` script that runs vitest
6. `tsconfig.json` exists and targets ESM output compatible with pi extensions
7. `vitest.config.ts` exists at the project root
8. `index.ts` exists at the project root and exports a default function (the pi extension entry point)
9. hashline-edit source files exist under `src/`: `read.ts`, `edit.ts`, `grep.ts`, `hashline.ts`, `path-utils.ts`, `runtime.ts`
10. read-map mapper library exists under `src/readmap/`: at minimum `mapper.ts`, `formatter.ts`, `language-detect.ts`, `types.ts`, `constants.ts`
11. read-map language mappers exist under `src/readmap/mappers/`: at minimum `typescript.ts`, `python.ts`, `go.ts`, `rust.ts`, `json.ts`, `markdown.ts`, `fallback.ts`
12. RTK technique files exist under `src/rtk/`: `ansi.ts`, `build.ts`, `test-output.ts`, `git.ts`, `linter.ts`, `truncate.ts`
13. RTK files `source.ts` and `search.ts` do NOT exist anywhere in `src/rtk/`
14. `scripts/python_outline.py` and `scripts/go_outline.go` exist
15. `prompts/` directory exists with at least one `.md` prompt file
16. `tsc --noEmit` exits with code 0 (zero type errors)
17. `npm test` exits with code 0 (vitest runs and finds at least one passing test)

## Out of Scope

- Wiring read-map into the hashline read tool (M1.3)
- Wiring RTK bash filter into the extension (M4)
- Symbol-addressable read (M2)
- AST-grep tool wrapper (M3)
- README, LICENSE, or publishing to npm (M1.5)
- Integration or end-to-end tests

## Open Questions

None.
