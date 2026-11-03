# Bash output compression and recovery

`pi-hashline-readmap` post-processes `bash` tool results after the command runs. The goal is to keep useful signal in the conversation while still preserving ways to inspect larger output when needed.

[Back to README](../README.md)

## Processing layers

Bash output moves through two layers:

1. **RTK route compression** — command-aware reducers for common noisy tools.
2. **Bash context guard** — a default-on safety layer that prevents very large post-RTK output from flooding the context.

`PI_RTK_BYPASS=1` affects only the first layer. The Bash context guard can still replace oversized output with a preview unless it is disabled separately.

## RTK route compression

The extension routes common command output through specialized compressors, including:

- test runners
- build and compiler output
- Git output
- linters
- Docker output
- package-manager output
- HTTP clients
- file-transfer tools
- file-listing output
- generic oversized output

A command line picks its route by the one part whose output fills the result: a part that runs at the top level (not inside `$(…)`, backticks, `<(…)` or `>(…)`), does not feed a pipe, and is not known to print nothing (`cd`, `pushd`, `popd`, `export`, `unset`, `set`, `mkdir -p`, `true`, `:`, bare assignments, each given neither `-` nor a verbose flag). That part is the command the compressor sees. When no part or more than one part prints, nothing is compressed, since one compressor can't read merged output:

| Command line | Route |
| --- | --- |
| `cd sub && git diff` | Git, seeing `git diff` |
| `git diff \| cat` | none (`cat` prints) |
| `git status && git diff` | none (two parts print) |

Whenever a compressor changed the output, whatever its size, the visible result starts with an RTK notice giving the original and compressed sizes, `Original output: <path>`, a saved copy of the output before compression, and the `PI_RTK_BYPASS=1 <command>` that re-runs the command uncompressed:

```text
[RTK: compressed git output 8.2 KB → 1.2 KB (86% saved). Original output: /tmp/hashline-bash-original-<id>.txt. Use `PI_RTK_BYPASS=1 git diff` to re-run uncompressed.]
```

When Pi truncated the output itself, the path is Pi's own full-output file; otherwise it is a `0600` file in the system temp directory holding the compressor's input byte for byte. The notice names it with the context guard off too. Reading that file recovers what was cut without running the command again. If the copy cannot be written, nothing is compressed: the output passes through as under `PI_RTK_BYPASS=1`, `details.compressionInfo.bypassedBy` is `unsaved-original`, and `details.bashOriginalOutput.snapshotWriteError` says why. The label is never `Full output:`, which is Pi's own. A result that only lost its ANSI codes or gained a tool hint has none, and its `details.rtkCompaction` reports `applied: false`; a test command's ANSI-only result is the one exception, reporting `applied: true, techniques: ["test-output"]`.

### Drop markers

A compressor that cuts output past a size budget ends the cut with a marker naming the true count in its own unit, and reports that drop as one `{ count, unit }` entry of `details.rtkCompaction.dropped`, in output order; any entry sets `details.rtkCompaction.truncated`. A marker-like line the command printed itself is reported as no drop. Filters that drop only noise (progress meters, `Compiling` lines, intermediate Docker containers) set nothing. A trailing newline is not a line. A `git diff` context marker that the line cap cuts in turn is counted by the cap's marker, not reported on its own.

Each route drops only the noise this table names without saying so; it keeps every other line, or cuts it under its budget and counts it in its marker. A line a route can't classify is kept.

