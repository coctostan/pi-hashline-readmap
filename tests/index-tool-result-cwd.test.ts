import { it, expect } from "vitest";
import init from "../index.js";
import { buildFileResource } from "../src/context-hygiene.js";

it("resolves bash mutation targets using live context cwd", () => {
  const handlers: Record<string, Function> = {};
  init({ registerTool() {}, on(name: string, fn: Function) { handlers[name] = fn; }, events: { emit() {}, on() {} } } as any);
  let cwd = "/tmp/context-hygiene-ctx-cwd-defect-e";
  const ctx = { get cwd() { return cwd; } };
  const event = { toolName: "bash", toolCallId: "bash-cwd", input: { command: "rm target.ts" }, content: [{ type: "text", text: "" }], isError: false };
  const result = handlers.tool_result(event, ctx);
  expect(result.details.contextHygiene.resources).toEqual(expect.arrayContaining([buildFileResource(`${cwd}/target.ts`)]));
  cwd = "/tmp/context-hygiene-second-cwd";
  const next = handlers.tool_result({ ...event, toolCallId: "bash-cwd-2" }, ctx);
  expect(next.details.contextHygiene.resources).toEqual(expect.arrayContaining([buildFileResource(`${cwd}/target.ts`)]));
  const fallback = handlers.tool_result({ ...event, toolCallId: "bash-cwd-3" });
  expect(fallback.details.contextHygiene.resources).toEqual(expect.arrayContaining([buildFileResource(`${process.cwd()}/target.ts`)]));
});
