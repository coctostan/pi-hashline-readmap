# Bash output normalization and recovery

`pi-hashline-readmap` post-processes `bash` tool results after the command runs without interpreting command-specific output formats.

## Processing pipeline

Bash output moves through three steps:

1. **ANSI stripping** — terminal escape sequences are removed.
2. **Optional anti-pattern hints** — commands better served by `read`, `grep`, `find`, `ls`, `edit`, or `write` may receive a short guidance line. The command output itself remains intact.
3. **Bash context guard** — a default-on safety layer replaces oversized output with a recoverable preview.

There are no Git, test, build, linter, Docker, package-manager, HTTP, transfer, or file-listing output reducers. Command output is not summarized or semantically rewritten.

## Bash context guard

The guard checks normalized Bash output after hints and any doom-loop warning have been assembled.

Default limits:

| Limit | Default |
|---|---:|
| Maximum visible lines | `2000` |
| Maximum visible bytes | `51200` |
| Preview head lines | `80` |
| Preview tail lines | `120` |

When output exceeds the line or byte budget, the guard writes the complete normalized output to a private temporary file and replaces the visible result with a preview. The preview includes:

- `Full Bash output: <path>`
- `Original Bash output: <path>` when an original snapshot is available
- original and guard-input line/byte counts
- active limits
- a compact command label
- preserved hint, full-output, exit-status, and repeated-call notices
- head and tail snippets

The guard uses raw byte counts. Environment values must be positive base-10 integers. Invalid values fall back to defaults, and values above the built-in defaults are clamped down to those defaults.

## Environment variables

| Variable | Behavior |
|---|---|
| `PI_HASHLINE_BASH_CONTEXT_GUARD=0` | Disable the Bash context guard. Any value other than exact `0` leaves it enabled. |
| `PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES` | Tighten the maximum visible line count. Default/ceiling: `2000`. |
| `PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_BYTES` | Tighten the maximum visible byte count. Default/ceiling: `51200`. |
| `PI_HASHLINE_BASH_CONTEXT_GUARD_HEAD_LINES` | Tighten preview head lines. Default/ceiling: `80`. |
| `PI_HASHLINE_BASH_CONTEXT_GUARD_TAIL_LINES` | Tighten preview tail lines. Default/ceiling: `120`. |

## Recovering full output

If the visible Bash result contains a full-output path, inspect that file in the same session or copy it elsewhere before cleaning temporary files. Guard files are created with mode `0600` in the system temporary directory.

Use `Full Bash output` for the complete normalized result that would otherwise have entered the conversation. When present, `Original Bash output` points to the source captured before output normalization and guard previewing.
