import { it, expect, vi } from "vitest";
const native = vi.hoisted(() => ({
  execute: vi.fn(async (_id: string, _params: any, _signal: any, _update: any, ctx?: any) => ({
    content: [{ type: "text", text: "" }], details: { nativeModel: ctx?.model?.id ?? "missing-model" },
  })),
}));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...await importOriginal<typeof import("@earendil-works/pi-coding-agent")>(),
  createGrepTool: () => ({ execute: native.execute }),
}));
import { registerGrepTool } from "../src/grep.js";
it("native grep behavior receives execution context", async () => {
  let tool: any;
  registerGrepTool({ registerTool(def: any) { tool = def; } } as any);
  const ctx = { cwd: process.cwd(), model: { id: "test-model" } };
  const signal = new AbortController().signal;
  const onUpdate = vi.fn();
  const result = await tool.execute("grep-ctx", { pattern: "anything", context: "2", limit: "3" }, signal, onUpdate, ctx);
  expect(result.details.nativeModel).toBe("test-model");
  expect(native.execute).toHaveBeenCalledWith("grep-ctx", expect.objectContaining({ pattern: "anything", context: 2, limit: 3 }), signal, onUpdate, ctx);
});
