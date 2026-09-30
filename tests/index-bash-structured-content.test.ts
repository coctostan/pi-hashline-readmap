import { it, expect } from "vitest";
import init from "../index.js";
function mergeLikeHost(event: any, result: any) {
  const merged = { ...event };
  if (result.content !== undefined) {
    merged.content = result.content;
    if (result.structuredContent === undefined) delete merged.structuredContent;
  }
  if (result.structuredContent !== undefined) merged.structuredContent = result.structuredContent;
  if (result.isError !== undefined) merged.isError = result.isError;
  return merged;
}
it("preserves native structured bash failure after host merge", () => {
  const handlers: Record<string, Function> = {};
  init({ registerTool() {}, on(name: string, fn: Function) { handlers[name] = fn; }, events: { emit() {}, on() {} } } as any);
  const structuredContent = { output: "audit", truncated: false, exit_code: 7, wall_time_seconds: 0 };
  const event = { toolName: "bash", toolCallId: "bash-structured", input: { command: "printf audit; exit 7" }, content: [{ type: "text", text: "audit" }], isError: true, structuredContent };
  const result = handlers.tool_result(event, { cwd: process.cwd() });
  expect(mergeLikeHost(event, result).structuredContent).toBe(structuredContent);
  expect(result.structuredContent).toBe(structuredContent);
  expect(mergeLikeHost(event, result).isError).toBe(true);
  expect(result.details.compressionInfo).toBeDefined();
  const { structuredContent: omitted, ...legacy } = event;
  const legacyResult = handlers.tool_result({ ...legacy, toolCallId: "bash-legacy" }, {});
  expect(legacyResult.structuredContent).toBeUndefined();
  expect(mergeLikeHost(legacy, legacyResult).structuredContent).toBeUndefined();
});
