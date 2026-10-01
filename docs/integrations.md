# Integration surfaces

`pi-hashline-readmap` integrates with other tooling through Pi's own extension APIs rather than private side channels.

[Back to README](../README.md)

## Programmatic tool calls (Pi codemode)

Pi's built-in `codemode` tool (Pi 0.99+) runs model-written JavaScript that calls registered tools through `ctx.executeTool()`. Hashline tools participate like any other registered tool: calls go through argument validation and the `tool_call` / `tool_result` hooks, and tools that declare an `outputSchema` resolve to structured values instead of rendered text. See [codemode integration](structured-output.md#codemode-integration) for the script-facing contract.

Other extensions that orchestrate tools should use the same route: `ctx.executeTool(name, args)` from inside a tool, with `ctx.tools` listing what is callable.

Earlier releases published an executor map on the `hashline:tool-executors` EventBus channel and `globalThis.__hashlineToolExecutors`, plus a `HASHLINE_TOOL_PTC_POLICY` export, for the separate PTC extension. Codemode replaced that extension, so these surfaces were removed. Integrations that relied on them should call tools through `ctx.executeTool()` and read tool `annotations` instead.

## Registered tools

| Tool | Notes |
|---|---|
| `read` | Enhanced hashlined read tool. Read-only. |
| `edit` | Hash-anchored mutating edit tool. Destructive. |
| `grep` | Hashlined text search. Read-only. |
| `ast_search` | Structural search wrapper; usefulness depends on local `ast-grep` availability. Read-only. |
| `write` | File creation/full-write tool with hashlined output. Destructive. |
| `ls` | Single-directory listing. Read-only. |
| `find` | Recursive file discovery. Read-only. |
| `bash` | Built-in bash with Hashline rendering and output compression. Conservative default annotations. |
| `nu` | Present only when the optional Nushell integration registers successfully. Conservative default annotations. |
| `context_hygiene_report` | Present only when `PI_CONTEXT_HYGIENE_DEBUG=1`. Read-only. |

## Recommended consumer behavior

- Use tool `annotations` (`readOnlyHint`, `destructiveHint`, `openWorldHint`) from `pi.getAllTools()` to decide which calls need confirmation. `bash` and `nu` deliberately keep Pi's conservative defaults because they run arbitrary commands.
- Use `structuredContent` (in codemode scripts) or `details.ptcValue` (in `tool_result` handlers and renderers) instead of parsing rendered output.
- Be prepared for optional tools such as `nu` and `context_hygiene_report` to be absent.
- Do not rely on hot reload. Restart the pi session after changing this extension's source.

## Provider-visible prompt metadata

At Pi's real `createAgentSession` boundary, every registered tool can expose `description`, `promptSnippet`, and flat `promptGuidelines`. Pi uses snippets and guidelines when assembling `session.systemPrompt`; provider tool definitions carry tool and recursive parameter descriptions. Hashline's full prompt documents are detailed references and do not become provider-visible merely because their bodies change. See [the metadata contract and diagnosis](tool-metadata.md) for the exact boundary test and inventory. Prompt assemblers such as `pi-prompt-assembler` may optionally consume these registered fields.

## Related docs

- [structured-output.md](structured-output.md) for `details.ptcValue`, `structuredContent`, and codemode.
- [context-hygiene.md](context-hygiene.md) for stale-context metadata attached to tool results.
- [bash-output.md](bash-output.md) for Bash result post-processing and recovery behavior.
