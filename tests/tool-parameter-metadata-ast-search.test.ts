import { afterEach, describe, expect, it, vi } from "vitest";
describe("provider-visible ast_search constraints", () => {
  afterEach(() => { vi.doUnmock("node:child_process"); vi.resetModules(); });
  it("states structural-pattern and positive-limit domains", async () => {
    vi.doMock("node:child_process", async () => ({ ...(await vi.importActual<any>("node:child_process")), execFileSync: vi.fn(() => Buffer.from("0.111.0\n")) }));
    const { registerSgTool } = await import("../src/sg.js");
    const tool = registerSgTool({ registerTool() {} } as any) as any;
    expect(tool.parameters.properties.pattern.description).toBe("ast-grep structural pattern");
    expect(tool.parameters.properties.limit.anyOf.map((x: any) => x.description)).toEqual([
      "Positive int or obvious base-10 numeric string",
      "Positive int or obvious base-10 numeric string",
    ]);
    expect(await tool.execute("metadata", { pattern: "$A", limit: "0" }, new AbortController().signal, undefined, { cwd: process.cwd() })).toMatchObject({ isError: true, content: [{ type: "text", text: "Invalid limit: expected a positive integer, received 0." }], details: { ptcValue: { tool: "ast_search", ok: false, error: { code: "invalid-limit" } } } });
  });
});
