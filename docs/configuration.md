# Configuration and local dependencies

`pi-hashline-readmap` works without configuration for most users. This reference covers bundled and fallback CLIs, mapper runtimes, native JSON settings, environment overrides, and opt-in GDScript.

[Back to README](../README.md)

## CLI dependencies and optional local tools

Normal npm installs include npm-managed CLI packages for the tools this extension wraps:

- `@ast-grep/cli` is an optional dependency that provides the binary used by `ast_search`. It ships prebuilt native binaries for common platforms. On platforms without a prebuilt binary, including Termux/Android and musl-based Linux, npm skips this package while every other tool still installs and works.
- `nushell` provides the `nu` binary used by the optional `nu` tool.

Bundled binaries are resolved first. If `@ast-grep/cli` cannot be resolved, `ast_search` falls back to `ast-grep` on `PATH` rather than `sg`, avoiding Linux util-linux `sg` collisions. If neither ast-grep binary exists, it returns a clear `ast-grep not available` result without affecting other tools. `nu` similarly falls back to `nu` on `PATH`; if Nushell is unavailable, only the optional `nu` tool is omitted.

Optional local tools improve fallback or compression paths:

```bash
brew install ast-grep          # fallback for ast_search
brew install nushell           # fallback for nu
brew install fd                # speeds up find
brew install universal-ctags   # maps for languages without a dedicated mapper
brew install difftastic        # semantic edit summaries
brew install shellcheck yq scc # selected Bash compression paths
```

## Mapper and runtime support

Dedicated readmap mappers handle TypeScript, JavaScript, Python, Rust, Go, Java, C, C++, Swift, shell, SQL, Markdown, JSON/JSONL, YAML, TOML, CSV/TSV, and opt-in GDScript with the highest-quality structural maps. Rust, C, C++, Java, and Swift structural maps use `web-tree-sitter` 0.26 with packaged `@repomix/tree-sitter-wasms` grammars. C/C++ headers share the C++ mapper, and no native tree-sitter packages are installed for those mappers. For files outside that set, `read` falls back to universal-ctags or lightweight heuristics. If no fallback mapper applies, text reads and hash anchors still work without a structural map.

Readmap helper subprocesses use argv-safe invocation rather than shell interpolation, including for paths containing shell metacharacters such as `"` and `$`.

## Settings files and precedence

Most users need no configuration. Durable Hashline options can live in JSON settings files, while existing environment variables remain supported for temporary overrides and are not deprecated.

Canonical files:

- Global: `~/.pi/agent/hashline-readmap/settings.json`
- Project: `<repo>/.pi/hashline-readmap/settings.json`

Precedence is environment variables > project JSON > global JSON > built-in defaults. Project JSON overrides global JSON field by field. Unsupported legacy or alias paths are intentionally not read: `~/.pi/agent/settings.json`, `<repo>/.pi/settings.json`, `~/.pi/hashline-readmap/settings.json`, and `<repo>/.pi/hashline-readmap.json`.

```json
{
  "read": { "allowUnclipped": false },
  "grep": { "maxLines": 1200, "maxBytes": 40960 },
  "mapCache": { "dir": ".cache/hashline/maps", "enabled": true },
  "bashContextGuard": { "enabled": true, "maxLines": 1500, "maxBytes": 40960, "headLines": 60, "tailLines": 100 },
  "gdscript": { "enabled": false },
  "edit": { "diffDisplay": "collapsed" },
  "display": { "previewLines": 5 },
  "bash": { "shellPath": "C:/Program Files/Git/bin/bash.exe" }
}
```

## JSON fields

