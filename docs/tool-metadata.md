# Provider-visible tool metadata and diagnosis

`pi-hashline-readmap` registers compact descriptions, parameter descriptions, prompt snippets, and prompt guidelines. This reference inventories that provider-visible contract and records why 0.13.0 tightened it.

[Back to README](../README.md)

## Constraint inventory

JSON Schema structure is unchanged. Each runtime-enforced static rule is communicated by the named provider-visible description.

| Tool | Runtime rule | Provider-visible location |
|---|---|---|
| `read` | `offset` and `limit` are positive; offset is one-indexed; obvious base-10 strings are accepted. | `offset`, `limit` descriptions |
| `read` | `symbol` is non-empty; symbol may combine with `limit`, `map`, and `bundle: "local"`, but not `offset`; bundle requires symbol. | `symbol`, `offset`, `map`, `bundle` descriptions |
| `edit` | Existing-file edits need fresh session anchors; `edits` is non-empty; every item has exactly one variant. | `path`, `edits` descriptions |
| `edit` | Anchored variants use fresh `LINE:HASH`; `replace.old_text` is non-empty; `replace_symbol.new_body` is non-blank; unsafe duplicate/overlapping targets fail before mutation. Safe identical replacements are deduplicated, conflicting same-anchor single-line edits keep the last with a warning, and same-anchor insertions remain valid. | nested variant and item descriptions |
| `grep` | `context`/`scopeContext` are non-negative, `limit` is positive, and obvious base-10 strings are accepted. | numeric descriptions |
| `grep` | `scopeContext` requires `scope: "symbol"`; summary returns per-file counts without anchors. | `scopeContext`, `summary` descriptions |
| `ast_search` | `pattern` is an ast-grep structural pattern; `limit` is positive and accepts an obvious base-10 string. | `pattern`, `limit` descriptions |
| `write` | Creates or fully overwrites; content is complete; bare CR is refused; binary-looking content has no anchors; map requests a structural map. | `path`, `content`, `map` descriptions |
| `ls` | `path` is one directory; limit is positive and accepts an obvious base-10 string; globs need balanced brackets and braces. | `path`, `limit`, `glob` descriptions |
| `find` | `path` is a directory; limit is positive; maxDepth is non-negative; runtime coercion accepts numeric strings where documented. | `path`, `limit`, `maxDepth` descriptions |
| `find` | Regex mode requires a valid JavaScript regex; dates accept ISO or `Nm`/`Nh`/`Nd`; non-negative sizes accept bytes or B, K, KB, M, MB, G, GB. | `pattern`, `regex`, `modifiedSince`, size descriptions |
| `nu` | `command` is a Nushell script; timeout is seconds with default 30. No unsupported positivity rule is claimed. | `command`, `timeout` descriptions |

These are text-only metadata changes: no root `oneOf`/`anyOf`, provider-request rewrite, runtime validation change, error change, or structured-result change.

## What reaches providers

At the real `createAgentSession` boundary, compact descriptions are attached to registered tool definitions. Prompt snippets and guidelines appear in `session.systemPrompt`. The full `prompts/*.md` bodies are detailed references and do not reach the provider. Changing a prompt body alone therefore does not change provider-visible metadata. `tests/pi-prompt-metadata-integration.test.ts` captures all three surfaces.

## Measured diagnosis

The scan covered 2,665 sessions and 17,072 `read` calls. It found 43 ambiguous calls across 27 sessions and eight model routes: `openai-codex/gpt-5.5` (18), `openai-codex/gpt-5.6-sol` (8), `anthropic-cc/claude-opus-4-7` (7), `openai-codex/gpt-5.3-codex-spark` (3), `anthropic-cc/claude-fable-5` (3), `openai-codex/gpt-5.2` (2), `anthropic/claude-opus-4-6` (1), and `anthropic-cc/claude-opus-4-8` (1).

That is approximately 0.25% of all reads and approximately 1.3% of mode-using reads. All were safely rejected under the then-current runtime; 36 of 43 were self-corrected at the call-shape level later in the same session.

Compact metadata landed on 2026-05-16. Before it, 16 of 2,259 mode-using reads were ambiguous (0.71%); after it, 27 of 1,037 were ambiguous (2.60%). This comparison is correlational, not causal. The changed model mix is a confound: several routes occur only later.

Post-#248, `symbol+limit`, `symbol+map`, and `symbol+bundle+map` are valid. `symbol+offset` and bundle-without-symbol remain invalid.

## Reproducing the scan

```bash
node scripts/scan-ambiguous-read-calls.mjs ~/.pi/agent/sessions \
  --compact-since 2026-05-16T00:00:00Z
```

The harness recursively scans every encoded-project subdirectory beneath the Pi session root. Use `--through <ISO>` to preserve a fixed observation window when the directory keeps receiving sessions. ISO flags are validated strictly; unknown or duplicate flags, corrupt JSON/session timestamps, and malformed assistant content fail the scan rather than producing partial statistics.

`totalReads` counts every assistant `read` call. `modeUsingReads` counts calls containing `symbol`, `map: true`, or `bundle`. The baseline numerator `ambiguousReads` counts pre-#248 rejected cross-mode shapes: symbol with offset/limit/map, bundle with offset/limit/map, or bundle without symbol. `selfCorrected` means a later non-ambiguous read targets the same path in the session; it measures correction of the tool-call shape, not successful execution of that later call.

Before/after classification uses the session header timestamp. `--through` includes a session only when its header is in range, then excludes individual rows after the cutoff; a row exactly at the cutoff is included.

A post-release rerun is observational follow-up, not a 0.13.0 release gate. Preserve the input snapshot or use `--through` for fixed periods.
