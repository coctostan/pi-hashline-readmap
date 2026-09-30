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
it("preserves non-bash structured content after notice prefix host merge", () => {
  const handlers: Record<string, Function> = {};
  init({ registerTool() {}, on(name: string, fn: Function) { handlers[name] = fn; }, events: { emit() {}, on() {} } } as any);
  const input = { pattern: "same-pattern-defect-d" };
  for (let i = 1; i <= 3; i++) handlers.tool_call({ toolName: "grep", toolCallId: `grep-${i}`, input });
  const structuredContent = { matches: 3 };
  const details = { source: "native" };
  const event = { toolName: "grep", toolCallId: "grep-3", input, content: [{ type: "text", text: "match" }], isError: false, details, structuredContent };
  const result = handlers.tool_result(event, {});
  expect(result.content[0].text).toContain("REPEATED-CALL WARNING");
  expect(mergeLikeHost(event, result).structuredContent).toBe(structuredContent);
  expect(result.structuredContent).toBe(structuredContent);
  expect(result.details).toBe(details);
  expect(result.isError).toBe(false);
  expect(handlers.tool_result({ ...event, toolCallId: "grep-without-notice" }, {})).toBeUndefined();
});
