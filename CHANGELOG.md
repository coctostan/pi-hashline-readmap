# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.14.0] - 2026-08-18

### Changed

- Raised the supported Node.js baseline to 22.19 or newer to match the locked Pi 0.84.2 host, aligned package and lockfile metadata plus user and contributor guidance, and added regression coverage that keeps the package engine synchronized with the exact locked host (#255).

## [0.13.0] - 2026-08-12

### Fixed

- Encoded current static input constraints for `read`, `edit`, `grep`, `ast_search`, `write`, `ls`, `find`, and `nu` in compact provider-visible descriptions. This is metadata-only: JSON Schema structure, runtime validation, errors, and structured results are unchanged. Post-#248 symbol reads remain composable with limits, maps, and local bundles, while `symbol+offset` and bundle-without-symbol remain invalid.

### Documentation

- Added an evidence-based metadata diagnosis and reproducible session scanner. Before/after rates are explicitly correlational because model mix changed; they are not causal proof or a release gate.
- Clarified that registered descriptions, snippets, and guidelines are provider-visible while full `prompts/*.md` bodies are detailed references whose edits do not automatically reach providers.
- Rebuilt the README around installation and the first anchored read/edit, moving current Bash, configuration, context-hygiene, integration, structured-output, and metadata detail into linked package-shipped documents.

## [0.12.0] - 2026-08-10

### Changed
- The C and Swift structural mappers now use tree-sitter AST parsing via the packaged `web-tree-sitter` WASM runtime instead of regex/brace-depth scanning, joining Rust, C++, and Java on the same parsing, memory-hygiene, and error-reporting contracts. C gains correct handling of multiline function-pointer typedefs, K&R definitions, `__attribute__` declarations, unions (marked with a `union` modifier), and anonymous aggregates; Swift gains correct `class`/`struct`/`actor`/`enum`/`extension` disambiguation, operator-overload names, and nested `deinit`/method symbols. Both mapper cache versions are bumped so stale structural maps regenerate (#194).

## [0.11.3] - 2026-08-07

### Fixed

- JSON structural maps now derive exact source ranges from the original JSON text, preserve nested object and array paths, count trailing/no-trailing-newline files consistently, and return the requested property from `read({ symbol })` instead of unrelated ordinal lines. JSON mapper cache identity is bumped so stale range maps are not reused (#237).
- Anchored `edit` batches now reject intersecting replacement/deletion targets and unstable consumed insertion boundaries before mutation, return the structured `overlapping-edit` error, preserve safe duplicate and same-anchor insertion semantics, and leave rejected files unchanged (#238).

## [0.11.2] - 2026-08-03

### Changed
- Runtime Rust, C++, and Java WASM grammars now come from the packaged `@repomix/tree-sitter-wasms` dependency while retaining `web-tree-sitter` 0.26 compatibility (#224).

### Fixed
- `edit` and `write` no longer build changing diff previews from incomplete streamed arguments; pending previews wait for complete arguments before performing file I/O or diff work (#221).
- Bash filtering no longer fabricates successful build summaries for failed commands or trigger words that merely occur as data; failed output is preserved (#222).
- Unsupported long-form `git status` output is preserved instead of being compacted into a misleading clean-status result (#223).
- `grep` keeps the real source line and hash anchor when matched content itself contains colon-delimited numbers such as diagnostic locations (#226).
- `edit` rejects NUL-containing or malformed UTF-8 input before mutation and preserves every original byte (#227).
- Structural-map caches now fingerprint complete files, so same-size changes beyond the first 64 KiB invalidate both in-memory and persistent entries even when mtime is restored (#186).
- Published packages now include the Python and Go mapper source helpers required by installed-layout dedicated mappers (#180).

## [0.11.1] - 2026-06-19

### Fixed
- `find` no longer fails silently for slash-containing globs. `find` matches basenames, not paths, so a pattern like `src/*.ts` or `src/**/*.ts` never matched and returned a bare "No files found" with no explanation. When the pattern contains a `/` and produces no results, the output now appends a hint: `find matches basenames, not paths — drop the directory segment or pass it via path: (e.g. find("*.ts", path: "src/readmap")).` The hint covers both the `fd` and node-fallback backends; matching behavior is unchanged (#220).
## [0.11.0] - 2026-06-18

### Changed
- `write` and `edit` now write files atomically via a shared `src/fs-write.ts` helper (`resolveMutationTargetPath` + `writeFileAtomically`): content is written to a same-directory temp file (`open` with `wx`/`0o600`) and `rename`d over the target, so a target is never left partially written. Symlinked targets are written through to their real target and the symlink is preserved; hard-linked targets (`nlink > 1`) are updated in place so the inode and all links are kept. Existing files preserve their prior permission mode; newly created files keep the OS/umask default. The file-mutation queue is now keyed on the resolved target path so symlink/target aliases serialize. Atomic-write/rename failures (including `EXDEV`) surface through the existing `fs-error` envelope with `fsCode`/`fsMessage` — no new error codes (#215).
- Behavior change: because edits/writes now land via a directory-level `rename`, editing or overwriting a read-only file (`0o444`) that lives in a writable directory now succeeds (previously this failed with `permission-denied`). A write is only refused when the **containing directory** is not writable (#215).

## [0.10.0] - 2026-06-18

### Added
- Collapsed `bash`, `read`, and `grep` TUI results now show a tail preview instead of being content-free: the existing summary line is followed by the last N visual lines of output (default 5), with a muted `… (K earlier line(s) • Ctrl+O to expand)` hint when earlier lines are hidden. Controlled by the new `display.previewLines` setting (env `PI_HASHLINE_PREVIEW_LINES`; precedence env → JSON → default 5); set to `0` to restore the previous content-free collapsed summaries. The change is display-only — model-facing tool text, `details.ptcValue`, RTK bash compression, and the Bash context guard are unchanged. `grep` keeps its expand affordance when the expanded per-file count list adds detail beyond the preview (#214, PR #152).

## [0.8.16] - 2026-05-28

### Changed
- Tree-sitter mappers (`rust`, `cpp`, `java`) now share their low-level helpers (`normalizeWhitespace`, `getNodeText`, `getLineRange`, `findFirstDescendant`, `finalizeSignature`) via `src/readmap/mappers/tree-sitter-helpers.ts`. Behavior-preserving refactor; structural-map output shape is unchanged. `MAPPER_VERSION` bumped (rust 2→3, cpp 2→3, java 3→4), which invalidates persistent-map cache entries for the affected languages on first read (#202, PR #135).
- `write` tool now carries an explicit inline `ptc` policy (mutating, not safe by default) and is registered in `HashlineToolName` and `HASHLINE_TOOL_PTC_POLICY`. The PTC drift guard test was replaced with a mechanical check that cross-references each live tool's inline `ptc` against the exported policy and emitted executor map, so a tool added without a policy entry now fails CI (#201, PR #134).

### Removed
- Dead `BASH_FILTER_ENABLED = true` constant and its unreachable branch in `index.ts`; the live `filterBashOutput` path is unchanged (#200, PR #133).

### Fixed
- TUI renderer tests for the collapsed-diff default (`edit-render-tui.test.ts`, `edit-pending-diff-render-success.test.ts`) are now isolated from the user's real `~/.pi/agent/hashline-readmap/settings.json`, so a machine configured with `edit.diffDisplay: "expanded"` no longer produces false test failures (#200, PR #133).

## [0.8.15] - 2026-05-25

### Changed
- Release 0.8.13: Rust, C++, Java, and edit syntax validation now use `web-tree-sitter` with packaged `tree-sitter-wasms` grammars instead of native `tree-sitter*` packages. Native grammar dependencies were removed and unsupported Clojure mapper support was dropped (#192).
### Fixed
- `ast_search`: when the bundled `@ast-grep/cli` binary cannot be resolved, the PATH fallback now prefers `ast-grep` over `sg`, avoiding the `sg: group 'run' does not exist` error caused by util-linux's setgid `sg` on Linux. Thanks to @Ramblurr for the original investigation in [GH #112](https://github.com/coctostan/pi-hashline-readmap/issues/112) and PR #113.
- `readmap` mappers (`python`, `go`, `fallback`, `json`, `ctags`) now invoke subprocesses via `execFile` or in-process scanning instead of shell `exec`, so paths containing shell metacharacters (`"`, `` ` ``, `$`, `;`, `|`, `&`, newline) no longer break quoting or produce null maps ([GH #116](https://github.com/coctostan/pi-hashline-readmap/issues/116)). Each migrated mapper now carries a comment forbidding `exec`-with-template to prevent regressions.
- TUI diff renderer: pending `write`/`edit` previews now include `+`/`-`/space textual markers in the gutter (`▌+ `, `▌- `, `▌  `) in addition to color, so add/remove rows are distinguishable in plain-text transcripts, screenshots, and screen readers ([GH #190](https://github.com/coctostan/pi-hashline-readmap/issues/190)).

## [0.8.2] - 2026-04-30

### Fixed
- Harden Bash recoverability by validating Pi full-output paths before reading them and by preserving original/pre-RTK snapshots when the Bash context guard trims without a valid Pi original path.
- Preserve recoverability metadata when trim-time original snapshot writing fails.

### Docs
- Document the Bash context guard variables, default-on policy, `PI_HASHLINE_BASH_CONTEXT_GUARD=0`, raw-byte/positive-integer parsing, clamp/fallback semantics, and `PI_RTK_BYPASS=1` interaction.
- Record the release instruction to bump the package number whenever the Bash guard contract docs/release notes are updated.

## [0.8.0] - 2026-04-28

### Added
- Opt-in `grep` final output budget controls via `PI_HASHLINE_GREP_MAX_LINES` and `PI_HASHLINE_GREP_MAX_BYTES`; values can only tighten existing defaults and invalid values fall back safely.
- Phase 0 context-hygiene metadata for read, search, command-output, and mutation tool results, including an opt-in `context_hygiene_report` debug tool behind `PI_CONTEXT_HYGIENE_DEBUG=1`.
- Stale-context contract foundations for mutated-file context tracking and downstream context replacement work.

### Fixed
- `edit`: restore the default shell rendering path.
- `edit`: preserve blank lines in `replace_lines` wrapped-line restoration.
- Structural map cache: validate content hashes on in-memory cache hits to avoid stale maps.

### Docs
- Refresh README configuration, context-hygiene, release, and documentation links for the current codebase.
- Update exploratory functional testing notes for the current suite size and coverage areas.

## [0.7.0] - 2026-04-20

### Added
- Anchor-contract prompt/docs alignment (#42).
- Surface edit semantic annotations + replace-only guidance (#43).
- Require confirmation for fuzzy symbol matches (#44).
- `grep` `scopeContext` windowing (#45).
- `find` regex pattern, `modifiedSince`, `minSize`/`maxSize`, `sortBy`/`reverse` options (#46).
- Expose `ls` / `find` / `nu` hashline executor surface (#47).
- `nu` lazy-load advanced guidelines (#48).
- Structured `ptcValue` error envelopes (#49).
- Doom-loop escalate from warning → append-then-review in `edit` (#50).
- Bash compression raw-bypass via `PI_RTK_BYPASS=1` (#51).
- Persistent structural-map cache across sessions (#52).

### Fixed
- `find`: validate `maxDepth` ≥ 0 before spawning `fd` (#112).
- `read`: reject empty / whitespace-only `symbol` instead of silently returning full file (#113).
- `ls`: validate `limit > 0` and surface invalid-glob errors (#114).
- `ast_search`: report `path '<x>' does not exist` instead of silent "No matches" (#115).
- `write`: map `EACCES`/`EPERM`/`EISDIR`/`ENOENT`/`ENOSPC`/`EROFS` to friendly messages (#116).

### Docs
- `AGENTS.md`: correct extension-loading description (absolute-path entry in `~/.pi/agent/settings.json`, not a symlink) and note the restart requirement for running sessions (#117).
- `README.md`: document persistent map cache, `scopeContext`, new `find` filters, `PI_RTK_BYPASS`, edit semantic summaries, and fuzzy-symbol confirmation banners (#118).

## [0.4.0] - 2026-03-24

### Added
- Semantic edit summaries for `edit`, including additive structured metadata and optional difftastic-backed classification.
- Additive output-contract metadata for `read` local bundles and `grep` symbol-scoped results.
- Render helpers / richer TUI rendering for `read`, `grep`, `edit`, and `sg` tool output.
- Additional RTK compressors and routing improvements for Docker, package managers, HTTP clients, transfer tools, and file-listing commands.
- EventBus / global executor exposure for downstream consumers.
- Public PTC policy / structured output integration for hashline tools.

### Changed
- Repo metadata and docs were cleaned up for the `0.4.0` release.
- README and local agent guidance were refreshed.

## [0.3.0] - 2026-03-16

### Added
- Symbol-addressable reads via `read(path, { symbol })`, including ambiguity handling and graceful fallback warnings.
- Bash output compression filter wired into the extension tool-result flow.
- Faster hash generation via `xxhash-wasm`.
- Lower-syscall `read` / `edit` file access paths.
- Grep output summary headers, smarter truncation, and context-window deduplication.
- AST-grep range merging to reduce duplicate output blocks.
- Compact single-line edit diffs.

### Changed
- README and release metadata were updated for the `0.3.0` release.

## [0.2.0] - 2026-03-03

### Added
- Unified project scaffold combining hashline read/edit/grep behavior, structural read maps, and RTK bash-output compression foundations.
- Core source layout under `src/`, `src/readmap/`, `src/rtk/`, `scripts/`, `prompts/`, and `tests/`.
- Initial Vitest suite and TypeScript project configuration.

## [0.1.0] - 2026-03-02

### Added
- Initial local development baseline for the combined extension workspace.
