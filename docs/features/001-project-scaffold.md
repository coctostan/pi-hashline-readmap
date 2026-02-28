# Feature: Project Scaffold (Issue #001)

## Summary

Bootstrapped the `pi-hashline-readmap` TypeScript pi extension project by unifying source code from three upstream MIT-licensed packages — `pi-hashline-edit`, `pi-read-map`, and `pi-rtk` — into a single compilable codebase with working test infrastructure.

## Motivation

The project needed a clean starting point before integration work could begin. Rather than building from scratch, upstream packages that had already solved hashline-based file I/O, source-code read-mapping, and red/green refactoring technique helpers were ported in as local source. This avoids npm version coupling during early development and allows the codebase to evolve independently.

## What Was Built

### Project Configuration
| File | Purpose |
|---|---|
| `package.json` | Project manifest; `type: "module"`, all runtime and dev deps, `test` script |
| `tsconfig.json` | TypeScript compiler config targeting ES2022/ESNext with bundler module resolution |
| `vitest.config.ts` | Vitest test runner config; picks up `tests/**/*.test.ts` |
| `index.ts` | Pi extension entry point exporting a default function |

### Source Files (from `pi-hashline-edit@0.3.0`)
Located under `src/`:
- `read.ts` — hashline-annotated file reader
- `edit.ts` — hashline-anchored file editor
- `grep.ts` — hashline-aware grep
- `hashline.ts` — hash computation and line annotation
- `path-utils.ts` — path helpers
- `runtime.ts` — runtime utilities
- `edit-diff.ts` — diff support for edit operations

### Source Files (from `pi-read-map@1.3.0`)
Located under `src/readmap/`:
- `mapper.ts`, `formatter.ts`, `language-detect.ts`, `types.ts`, `constants.ts`, `enums.ts`

Located under `src/readmap/mappers/`:
- `typescript.ts`, `python.ts`, `go.ts`, `rust.ts`, `json.ts`, `markdown.ts`, `fallback.ts`
- Additional: `c.ts`, `clojure.ts`, `cpp.ts`, `csv.ts`, `ctags.ts`, `jsonl.ts`, `sql.ts`, `toml.ts`, `yaml.ts`

### Source Files (from `pi-rtk@0.1.3`)
Located under `src/rtk/`:
- `ansi.ts`, `build.ts`, `test-output.ts`, `git.ts`, `linter.ts`, `truncate.ts`, `index.ts`
- **Excluded by design:** `source.ts`, `search.ts` (not needed in this project)

### Support Files
- `scripts/python_outline.py` — Python AST outline script (from `pi-read-map`)
- `scripts/go_outline.go` — Go AST outline script (from `pi-read-map`)
- `prompts/read.md` — read tool prompt (from `pi-hashline-edit`)
- `prompts/edit.md` — edit tool prompt (from `pi-hashline-edit`)

## Test Infrastructure

8 test files were added under `tests/`, one per acceptance criterion group:

| Test File | ACs Covered | Tests |
|---|---|---|
| `entry-point.test.ts` | AC8 | 2 |
| `hashline-files.test.ts` | AC9 | 6 |
| `readmap-core-files.test.ts` | AC10 | 5 |
| `readmap-mappers-files.test.ts` | AC11 | 7 |
| `rtk-required-files.test.ts` | AC12 | 6 |
| `rtk-forbidden-files.test.ts` | AC13 | 3 |
| `scripts-files.test.ts` | AC14 | 2 |
| `prompts-files.test.ts` | AC15 | 2 |

**Total: 33 tests passing, 0 failing.**

## Dependencies

### Runtime
- `diff ^8.0.3` — text diffing (hashline-edit)
- `xxhashjs ^0.2.2` — fast hashing (hashline-edit)
- `ts-morph ^27.0.2` — TypeScript AST (read-map)
- `tree-sitter 0.22.4` — native parser bindings (read-map)
- `tree-sitter-cpp 0.23.4`, `tree-sitter-rust 0.23.3`, `tree-sitter-clojure` — language grammars (read-map)

### Dev
- `vitest ^4.0.18`
- `typescript ^5.9.3`
- `@types/node`, `@types/xxhashjs`
- `@mariozechner/pi-coding-agent ^0.55.1` (peer)
- `@sinclair/typebox ^0.34.48` (peer)

## Acceptance Criteria Results

All 17 ACs verified — `tsc --noEmit` exits 0, `npm test` exits 0 with 33 passing tests.

## Out of Scope

- Wiring read-map into the hashline `read` tool (M1.3)
- Wiring RTK bash filter into the extension (M4)
- Symbol-addressable read (M2)
- AST-grep tool wrapper (M3)
- README, LICENSE, publishing to npm (M1.5)
- Integration or end-to-end tests