| Route | Noise, dropped silently | Budget | Marker |
| --- | --- | --- | --- |
| `git diff` | `index` lines, the `---`/`+++` file headers, `\ No newline at end of file`, a hunk header's function context; output with no `diff --git` passes through | 100 output lines | `... and N more lines` |
| `git diff` | | 3 context lines per side of a hunk (`-U`, `-W`) | `  ... (N context lines)` |
| `git status` | blank lines | 5 staged, 5 modified (worktree changes, `T` and intent-to-add included), 3 untracked, 3 ignored files; conflicts (`DD AU UD UA DU AA UU`) are all listed with their codes, never cut, and the branch line keeps its tracking | `  ... and N more files` |
| `git log` | none | 20 commits, or 20 lines without commit headers | `... and N more commits`, `... and N more lines` |
| build | `Compiling`, `Checking`, `Building` (counted as units), `Downloading`, `Downloaded`, `Fetching`, `Fetched`, `Updating`, `Updated`, `Generated`, `Creating`, `Running`, `Finished` lines, cargo's `generated N warnings` summary, blank lines outside a diagnostic; other lines are kept after the diagnostics | 5 errors and 5 warnings, 10 lines each | `... and N more errors`, `... and N more warnings`, `  ... and N more lines` |
| linter | blank lines; each finding is counted under its file and its rule, and a line that is no finding is kept | top 10 rules, top 10 files, top 3 rules per file | `  ... and N more rules`, `  ... and N more files`, `    ... and N more rules` |
| `find` | blank lines; each entry is counted under its directory | 100 entries, summarized per parent directory | `Total: N entries in M directories` |
| HTTP client | curl's progress meter, wget's download progress | 200 body lines | `[... N more lines]` |
| build tools (`make`, `cmake`, `gradle`, `mvn`) | `make[N]: Entering/Leaving directory`, CMake's `[ N%]` lines, Gradle's `> Task :x` and `:x` lines (a `FAILED` one is kept), Maven's `[INFO] Downloading/Compiling/Building/Unpacking` | none | none |
| package manager (`npm`, `yarn`, `pnpm` installs) | spinner lines, `npm http`, `npm timing`, yarn's `Resolution step details:`, blank lines | none | none |
| Docker build | `---> <id>`, `---> Running in`, `Removing intermediate container`, `Sending build context`, blank lines; a step's own output is kept | none | none |
| transfer (`rsync`, `scp`) | rsync's and scp's progress lines, rsync's `sending/receiving incremental file list` | rsync's file list, the path-shaped lines from its header (or openrsync's `Transfer starting: N files`) to the next blank line: 10 entries | `... and N more files` |

Only `find` output is summarized as a listing: `ls -R` and `tree` print headers and tree lines a summary can't count as entries, so they pass through unchanged. So does `find` with an action that shapes its output (`-printf`, `-fprintf`, `-ls`, `-fls`, `-exec`, `-execdir`, `-ok`, `-okdir`, `-print0`, `-fprint0`), since its lines are no bare paths.

## Bypass route compression

Prefix a command with `PI_RTK_BYPASS=1` to skip route-specific compression for that invocation:

```bash
PI_RTK_BYPASS=1 npm test
PI_RTK_BYPASS=1 git log --stat
```

Bypass behavior:

- route-specific compression is skipped
- ANSI is still stripped
- Bash anti-pattern hints can still be shown
- the Bash context guard still applies to oversized output

To bypass both RTK compression and guard trimming, combine both variables:

```bash
PI_HASHLINE_BASH_CONTEXT_GUARD=0 PI_RTK_BYPASS=1 npm test
```

Use that only when you really want full raw output in the conversation.

## Bash context guard

The Bash context guard is default-on. It checks post-RTK output after compression or bypass handling.

Default limits:

| Limit | Default |
|---|---:|
| Maximum visible post-RTK lines | `2000` |
| Maximum visible post-RTK bytes | `51200` |
| Preview head lines | `80` |
| Preview tail lines | `120` |

When output exceeds the line or byte budget, the guard writes the full post-RTK output to a temp file and replaces the visible result with a recoverable preview. The preview includes:

- `Full post-RTK output: <path>`
- `Original/pre-RTK output: <path>` when an original snapshot is available, the same path the RTK notice names
- original and post-RTK line/byte counts
- active limits
- a compact command label
- preserved RTK, hint, full-output, and repeated-call notices
- head and tail snippets

The guard uses raw byte counts. Environment values must be positive base-10 integers. Invalid values fall back to defaults, and values above the built-in defaults are clamped down to those defaults.

## Environment variables

| Variable | Behavior |
|---|---|
| `PI_RTK_BYPASS=1` | Disable route-specific compression for one command invocation. Does not disable guard trimming. |
| `PI_HASHLINE_BASH_CONTEXT_GUARD=0` | Disable the Bash context guard. Any value other than exact `0` leaves it enabled. |
| `PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES` | Tighten the maximum post-RTK line count. Default/ceiling: `2000`. |
| `PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_BYTES` | Tighten the maximum post-RTK byte count. Default/ceiling: `51200`. |
| `PI_HASHLINE_BASH_CONTEXT_GUARD_HEAD_LINES` | Tighten preview head lines. Default/ceiling: `80`. |
| `PI_HASHLINE_BASH_CONTEXT_GUARD_TAIL_LINES` | Tighten preview tail lines. Default/ceiling: `120`. |

## Structured result contract

### Script value versus presentation

On hosts with a native Bash output schema, `tools.bash(args)` returns the native `{ output, truncated, full_output_path?, exit_code, wall_time_seconds }` value. Hashline preserves that object through its result hook. `output` is native raw command output, subject to the host's own raw-output budget; `truncated` and `full_output_path` describe that budget, not RTK compression or the model-facing context guard. Nonzero exit codes remain native values; check `exit_code`.

RTK and the context guard modify `content` for model presentation. Their flags and recovery paths in `details` are integration metadata, not additional fields automatically supplied to codemode scripts. No compressed-output script field is introduced. A script printing `result.output` therefore prints raw data; filter it intentionally before `text()`.

`PI_RTK_BYPASS=1` bypasses RTK presentation processing; it does not disable native raw-output bounds or the context guard. Identical `output` values with and without that prefix are expected. Legacy hosts without a native structured schema keep their existing text-return behavior. Host abort/error/permission failures are not reclassified as successful Bash results.

The `bash` result exposes the public RTK compaction record at `details.rtkCompaction`, mirrored at `details.ptcValue.rtkCompaction`. Consumers should use that stable contract rather than private reducer fields. It identifies the technique, input/output sizes, bypass state, and recovery metadata.

Guard metadata remains at `details.bashContextGuard`. When trimming occurs, use the full post-RTK path for the complete guarded result and the `Original/pre-RTK output` path for command output before route compression.

## Recovering full output

If the visible Bash result contains a full-output path, inspect that file in the same session or copy it elsewhere before cleaning temp files. The guard stores full post-RTK output with mode `0600` in the system temp directory.

If an original/pre-RTK output snapshot path is present, use that path when you need the command output before RTK compression. Every compacted result names one in its RTK notice as `Original output: <path>`.
