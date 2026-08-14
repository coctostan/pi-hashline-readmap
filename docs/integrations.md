# Integration surfaces

`pi-hashline-readmap` exposes its registered tool executors for downstream pi integrations that want to call the same enhanced tools programmatically.

[Back to README](../README.md)

## EventBus executor announcement

When the extension loads, it emits the tool executor map on pi's EventBus:

```ts
pi.events.emit("hashline:tool-executors", toolExecutors);
```

Consumers can listen for the `hashline:tool-executors` event to discover the active executor map.

## Global executor map

The extension also assigns the executor map to `globalThis`:

```ts
(globalThis as any).__hashlineToolExecutors = toolExecutors;
```

This is intended for local integration with pi tooling that cannot subscribe to the EventBus directly.

## Available executors

The map includes these keys when the corresponding tool is registered:

| Key | Notes |
|---|---|
| `read` | Enhanced hashlined read tool. |
| `edit` | Hash-anchored mutating edit tool. |
| `grep` | Hashlined text search. |
| `ast_search` | Structural search wrapper; usefulness depends on local `ast-grep` availability. |
| `write` | File creation/full-write tool with hashlined output. |
| `ls` | Single-directory listing. |
| `find` | Recursive file discovery. |
| `nu` | Present only when the optional Nushell integration registers successfully. |
| `context_hygiene_report` | Present only when `PI_CONTEXT_HYGIENE_DEBUG=1`. |

## Recommended consumer behavior

- Prefer the exported PTC policy in [structured-output.md](structured-output.md) when deciding which tools are safe to expose by default.
- Treat `edit` and `write` as mutating operations even if an executor is present.
- Use `details.ptcValue` for structured results instead of parsing rendered output when possible.
- Be prepared for optional executors such as `nu` and `context_hygiene_report` to be absent.
- Do not rely on hot reload. Restart the pi session after changing this extension's source.

## Provider-visible prompt metadata

At Pi's real `createAgentSession` boundary, every registered tool can expose `description`, `promptSnippet`, and flat `promptGuidelines`. Pi uses snippets and guidelines when assembling `session.systemPrompt`; provider tool definitions carry tool and recursive parameter descriptions. Hashline's full prompt documents are detailed references and do not become provider-visible merely because their bodies change. See [the metadata contract and diagnosis](tool-metadata.md) for the exact boundary test and inventory.

## PTC policy consumers

`pi-prompt-assembler` may optionally consume `HASHLINE_TOOL_PTC_POLICY` when deciding which helpers to expose. Presence in the executor map does not override the policy's mutability or default-exposure classification.

## Related docs

- [structured-output.md](structured-output.md) for `details.ptcValue` and PTC policy.
- [context-hygiene.md](context-hygiene.md) for stale-context metadata attached to tool results.
- [bash-output.md](bash-output.md) for Bash result post-processing and recovery behavior.
