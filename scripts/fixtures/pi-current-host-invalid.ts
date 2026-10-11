import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
type RendererContext = Parameters<NonNullable<ToolDefinition["renderResult"]>>[3];
export const incompatible: Pick<RendererContext, "durationMs"> = { durationMs: "slow" };
