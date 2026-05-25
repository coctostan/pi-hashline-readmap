# Context hygiene metadata

`pi-hashline-readmap` adds context-hygiene metadata to tool results so the extension can reason about stale read/search/command context without parsing rendered text.

The feature is additive. It does not change normal tool output unless a later mutation or command rerun makes older context stale or retired.

## Metadata shape

Context-hygiene metadata uses schema version `1` and classifies tool results as one of:

- `read-context`
- `search-context`
- `command-output`
- `mutation`

Tracked resource kinds are:

- `file`
- `symbol`
- `command`

Read-like outputs can also carry a rehydrate descriptor that tells the agent how to refresh the result, such as rerunning `read`, `grep`, or `ast_search` with the original focused input.

## What gets tracked

| Tool family | Typical classification | Resource examples |
|---|---|---|
| `read` | `read-context` | file path, selected symbol, bundled local support symbols |
| `grep` | `search-context` | matched files and search inputs |
| `ast_search` | `search-context` | matched files and structural search inputs |
| `bash` | `command-output` | command string and command kind, such as test, build, typecheck, lint, VCS, install, or other |
| `edit` / `write` | `mutation` | changed file path |

The tracker keeps a bounded in-memory event history. The current default maximum is `1000` events.

## Stale context replacement

The extension listens to pi context events and replaces some old tool-result messages when they are known to be stale. This prevents agents from accidentally relying on obsolete file contents or command output.

Maskable stale tools are:

- `read`
- `grep`
- `ast_search`
- `bash`

Rendered placeholders include:

```text
[Stale read result — this earlier read was superseded by a later file change; nothing is wrong with read. Run read again for current content.]
[Stale grep result — this earlier grep was superseded by a later file change; nothing is wrong with grep. Run grep again for current matches.]
[Stale ast_search result — this earlier ast_search was superseded by a later file change; nothing is wrong with ast_search. Run ast_search again for current matches.]
[Stale bash context: mutation-after-read. Re-run the Bash command to refresh. Command: npm test]
```

When a later successful Bash command supersedes an older Bash result, the older result can be retired with a placeholder such as:

```text
[Retired bash context: same-command-success-rerun. Superseded by a later successful Bash command. Command: npm test]
```

## Reasons

Stale invalidation reasons currently include:

- `mutation-after-read`
- `bash-repo-state-after-mutation`
- `bash-verification-success-rerun`

Retirement reasons currently include:

- `command-rerun`
- `same-command-success-rerun`

## Debug report tool

Set this environment variable before starting pi to register the debug-only report tool:

```bash
PI_CONTEXT_HYGIENE_DEBUG=1
```

When enabled, the extension registers `context_hygiene_report`, a read-only debug tool that exposes the current context-hygiene tracker state. Leave it disabled for normal use.

## Integration guidance

- Treat `details.contextHygiene` as metadata for state tracking, not as display text.
- Use rehydrate descriptors when refreshing stale file/search context.
- Do not assume stale placeholders contain enough information to reconstruct the original result.
- Restart the pi session if you change extension code; the in-memory tracker is reset when the extension is loaded.
