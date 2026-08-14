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

When compression is effective, the visible result may include an RTK notice with the original and compressed sizes and a command showing how to bypass compression.

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
- `Original/pre-RTK output: <path>` when an original snapshot is available
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

The `bash` result exposes the public RTK compaction record at `details.rtkCompaction`, mirrored at `details.ptcValue.rtkCompaction`. Consumers should use that stable contract rather than private reducer fields. It identifies the technique, input/output sizes, bypass state, and recovery metadata.

Guard metadata remains at `details.bashContextGuard`. When trimming occurs, use the full post-RTK path for the complete guarded result and the `Original/pre-RTK output` path for command output before route compression.

## Recovering full output

If the visible Bash result contains a full-output path, inspect that file in the same session or copy it elsewhere before cleaning temp files. The guard stores full post-RTK output with mode `0600` in the system temp directory.

If an original/pre-RTK output snapshot path is present, use that path when you need the command output before RTK compression.
