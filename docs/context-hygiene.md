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

## Stale context signalling

The extension never rewrites tool-result messages that have already been sent to
the provider. Prompt caching on Anthropic and OpenAI/Codex is keyed on an exact
serialized prefix of the request, and pi-ai places a single conversation-level
cache breakpoint at the tail of the last user message. Rewriting any historical
message therefore invalidates the whole conversation cache entry — re-billing
every input token at 10x the cached rate, and 12.5x on Anthropic once the cache
rewrite is included (issue #225 / GitHub #159).

Instead, staleness is signalled **forward-only**, in two complementary ways:

1. **A notice on the tool result that caused the staleness.** When an `edit`,
   `write`, or repo-mutating Bash command makes earlier context stale, a
   `[Context hygiene]` notice is prefixed onto that command's own result. That
   message is brand new, so it costs nothing in prefix terms. Each record is
   announced exactly once per session.
2. **Hard guards at the point of use.** `edit` refuses with `file-not-read`
   when the tracked read for a path has been superseded, and every `LINE:HASH`
   anchor is validated against current on-disk content (`hash-mismatch`). These
   are stronger than advisory text: they block the unsafe operation rather than
   describing it.

Historical messages are additionally annotated with `details.contextHygieneStale`
or `details.contextHygieneRetired` for tooling and diagnostics. `details` is not
transmitted to the provider, so these annotations are prefix-neutral.

Tools that can be signalled stale:

- `read`
- `grep`
- `ast_search`
- `bash`

Notice bodies reuse the same deterministic placeholder text:

```text
[Stale read result — this earlier read was superseded by a later file change; nothing is wrong with read. Edits still validate against current on-disk content via content-derived LINE:HASH anchors, so a matching hash still applies. Re-run read for fresh anchors.]
[Stale grep result — this earlier grep was superseded by a later file change; nothing is wrong with grep. Edits still validate against current on-disk content via content-derived LINE:HASH anchors, so a matching hash still applies. Re-run grep for current matches.]
[Stale ast_search result — this earlier ast_search was superseded by a later file change; nothing is wrong with ast_search. Edits still validate against current on-disk content via content-derived LINE:HASH anchors, so a matching hash still applies. Re-run ast_search for current matches.]
[Stale bash context: mutation-after-read. Re-run the Bash command to refresh. Command: npm test]
```

When a later successful Bash command supersedes an older Bash result, the older
result is reported as retired:

```text
[Retired bash context: same-command-success-rerun. Superseded by a later successful Bash command. Command: npm test]
```

A full notice looks like:

```text
[Context hygiene] 1 earlier tool result no longer reflects current state. Do not treat it as current:
- read (file:src/a.ts): [Stale read result — this earlier read was superseded by a later file change; ...]
```

### Retirement does not reclaim tokens

`same-command-success-rerun` retirement previously replaced the older Bash
output with a short placeholder, which reclaimed context but rewrote history.
That trade is now explicitly rejected: reclaiming a one-time block of tokens
costs a full conversation cache miss on **every** subsequent request for the
rest of the session, which is strictly worse in every measured case. Retirement
therefore signals only — it no longer shrinks history.

This matches ROADMAP principle 3 ("Retired placeholders and cutoffs must be
stable enough to preserve prompt-cache reuse") and the Phase 2 non-goal
"output-size-based or accumulated-pressure Bash retirement". Size-driven
retirement, if it is ever reintroduced, belongs in a later phase behind
telemetry showing the reclaimed tokens exceed the cache-miss cost.

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
- Do not assume stale notices contain enough information to reconstruct the original result. The original result is still present in history — the notice only marks it as no longer current.
- Restart the pi session if you change extension code; the in-memory tracker is reset when the extension is loaded.
