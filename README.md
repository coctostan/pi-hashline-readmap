# pi-hashline-readmap

![pi-hashline-readmap banner](https://raw.githubusercontent.com/coctostan/pi-hashline-readmap/main/banner.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/pi-hashline-readmap)](https://www.npmjs.com/package/pi-hashline-readmap)

Upgrade pi's local coding workflow with hash-anchored text reads and edits, stock-pi-compatible image reads, structural file maps, symbol-aware navigation, structural search, agent-friendly file exploration, and compressed `bash` output.

`pi-hashline-readmap` is a drop-in [pi](https://github.com/mariozechner/pi-coding-agent) extension. It replaces the stock `read`, `edit`, `grep`, `ls`, and `find` tools, provides an enhanced `ast_search` tool, registers `write`, adds an optional `nu` tool for structured exploration via Nushell, and post-processes `bash` output so more context budget goes to signal instead of noise.

It also reduces extension conflict risk by replacing several overlapping tool packages with one coordinated implementation.

## Why use it?

- Keep edits tied to stable `LINE:HASH` anchors instead of fragile line numbers.
- Navigate large files with structural maps and direct symbol reads.
- Read supported images and screenshots through pi-compatible image attachments instead of ad hoc OCR/tooling.
- Turn search results into edit anchors without an extra read step.
- Search code structurally with `ast_search` when text search is too brittle.
- Keep readmap subprocesses safe for paths containing shell metacharacters such as `"` and `$`.
- Read pending write/edit diffs without color thanks to textual `+`/`-`/space gutter markers.
- Explore files with agent-oriented `ls`, `find`, and optional `nu` tools.
- Compress noisy test, build, Git, Docker, linter, package-manager, HTTP, transfer, and generic command output.
- See a tail preview of collapsed `bash`, `read`, and `grep` results instead of a content-free summary — configurable via `display.previewLines` (default 5, `0` to disable).
- Use one extension instead of stacking overlapping `read`, `grep`, `edit`, and Bash-output packages.

## Installation

### Requirements

- [pi](https://github.com/mariozechner/pi-coding-agent) with extension support
- Node.js **>= 20** for package installation/runtime; use a current Node LTS/current release for local development

### From npm

```bash
pi install npm:pi-hashline-readmap
```

### From GitHub

```bash
pi install git:github.com/coctostan/pi-hashline-readmap
```

### From a local checkout

```bash
git clone https://github.com/coctostan/pi-hashline-readmap.git
cd pi-hashline-readmap
npm install
pi install .
```

Start a new pi session after installation. Running sessions do not hot-reload extension code or tool registrations.

### CLI dependencies and optional local tools

Normal npm installs of `pi-hashline-readmap` include npm-managed CLI packages for the tools this extension wraps:

- `@ast-grep/cli` (an **optional dependency**) provides the `sg` binary used by `ast_search`. It ships prebuilt native binaries for common platforms. On platforms without a prebuilt binary (for example Termux/Android, or musl-based Linux), npm skips this optional package and the rest of the extension (`read`/`edit`/`grep`/`bash`/`ls`/`find`/`nu`) still installs and works normally.
- `nushell` provides the `nu` binary used by the optional `nu` tool.

The extension resolves those bundled binaries first. If `@ast-grep/cli` cannot be resolved (for example when npm skipped the optional package on Termux/Android/musl), `ast_search` falls back to `ast-grep` on `PATH` rather than `sg`, avoiding Linux util-linux `sg` collisions. If no `ast-grep` is available at all, `ast_search` returns a clear "ast-grep not available" message instead of crashing, and every other tool is unaffected. The optional `nu` tool falls back to `nu` on `PATH` when the bundled `nushell` package or bin entry is unavailable. To enable `ast_search` on a platform without a prebuilt binary, or when troubleshooting a broken platform package, install `ast-grep` on your `PATH`:

```bash
brew install ast-grep          # fallback for ast_search if @ast-grep/cli cannot run
brew install nushell           # fallback for the nu tool if the npm nushell package cannot run
brew install fd                # optional, speeds up find
brew install universal-ctags   # optional, symbol maps for languages without a dedicated mapper
brew install difftastic        # optional, improves semantic edit summaries
brew install shellcheck yq scc # optional, improves some bash-output compression paths
```

Dedicated readmap mappers handle TypeScript, JavaScript, Python, Rust, Go, Java, C, C++, Swift, shell, SQL, Markdown, JSON/JSONL, YAML, TOML, CSV/TSV, and opt-in GDScript with the highest-quality structural maps. Rust, C, C++, Java, and Swift structural maps use `web-tree-sitter` 0.26 with packaged `@repomix/tree-sitter-wasms` grammars. C/C++ headers share the C++ mapper, and no native tree-sitter packages are installed for those mappers. For files outside that set, the read tool's structural map falls back to universal-ctags when it is installed, and to a generic regex-based extractor when it is not. Installing universal-ctags is therefore only worthwhile if you regularly read files in languages without a dedicated mapper (for example Ruby, PHP, Lua, Kotlin) and want symbol-aware maps for them.

### Bash output contract

The `bash` tool exposes a stable, documented public contract on its result
`details` (notably `details.rtkCompaction` for RTK compaction metadata,
mirrored under `details.ptcValue.rtkCompaction`). Display extensions and
downstream consumers should rely on that contract rather than on internal
fields. See [`prompts/bash.md`](prompts/bash.md) for the full schema.

## 30-second example

The core workflow is: read a file, copy a `LINE:HASH` anchor, and edit against that verified anchor.

```text
read({ path: "tests/fixtures/small.ts" })

# Example output:
45:4bf|export function createDemoDirectory(): UserDirectory {
```

```text
edit({
  path: "tests/fixtures/small.ts",
  edits: [
    {
      set_line: {
        anchor: "45:4bf",
        new_text: "export function buildDemoDirectory(): UserDirectory {"
      }
    }
  ]
})
```

Before writing, `edit` verifies that anchor against the current file contents. If the file changed, it reports a mismatch instead of silently editing the wrong line.

## Common workflows

### Safely edit a line

Use `read` first, then pass the copied anchor to `edit`.

```text
read({ path: "src/example.ts" })
edit({
  path: "src/example.ts",
  edits: [
    { set_line: { anchor: "12:abc", new_text: "const enabled = true;" } }
  ]
})
```

`read`, `grep`, `ast_search`, and `write` all return hashlined output that can feed follow-up edits.

### Editing notes

- `new_text` is plain file content — never include `LINE:HASH|`, hash-only (`a1b|`), or `+` diff prefixes. `edit` strips them defensively when they dominate the replacement, but you should omit them.
- Set `new_text` to `""` to delete the anchored line(s); use `"\n"` for an intentionally blank line.
- `replace` is exact-only by default. `fuzzy: true` only normalizes whitespace and confusable Unicode after an exact match fails — it is not approximate or semantic matching.
- Anchored edit batches are validated against resolved original-file targets before writing. Unsafe overlapping replacements/deletions or consumed `insert_after` boundaries fail with the structured `overlapping-edit` error and leave the file unchanged. Keep batch targets disjoint, or put dependent changes in separate `edit` calls; a one-line replacement plus `insert_after` on that same stable line remains valid.

### Create a new file with `write`

```text
write({ path: "src/new-module.ts", content: "export const demo = 1;\n" })
```

`write` creates parent directories automatically and returns hashlined output for immediate refinement.

Both `write` and `edit` write atomically (temp file in the same directory, then `rename` over the target), so a target file is never observed half-written. Symlinked targets are written through to their real target and the symlink is preserved. Hard-linked targets (`nlink > 1`) are the one exception: to keep the shared inode and all links, they are updated in place rather than via temp+rename, so that single case is not torn-write atomic. Existing files keep their permission mode; newly created files use the OS/umask default.

### Navigate a large file

```text
read({ path: "src/hashline.ts", map: true })
read({ path: "tests/fixtures/small.ts", symbol: "createDemoDirectory" })
read({ path: "src/read.ts", symbol: "registerReadTool", limit: 80 })
read({ path: "tests/fixtures/small.ts", symbol: "UserDirectory.addUser", map: true })
```

Structural maps are appended automatically when large text reads are truncated. The readmap supports TypeScript, JavaScript, Python, Rust, Go, Java, Swift, Shell, C/C++, SQL, JSON/JSONL, Markdown, YAML, TOML, CSV/TSV, and opt-in GDScript. Direct symbol reads can target functions, classes, methods, interfaces, type aliases, constants, and enums when the file type is supported. A symbol may be combined with `limit` to cap its displayed range and with `map: true` to append the full-file map. `offset` remains invalid with `symbol`; use `limit` alone or a trailing `symbol@line` selector instead.

### Read a symbol with local support

```text
read({ path: "tests/fixtures/small.ts", symbol: "createDemoDirectory", bundle: "local" })
read({ path: "tests/fixtures/small.ts", symbol: "createDemoDirectory", limit: 2, bundle: "local", map: true })
```

Use `bundle: "local"` when you want the requested symbol plus direct same-file local support. A bundle requires `symbol` and may be combined with `limit` and `map: true`; output is ordered as requested symbol, local support, then full-file map.

### Read an image or screenshot

```text
read({ path: "screenshot.png" })
```

Supported images (`jpg`, `jpeg`, `png`, `gif`, and `webp`) are delegated to pi's stock image reader and return image attachments, not `LINE:HASH` edit anchors. Hashline also detects supported image magic bytes for extensionless or misnamed files before falling back to binary/text handling.

### Search and patch

```text
grep({ pattern: "createDemoDirectory", path: "tests/fixtures", literal: true })
grep({ pattern: "createDemoDirectory", path: "tests/fixtures", literal: true, scope: "symbol" })
grep({ pattern: "createDemoDirectory", path: "tests/fixtures", literal: true, scope: "symbol", scopeContext: 3 })
```

`grep` returns anchored matches, supports literal and regex search, can summarize matches with `summary: true`, and can scope output to enclosing symbols. Use `scopeContext: 0` for only matching lines inside the resolved symbol block.

### Replace a whole symbol

Use `replace_symbol` inside `edit` to swap an entire function, method, or class declaration by name — no anchors needed:

```text
edit({
  path: "src/foo.ts",
  edits: [
    {
      replace_symbol: {
        symbol: "add",
        new_body: "export function add(a: number, b: number) {\n  return a + b + 1;\n}"
      }
    }
  ]
})
```

`replace_symbol` resolves the symbol with the same symbol-query syntax as `read symbol:"..."` for precise in-memory mappers currently registered for TypeScript, JavaScript, Rust, and Java. For files with multiple overloads of the same name, append `@<line>` to select the exact declaration:

```text
replace_symbol: { symbol: "Foo.bar@42", new_body: "..." }
```

The new body is automatically re-indented to match the original symbol's leading indentation. After the write, the tree-sitter syntax-regression validator checks for net-new parse errors:

- `warn` (default) — write succeeds; a `syntax-regression` warning is appended.
- `block` — write is aborted with the `syntax-regression` ptc error code.
- `off` — validation skipped.

Set the mode with `PI_HASHLINE_SYNTAX_VALIDATE=block|warn|off`. See [prompts/edit.md](prompts/edit.md) for the full `replace_symbol` contract, supported-language scope, `Class.method@line` disambiguation rules, and error-precedence ordering. See [prompts/read.md](prompts/read.md) for the broader `read symbol:"..."` lookup contract.

### Search code structurally

```text
ast_search({ pattern: "console.log($$$ARGS)", lang: "typescript", path: "src", limit: 100 })
```

`ast_search` wraps local `ast-grep`, limits raw match records before merging ranges, and returns grouped edit-ready anchors. The positive result limit defaults to 100. Deterministic line/byte ceilings apply to the complete visible response, with whole-block truncation guidance; structured PTC data retains every record admitted by the result limit, and TUI summaries distinguish anchored lines from omitted AST matches.

### Explore files

```text
ls({ path: "src" })
find({ pattern: "*.ts", path: "src", maxDepth: 2 })
nu({ command: "open package.json | get scripts" })
```

`ls` shows one directory with directories first and dotfiles included. `find` performs recursive discovery, respects `.gitignore`, includes hidden files, and supports depth, regex, sort, mtime, and size filters. `find` matches basenames, not paths — pass directories via `path:` (e.g. `find({ pattern: "*.ts", path: "src" })`) rather than embedding them in the glob; a slash-containing glob that matches nothing returns a hint explaining this. `nu` registers only when Nushell is installed and is useful for structured JSON, CSV, TOML, YAML, and filesystem inspection.

### Handle noisy command output

The extension post-processes `bash` results to reduce noise while preserving useful output. Route-specific compression covers test runners, builds, compilers, Git, linters, Docker, package managers, HTTP clients, transfer tools, file-listing output, and oversized generic output.

Use `PI_RTK_BYPASS=1` when route-specific compression hides something you need:

```bash
PI_RTK_BYPASS=1 npm test
PI_RTK_BYPASS=1 git log --stat
```

`PI_RTK_BYPASS=1` does not disable the Bash context guard; very large raw output can still be replaced with a recoverable preview unless `PI_HASHLINE_BASH_CONTEXT_GUARD=0` is also set. See [docs/bash-output.md](docs/bash-output.md) for the full layered behavior and recovery details.

## Configuration

Most users do not need configuration. Durable Hashline options can live in JSON settings files, while existing environment variables remain supported for temporary overrides and are **not deprecated**.

Canonical settings files:

- Global: `~/.pi/agent/hashline-readmap/settings.json`
- Project: `<repo>/.pi/hashline-readmap/settings.json`

Precedence is: environment variables > project JSON > global JSON > built-in defaults. Project JSON overrides global JSON field-by-field. Unsupported legacy or alias paths are intentionally not read: `~/.pi/agent/settings.json`, `<repo>/.pi/settings.json`, `~/.pi/hashline-readmap/settings.json`, and `<repo>/.pi/hashline-readmap.json`.

Example project settings:

```json
{
  "grep": {
    "maxLines": 1200,
    "maxBytes": 40960
  },
  "mapCache": {
    "dir": ".cache/hashline/maps",
    "enabled": true
  },
  "bashContextGuard": {
    "enabled": true,
    "maxLines": 1500,
    "maxBytes": 40960,
    "headLines": 60,
    "tailLines": 100
  },
  "gdscript": {
    "enabled": false
  },
  "edit": {
    "diffDisplay": "collapsed"
  },
  "display": {
    "previewLines": 5
  },
  "bash": {
    "shellPath": "C:/Program Files/Git/bin/bash.exe"
  }
}
```

JSON fields:

| JSON field | Environment override | Default / ceiling behavior |
|---|---|---|
| `grep.maxLines` | `PI_HASHLINE_GREP_MAX_LINES` | Tightens `grep`'s final visible line budget; above-default values are clamped down to the built-in default |
| `grep.maxBytes` | `PI_HASHLINE_GREP_MAX_BYTES` | Tightens `grep`'s final visible byte budget; above-default values are clamped down to the built-in default |
| `mapCache.dir` | `PI_HASHLINE_MAP_CACHE_DIR` | Overrides the persistent structural-map cache directory; otherwise falls back to `$XDG_CACHE_HOME/pi-hashline-readmap/maps`, then `~/.cache/pi-hashline-readmap/maps` |
| `mapCache.enabled` | `PI_HASHLINE_NO_PERSIST_MAPS=1` | Defaults to `true`; the env var disables on-disk map caching regardless of JSON |
| `bashContextGuard.enabled` | `PI_HASHLINE_BASH_CONTEXT_GUARD` | Defaults to `true`; exact env value `0` disables the guard, any other set value enables it |
| `bashContextGuard.maxLines` | `PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES` | Tightens the post-RTK Bash guard line budget; default/ceiling `2000` |
| `bashContextGuard.maxBytes` | `PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_BYTES` | Tightens the post-RTK Bash guard byte budget; default/ceiling `51200` raw bytes |
| `bashContextGuard.headLines` | `PI_HASHLINE_BASH_CONTEXT_GUARD_HEAD_LINES` | Tightens the guarded preview head size; default/ceiling `80` |
| `bashContextGuard.tailLines` | `PI_HASHLINE_BASH_CONTEXT_GUARD_TAIL_LINES` | Tightens the guarded preview tail size; default/ceiling `120` |
| `gdscript.enabled` | `PI_HASHLINE_GDSCRIPT` | Defaults to `false`; exact env value `1` enables the dedicated GDScript mapper and takes precedence over JSON |
| `edit.diffDisplay` | `PI_HASHLINE_EDIT_DIFF_DISPLAY` | Defaults to `collapsed`; set to `expanded` to render `edit` tool diffs inline without pressing Ctrl+O. Project JSON overrides global JSON. The env override is case-insensitive (`expanded`/`collapsed` in any casing, with surrounding whitespace trimmed); unrecognized env values are ignored and fall through to JSON, then the default. |
| `display.previewLines` | `PI_HASHLINE_PREVIEW_LINES` | Defaults to `5`; controls how many trailing (tail) lines of `bash`, `read`, and `grep` output appear in the collapsed result preview. Set to `0` to restore fully content-free collapsed summaries. Must be a non-negative base-10 integer (env values are whitespace-trimmed; invalid values are ignored and fall through to JSON, then the default). Project JSON overrides global JSON. |
| `bash.shellPath` | `PI_HASHLINE_SHELL_PATH` | Absolute path to the shell the `bash` tool should spawn (e.g. Git Bash on Windows). When set, this is forwarded to pi's built-in bash tool instead of relying on PATH lookup. Precedence: `PI_HASHLINE_SHELL_PATH` env (whitespace-trimmed, empty ignored) → project/global hashline JSON `bash.shellPath` → pi's own configured `shellPath` (from `~/.pi/agent/settings.json`) → upstream default shell resolution. |

Budget fields must be strict positive base-10 integers, except `display.previewLines`, which also accepts `0` to fully suppress the collapsed preview. For the strict-positive budget fields, zero is rejected; for every field above, negative, signed, decimal, hexadecimal, exponent notation, separators, empty strings, and whitespace-only values are ignored. Boolean fields must be JSON booleans, and `mapCache.dir` must be a non-empty string. Malformed JSON files and invalid fields degrade safely: valid fields continue to apply where practical, invalid fields are ignored, and the loader emits non-fatal warnings where available.

### Optional GDScript maps

GDScript support is niche and opt-in. By default, `.gd` files continue to use the same ctags/fallback mapping path as other files without a dedicated enabled mapper, so existing users do not need any new dependency.

To enable the dedicated GDScript structural mapper, install the Python backend in the environment where pi runs:

```sh
pip install gdtoolkit
```

or use an equivalent Python environment setup that makes `gdtoolkit.parser` importable by `python3`.

Then enable it in `.pi/hashline-readmap/settings.json` (project) or `~/.pi/agent/hashline-readmap/settings.json` (global):

```json
{
  "gdscript": { "enabled": true }
}
```

For a one-off session, `PI_HASHLINE_GDSCRIPT=1` also enables the mapper and takes precedence over JSON settings. If the backend is missing or broken, Hashline falls back to ctags/fallback mapping; install `gdtoolkit` or unset `PI_HASHLINE_GDSCRIPT` to silence the diagnostic.

Other environment-only options:

| Variable | Purpose | Default / behavior |
|---|---|---|
| `XDG_CACHE_HOME` | Base directory for the persistent map cache when no explicit cache dir is set | Cache lives under `$XDG_CACHE_HOME/pi-hashline-readmap/maps` |
| `PI_NUSHELL_CONFIG` | Override the Nushell config path used by `nu` | Otherwise prefers `~/.config/pi/nushell/config.nu`, then `--no-config-file` |
| `PI_RTK_BYPASS=1` | Disable route-specific `bash` compression for one command invocation | ANSI is still stripped; anti-pattern hints still apply; the Bash context guard can still trim oversized output |
| `PI_CONTEXT_HYGIENE_DEBUG=1` | Register the debug-only `context_hygiene_report` read-only tool | Disabled unless explicitly set to `1` |

Migration example:

```bash
# before: shell startup file
export PI_HASHLINE_GREP_MAX_LINES=1200
export PI_HASHLINE_GREP_MAX_BYTES=40960
export PI_HASHLINE_MAP_CACHE_DIR=.cache/hashline/maps
export PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES=1500
```

After, in `<repo>/.pi/hashline-readmap/settings.json`:

```json
{
  "grep": { "maxLines": 1200, "maxBytes": 40960 },
  "mapCache": { "dir": ".cache/hashline/maps" },
  "bashContextGuard": { "maxLines": 1500 }
}
```

## Advanced documentation

- [docs/bash-output.md](https://github.com/coctostan/pi-hashline-readmap/blob/main/docs/bash-output.md) — Bash compression, original-output restoration, context-guard trimming, and bypass behavior.
- [docs/structured-output.md](https://github.com/coctostan/pi-hashline-readmap/blob/main/docs/structured-output.md) — `details.ptcValue`, structured error envelopes, and the exported PTC policy contract.
- [docs/context-hygiene.md](https://github.com/coctostan/pi-hashline-readmap/blob/main/docs/context-hygiene.md) — context-hygiene metadata, forward-only stale-context signalling, and the debug report tool.
- [docs/integrations.md](https://github.com/coctostan/pi-hashline-readmap/blob/main/docs/integrations.md) — EventBus/global executor exposure for downstream integrations.
- [exploratory functional testing](https://github.com/coctostan/pi-hashline-readmap/blob/main/docs/exploratory-functional-testing.md) — exploratory testing notes.
- [prompts/](prompts/) — tool prompt and schema documentation.
- [CHANGELOG.md](CHANGELOG.md) — release history.

### PTC tool policy contract

The package exports `HASHLINE_TOOL_PTC_POLICY` and `getHashlineToolPtcPolicy()` for integrations. In that contract, `read`, `grep`, `ls`, and `find` are safe-by-default and read-only; `ast_search` and `nu` are opt-in and read-only; `edit` is not safe-by-default and is mutating. `pi-prompt-assembler` may optionally consume this contract when deciding which helpers to expose.

## EventBus integration

On extension load, the executor map is emitted with `pi.events.emit("hashline:tool-executors", toolExecutors)` and also assigned to `globalThis.__hashlineToolExecutors`. The core executor surface includes `read`, `edit`, `grep`, `ast_search`, `write`, `ls`, and `find`, plus `nu` when Nushell is available at runtime.

## Project Structure

```text
index.ts                  # extension entry point
src/
  read.ts                 # read tool implementation
  edit.ts                 # edit tool implementation
  grep.ts                 # grep tool implementation
  sg.ts                   # ast-grep wrapper
  write.ts                # write tool implementation
  ls.ts                   # single-directory listing
  find.ts                 # recursive discovery
  nu.ts                   # Nushell integration
  readmap/                # structural mapping and symbol lookup engine
  rtk/                    # bash output compression pipeline
prompts/                  # tool prompt/schema docs
tests/                    # Vitest suite
docs/                     # project notes and reference docs
scripts/                  # helper scripts used by readmap internals
```

## Development

Install dependencies:

```bash
npm install
```

Validate the workspace:

```bash
npm test
npm run typecheck
```

Release candidates should also pass an npm package dry run:

```bash
npm pack --dry-run
```

Before publishing or opening a PR, run the workspace checks above from a clean checkout.

This repository is intended to be used as a pi extension workspace. New agent sessions pick up local extension edits from the checkout, but running sessions do not hot-reload the module graph. Restart the agent session after changing extension code.

For project-specific development workflow details, see [AGENTS.md](https://github.com/coctostan/pi-hashline-readmap/blob/main/AGENTS.md).

## Contributing

PRs are welcome. If you change tool behavior or output contracts:

- update the relevant tests in `tests/`
- update prompt docs in `prompts/` when user-visible contracts change
- update `README.md` when installation, usage, or output semantics change materially
- follow repository workflow notes in [AGENTS.md](https://github.com/coctostan/pi-hashline-readmap/blob/main/AGENTS.md)

## Credits

Combines and adapts ideas from:

- [pi-hashline-edit](https://github.com/nicholasgasior/pi-hashline-edit) — hash-anchored editing
- [pi-read-map](https://github.com/nicholasgasior/pi-read-map) — structural file maps
- [pi-repo-map](https://github.com/PurpleMyst/pi-repo-map) — inspiration for repository mapping and tree-sitter-based structure extraction
- [pi-rtk](https://github.com/mcowger/pi-rtk) — bash output compression

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
