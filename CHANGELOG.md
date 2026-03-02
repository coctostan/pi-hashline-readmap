# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- Project scaffold: `package.json`, `tsconfig.json`, `vitest.config.ts`, and `index.ts` entry point (#001)
- Hashline-edit source files under `src/`: `read.ts`, `edit.ts`, `grep.ts`, `hashline.ts`, `path-utils.ts`, `runtime.ts`, `edit-diff.ts` (#001)
- Read-map core files under `src/readmap/`: `mapper.ts`, `formatter.ts`, `language-detect.ts`, `types.ts`, `constants.ts`, `enums.ts` (#001)
- Read-map language mappers under `src/readmap/mappers/`: TypeScript, Python, Go, Rust, JSON, Markdown, Fallback, and more (#001)
- RTK technique files under `src/rtk/`: `ansi.ts`, `build.ts`, `test-output.ts`, `git.ts`, `linter.ts`, `truncate.ts` (#001)
- Outline scripts under `scripts/`: `python_outline.py`, `go_outline.go` (#001)
- Prompt templates under `prompts/`: `read.md`, `edit.md` (#001)
- Vitest test suite with 33 tests covering all scaffold acceptance criteria (#001)
- Added symbol-addressable reads via `read(path, { symbol })` with tiered symbol lookup, ambiguity handling, graceful fallback warnings, and prompt documentation updates (#015)
- Bash output compression filter: `src/rtk/bash-filter.ts` routes bash tool results through the appropriate RTK technique (test aggregation, git compaction, build filtering, linter aggregation) with ANSI stripping, null-fallthrough between overlapping routes, and graceful error fallback; wired into `index.ts` via `pi.on("tool_result")` with hashline-safe gating and optional savings logging via `PI_RTK_SAVINGS=1` (#016)
- Replaced `xxhashjs` with `xxhash-wasm` for ~50-100x faster hash computation; `ensureHashInit()` handles one-time async WASM init as a lazy singleton; added `hashLine()` and `hashLines()` convenience exports (#025)
- Eliminated `fsAccess()` pre-checks in `read.ts` and `edit.ts`, reducing syscalls per operation from 2 to 1 by catching `ENOENT`/`EISDIR`/`EACCES` directly from `fsReadFile()` (#025)
- Added grep output summary header `[N matches in M files]` and per-file match counts `--- path (K matches) ---` (#026)
- Added grep smart truncation: when total matches exceed 50, each file is capped at 10 shown matches with a `... +K more matches` footer (#026)
- Added grep context deduplication: overlapping context windows from adjacent matches are merged so each source line appears at most once; non-adjacent groups are separated by `--` (#026)
- Added sg range merging: overlapping and adjacent ast-grep match ranges (gap ≤ 1 line) are merged before output, eliminating duplicate lines (#027)
- Added compact single-line edit diffs: `set_line` changes on one line now produce `LINE:HASH|old → LINE:HASH|new` instead of a full unified diff; multi-line edits continue to use the full format (#027)