| JSON field                   | Environment override                        | Default / ceiling behavior                                                                                                                                                                                                                                                                                         |
| ---------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `read.allowUnclipped`        | None                                        | Defaults to `false`. When `true` at tool registration, exposes the optional `read` parameter `unclipped`. Calls remain clipped unless `unclipped: true` is supplied.                                                                                                                                               |
| `grep.maxLines`              | `PI_HASHLINE_GREP_MAX_LINES`                | Tightens `grep`'s final visible line budget; above-default values are clamped down to the built-in default.                                                                                                                                                                                                        |
| `grep.maxBytes`              | `PI_HASHLINE_GREP_MAX_BYTES`                | Tightens `grep`'s final visible byte budget; above-default values are clamped down to the built-in default.                                                                                                                                                                                                        |
| `mapCache.dir`               | `PI_HASHLINE_MAP_CACHE_DIR`                 | Overrides the persistent structural-map cache directory; otherwise falls back to `$XDG_CACHE_HOME/pi-hashline-readmap/maps`, then `~/.cache/pi-hashline-readmap/maps`.                                                                                                                                             |
| `mapCache.enabled`           | `PI_HASHLINE_NO_PERSIST_MAPS=1`             | Defaults to `true`; the environment variable disables on-disk map caching regardless of JSON.                                                                                                                                                                                                                      |
| `bashContextGuard.enabled`   | `PI_HASHLINE_BASH_CONTEXT_GUARD`            | Defaults to `true`; exact environment value `0` disables the guard, while any other set value enables it.                                                                                                                                                                                                          |
| `bashContextGuard.maxLines`  | `PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES`  | Tightens the post-RTK Bash guard line budget; default/ceiling `2000`.                                                                                                                                                                                                                                              |
| `bashContextGuard.maxBytes`  | `PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_BYTES`  | Tightens the post-RTK Bash guard byte budget; default/ceiling `51200` raw bytes.                                                                                                                                                                                                                                   |
| `bashContextGuard.headLines` | `PI_HASHLINE_BASH_CONTEXT_GUARD_HEAD_LINES` | Tightens the guarded preview head size; default/ceiling `80`.                                                                                                                                                                                                                                                      |
| `bashContextGuard.tailLines` | `PI_HASHLINE_BASH_CONTEXT_GUARD_TAIL_LINES` | Tightens the guarded preview tail size; default/ceiling `120`.                                                                                                                                                                                                                                                     |
| `gdscript.enabled`           | `PI_HASHLINE_GDSCRIPT`                      | Defaults to `false`; exact environment value `1` enables the dedicated GDScript mapper and takes precedence over JSON.                                                                                                                                                                                             |
| `edit.diffDisplay`           | `PI_HASHLINE_EDIT_DIFF_DISPLAY`             | Defaults to `collapsed`; `expanded` renders diffs inline without Ctrl+O. Project JSON overrides global JSON. The environment override is case-insensitive (`expanded`/`collapsed` in any casing, with surrounding whitespace trimmed); unrecognized values are ignored and fall through to JSON, then the default. |
| `display.previewLines`       | `PI_HASHLINE_PREVIEW_LINES`                 | Defaults to `5`; controls trailing lines of collapsed `bash`, `read`, and `grep` output. Set `0` for content-free summaries. It is a non-negative base-10 integer; invalid environment values fall through to JSON, then the default. Project JSON overrides global JSON.                                          |
| `bash.shellPath`             | `PI_HASHLINE_SHELL_PATH`                    | Absolute shell path. It is forwarded to Pi's built-in Bash tool. Precedence: whitespace-trimmed non-empty `PI_HASHLINE_SHELL_PATH`, project/global Hashline JSON, pi's own configured `shellPath` from `~/.pi/agent/settings.json`, then upstream shell resolution.                                                |

Budget fields must be strict positive base-10 integers except `display.previewLines`, which also accepts `0`. For strict-positive fields, zero is rejected; negative, signed, decimal, hexadecimal, exponent notation, separators, empty strings, and whitespace-only values are ignored. Boolean fields must be JSON booleans, and mapCache.dir must be a non-empty string. Malformed JSON and invalid fields degrade safely: valid fields continue to apply where practical, invalid fields are ignored, project parse failure does not suppress valid global settings, and warnings identify bad input without aborting extension startup.

Environment-only options include `XDG_CACHE_HOME`, `PI_NUSHELL_CONFIG`, `PI_RTK_BYPASS=1`, and `PI_CONTEXT_HYGIENE_DEBUG=1`. `PI_NUSHELL_CONFIG` overrides the Nushell config path; otherwise Hashline prefers `~/.config/pi/nushell/config.nu` and then `--no-config-file`. See [Bash output](bash-output.md) for guard and recovery behavior.

## Unclipped reads

Large unclipped results can exhaust model context or cause compaction failures. The option adds no replacement ceiling. To enable the parameter, add `"read": { "allowUnclipped": true }` to either canonical settings file and restart Pi. Project `false` overrides global `true`. The setting is captured at tool registration, so edits to settings do not change an already registered tool.

With opt-in enabled, `read({ path: "src/read.ts", unclipped: true })` returns all selected source text without the 2,000-line, 50 KiB, or 500-character per-line caps. `offset`, `limit`, `symbol`, `map`, and `bundle: "local"` retain their existing selection rules. Bundled support lines are also unclipped. Structural maps retain their own formatting budget. Image delegation, newline normalization, control character escaping, and hash anchors are unchanged.

Without opt-in, the schema and prompt guidance omit `unclipped`, and direct calls that supply it return an error. With opt-in, omission or `unclipped: false` keeps normal output. Successful unclipped source results carry `details.ptcValue.unclipped: true`, `details.ptcValue.truncation: null`, and an unclipped rehydration descriptor. Explicitly limited selections still report continuation when more source remains.

## Migration example

Durable environment overrides can move into project JSON while environment variables remain available for one-off precedence:

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

## Optional GDScript maps

GDScript is opt-in. Without opt-in, `.gd` continues through ctags/fallback mapping. Install its Python backend where Pi runs:

```bash
pip install gdtoolkit
```

The environment must make `gdtoolkit.parser` importable by `python3`. Enable it in project/global JSON with `{"gdscript":{"enabled":true}}`, or use `PI_HASHLINE_GDSCRIPT=1` for one session. If the backend is missing or broken, Hashline falls back safely with a diagnostic; install `gdtoolkit` or disable the option to silence it.
