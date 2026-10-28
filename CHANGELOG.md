# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Fixed

- An anchored `edit` after the extension's own successful `edit` or `write` to the same file no longer demands a re-read on the next turn. The own mutation used to expire the file's freshness, so the shift remapping added for own writes never ran across turns; a change made outside the extension (bash, another process) still requires fresh anchors.

## [0.16.1] - 2026-10-14

### Fixed

- Restore all eight numeric parameter hints in codemode declarations for `read`, `grep`, and `ast_search` without changing number/string validation or coercion (#277).
- Clarify that `find` entries are relative to the resolved search root (`path`, default cwd), and that `ls` returns basenames to join with its resolved absolute directory; expose the joining guidance in registered metadata, output comments, and examples (#278).
- Return the existing coded `file-not-found` failure for delegated image ENOENT in value mode, while preserving default rejection, joined-image success, and non-ENOENT exceptions (#279).

### Changed

- Update the independently pinned runtime and declaration compatibility lane to Pi 1.2.0 while retaining the locked Pi 0.84.2 lane, mandatory Nu assertions, and historical benchmark measurements.
- Compact repetitive tool metadata to keep all nine tool sections and required safety hints within the unchanged default codemode inline budget.

## [0.16.0] - 2026-10-12

### Added

- `read` can recover any part of a long line: `charOffset` (with `offset`) and `charLimit` select a bounded window (default 500 characters, capped at 10,000) of one line. The `LINE:HASH` anchor is still computed from the full line, results report remaining characters and the next call, and `ptcValue.window` / rehydration descriptors carry the window. Thanks to CrazyCoder (#219), whose proposal motivated this. The unbounded `unclipped` flag and the settings-gated `read.allowUnclipped` schema variation from that PR were intentionally not adopted, to keep reads context-bounded and the tool schema static (#268).
- `edit` accepts optional `literal: true` on `set_line`, `replace_lines` and `insert_after` to write `new_text` exactly as given, skipping prefix cleanup and the `insert_after` anchor-echo drop (#270).
- Line-shifting edits report `Line numbers shifted by ±K from old line N; …` so callers know which earlier anchors are stale (#271).

### Changed

- Clipped long lines in `read` output now end with `... [truncated, N chars total; read({offset:L, charOffset:K})]`, telling the agent how to fetch the remainder. A cut that would split a surrogate pair now backs off by one character.
- Ship a bundled `dist/index.js` (esbuild, ESM syntax, npm packages external, `dist/package.json` typed `commonjs`) as the Pi entry, cutting extension startup versus loading ~107 TypeScript modules through jiti; an unbuilt checkout still loads `index.ts`. Prompts and outline scripts resolve from the package root in both layouts. Based on the measurements and proposal in PR #226 by valentinoPereira; see `docs/startup-performance.md` (#267).

### Deprecated

- Bundled `nu` is deprecated, not removed. Nu remains available for at least one published deprecation release; removal occurs only in a separately announced breaking release after migration-example verification and the removal checklist pass. Registration, binary provisioning, configuration, execution results, and compatibility assertions are unchanged. Prefer dedicated file tools plus codemode composition and Bash for external CLIs. See [Nu deprecation and migration](docs/nu-deprecation.md) for tested replacements, Nushell retention options, and the removal checklist (#266).

### Fixed

- `edit` no longer silently rewrites `new_text`: a `LINE:HASH|` prefix is removed only when it is a real anchor of the file's current lines, bare `HASH|` prefixes only when every line carries a hash of this file, and leading `+` is never removed. Look-alike content such as `12:30|meeting`, `abc|def`, `+ item` and `+1` is written verbatim, and any removal is reported as a warning (#270).
- An anchor from a view taken before the tool's own line-shifting edit can no longer land on a different line with the same hash. It is remapped to where its line moved when unambiguous (with a note), and otherwise refused with `hash-mismatch` and fresh rows. The pending-diff preview applies the same check (#271).
- `ast_search` patterns that start with `-` (`--$A`, `-$A`, `--help`) are now searched instead of failing as ast-grep CLI flags; the pattern is passed as a single `--pattern=<p>` argument (#272).
- `ast_search` reports a `pattern-parse-error` (`Pattern failed to parse: …`) when ast-grep warns that a pattern with no matches contains a syntax ERROR node, instead of "No matches found". A valid pattern that matches nothing still returns `No matches found for pattern: …` (#272).
- `ast_search` rejects empty or whitespace-only patterns with `invalid-pattern` before running ast-grep, and no longer prefixes errors with the `@ast-grep/cli` "postinstall script did not run" banner (#272).
- `write` of more than 2000 lines or 50 KB of anchor text returns a short summary (`Wrote <path> (<N> lines, <B> bytes). … use read with offset/limit to get anchors before editing.`) instead of up to 50 KB of anchors with a hint pointing at the invisible `ptcValue`. Its structured value is bounded (`lines: []`, `truncated: true`, `totalLines`, `bytes`, an `anchors-omitted` warning, no `diff`/`diffData`), which fixes the codemode `out of memory` error on very large writes. Smaller writes are unchanged (#273).
- `write` of binary-looking content now succeeds with a `binary-content` warning instead of being reported as an error after the file was written. Content with bare carriage returns is still refused (#273).
- `write` rejects non-string `path`/`content` with an `invalid-type` error instead of a raw `TypeError` or a misleading `fs-error`. Pi hosts convert numbers and booleans to strings before the tool runs; this is now documented (#273).

## [0.15.1]

### Fixed

- Keep symbol ranges, selected source lines, local support, and appended maps on the same captured snapshot during concurrent writes; isolate snapshot-map caches and return `read-snapshot-unavailable` without an edit baseline if snapshot acquisition fails (#228).

## [0.15.0] - 2026-10-02

### Added

- Pi codemode integration: `read`, `grep`, `ast_search`, `edit`, `write`, `ls`, and `find` declare compact `outputSchema`s and return `structuredContent` (`{ text, ...ptcValue }`) on success. Codemode scripts receive anchors and raw lines instead of rendered text, and `grep` script records include `raw`. Error results keep rejecting in scripts.
- MCP-style tool `annotations`: the read-only tools are marked `readOnlyHint`, while `edit` and `write` are marked `destructiveHint`. `bash` and `nu` keep Pi's conservative defaults.
- Real Pi codemode executor test (`tests/pi-host-codemode.test.ts`) chaining `grep` → `edit` → `read` in a script.
- `edit` refuses to overwrite lines that changed on disk since the model was shown them, including lines inside a `replace_lines` range and lines matched by text `replace` (previously only the named anchor lines were verified). The refusal returns the current rows with fresh anchors, which count as seen for the retry.
- Small-model input tolerance: anchors pasted without a line number (`HASH` or `HASH|content`) resolve when exactly one line matches; `replace.old_text` pasted with `LINE:HASH|` row prefixes matches those rows as whole lines; CRLF `old_text` matches LF-normalized files; `text-not-found` lists the closest current lines with anchors; `replace_symbol` aimed at a line explains how to use `set_line`.
- `tests/edit-scenarios.test.ts`: the 34 pi-edit-benchmark scenarios as deterministic tool-level tests.
- `copy_lines` and `move_lines` edit variants: copy or move an anchored line range to after an anchor, byte for byte, within the file or from another file via `from_path` (a cross-file `move_lines` also deletes the range from the source in the same call). Models no longer retype blocks, which dropped invisible characters and added stray blank lines. A source range that changed since it was read is refused with fresh anchors, and nothing is written.
- Corrupted-retype guard: an anchored edit whose new text retypes 3 or more lines the model was shown, but changes invisible or lookalike characters in them (zero-width characters, non-breaking spaces, lookalike hyphens), is refused with `corrupted-retype` and a ready-to-use `copy_lines` call. Byte-identical retypes and in-place rewrites of the replaced lines are allowed.
- `scripts/bench/explicit-edit.mjs`: local macOS runner for the Explicit Edit benchmark tasks through headless Pi, comparing arms (`pi-default`, `ref:<git>`, `working`). See `docs/benchmarking.md`.

### Changed

- The independent current-host compatibility lane now pins Pi 1.0.0 (was 0.99.1) and also runs the codemode test.
- Anchor hashes include whitespace (only a trailing CR is ignored). A reindent or trailing-space change makes an anchor stale instead of letting a stale view be written back.
- `read` and `write` no longer show a phantom empty last row for files ending in a newline. Anchors on that row from older reads still work, and `insert_after` on the last line keeps the final newline.
- Replacements are applied literally: wrapped lines are no longer collapsed back, and boundary lines repeated in `new_text` are kept (with a duplicate-line warning) rather than silently dropped.
- An edit that produces identical content is a successful no-op (`ptcValue.ok: true, noop: true`) instead of a `no-op` error, so models stop retrying it.
- A text `replace` with an exact, unique `old_text` no longer requires a prior `read`. A non-unique `old_text` without `all: true` is refused with `ambiguous-match` and the matching lines' anchors, instead of silently editing the first occurrence. Rows shown in edit refusals count as read, so their anchors can be used directly.

### Removed (breaking)

- PTC integration surfaces, which Pi codemode replaced: the `HASHLINE_TOOL_PTC_POLICY` / `getHashlineToolPtcPolicy` exports and their types, per-tool `ptc` metadata (including `LS_PTC`, `FIND_PTC`, and `NU_PTC`), and the executor map published on the `hashline:tool-executors` EventBus channel and `globalThis.__hashlineToolExecutors`. Use `ctx.executeTool()` and tool `annotations` instead. `details.ptcValue` keeps its historical name because sessions persist it and renderers read it.
- Content-similarity relocation of stale anchors (`Fuzzy-relocated anchor ...`). A changed line is now always refused with fresh anchors rather than matched to a similar line.

### Fixed

- Tool calls issued by codemode scripts (`parentToolCallId`) no longer count toward repeated-call warnings. Doom-loop and context-hygiene notices are no longer prefixed onto (and consumed by) nested results that only scripts see; they go to the next model-visible result. Context-hygiene effects of nested calls are still recorded.

## [0.14.1]

### Fixed

- Reject required JSON `null` arguments before Pi's schema conversion can turn them into valid-looking scalars and cause unintended reads or writes; preserve optional-null omission, numeric-string acceptance, and literal `"null"` values (#258).
- Accept both npm 11 array and npm 12 keyed-object `npm pack --json` results in package-content and mapper-tarball regression tests (#258).

### Added

- Real-host pipeline regression coverage across registered tools and an independent, pinned Pi 0.99.1 CI lane with an npm 11/12 matrix; document the host's preparation-error metadata limitation (#258).

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
