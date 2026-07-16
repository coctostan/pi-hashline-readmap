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

## Stale context handling

The extension listens to pi context events and handles old tool-result messages when they are known to be stale. This prevents agents from accidentally treating obsolete file contents or command output as current while allowing users to choose how provider history is managed.

Configure `contextHygiene.staleResults` in the global or project Hashline JSON settings:

- `"replace"` (default) replaces historical `read`, `grep`, `ast_search`, and `bash` results with compact placeholders. This is the strongest stale-context and context-window-reclamation mode, but changing an earlier provider-input prefix invalidates prompt-cache reuse after that point.
- `"append-only"` leaves historical results byte-identical and appends deterministic notices to the mutation or command result that made them stale or retired. Applied effects are frozen in `details.contextHygiene` when that result is recorded, so later context builds do not move or rewrite earlier notices. This preserves exact-prefix prompt caching while retaining the safety signal.
- `"disabled"` leaves historical results unchanged and adds no provider-context notice. Tracking, current-disk `LINE:HASH` validation, and read-before-edit expiration remain active.

The setting is resolved when the extension loads; restart the pi session after changing it. Global and project files use the paths and project-over-global precedence documented in the README.

Rendered placeholders include:

```text
[Stale read result — this earlier read was superseded by a later file change; nothing is wrong with read. Edits still validate against current on-disk content via content-derived LINE:HASH anchors, so a matching hash still applies. Re-run read for fresh anchors.]
[Stale grep result — this earlier grep was superseded by a later file change; nothing is wrong with grep. Edits still validate against current on-disk content via content-derived LINE:HASH anchors, so a matching hash still applies. Re-run grep for current matches.]
[Stale ast_search result — this earlier ast_search was superseded by a later file change; nothing is wrong with ast_search. Edits still validate against current on-disk content via content-derived LINE:HASH anchors, so a matching hash still applies. Re-run ast_search for current matches.]
[Stale bash context: mutation-after-read. Re-run the Bash command to refresh. Command: npm test]
```

When a later successful Bash command supersedes an older Bash result, the older result can be retired with a placeholder such as:

```text
[Retired bash context: same-command-success-rerun. Superseded by a later successful Bash command. Command: npm test]
```

In `append-only` mode the same notice text appears after the invalidating or superseding result rather than replacing the historical output.

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
- Treat `details.contextHygiene.appliedEffects` as frozen facts about the result that caused invalidation or retirement. Its aggregate `stale` / `retired` buckets support telemetry, while its `notices` entries bind each affected result ID to the deterministic append-only notice. Do not recompute or move an earlier notice.
- Use rehydrate descriptors when refreshing stale file/search context.
- Do not assume stale placeholders contain enough information to reconstruct the original result.
- Restart the pi session if you change extension code; the in-memory tracker is reset when the extension is loaded.
