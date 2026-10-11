import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type, type TSchema } from "typebox";
import init from "../../index.js";
import { applyCodemodeIntegration, withCodemodeIntegration } from "../../src/codemode-integration.js";
import { withRawArgumentGuard } from "../../src/raw-argument-guard.js";

const parameters = Type.Object({ path: Type.String() });
const definition: ToolDefinition<TSchema, unknown, unknown> = {
  name: "read",
  label: "fixture read",
  description: "Compile-time host-boundary fixture",
  parameters,
  outputSchema: Type.Object({ text: Type.String() }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  async execute(_id, params, signal, _update, ctx) {
    await ctx.executeTool("read", params, { signal });
    return {
      content: [{ type: "text", text: "fixture" }],
      details: undefined,
      structuredContent: { text: "fixture" },
    };
  },
  renderResult(_result, options, _theme, context) {
    const duration: number | undefined = context.durationMs;
    const padding: number = context.outputPad;
    return new Text(options.isPartial ? "running" : String(duration ?? padding), 0, 0);
  },
};

export function checkHostContracts(pi: ExtensionAPI): ExtensionAPI {
  init(pi);
  const guarded = withCodemodeIntegration(withRawArgumentGuard(pi));
  guarded.registerTool(applyCodemodeIntegration(definition));
  pi.on("tool_call", event => event.parentToolCallId
    ? { block: true, reason: "fixture permission denied" }
    : undefined);
  pi.on("tool_result", event => ({
    content: event.content,
    details: event.details,
    structuredContent: event.structuredContent,
  }));
  return guarded;
}
