import { afterEach, describe, expect, it, vi } from "vitest";
describe("provider-visible nu constraints", () => {
  afterEach(() => { vi.doUnmock("node:child_process"); vi.resetModules(); });
  it("identifies Nushell scripts and the current timeout default", async () => {
    vi.doMock("node:child_process", async () => ({ ...(await vi.importActual<any>("node:child_process")), execFileSync: vi.fn(() => Buffer.from("0.111.0\n")) }));
    const { registerNuTool } = await import("../src/nu.js");
    const tool = registerNuTool({ registerTool() {} } as any) as any;
    expect(tool.parameters.properties.command.description).toBe("Nushell script");
    expect(tool.parameters.properties.timeout.description).toBe("Seconds; default 30");
    expect(tool.parameters.properties.timeout.description).not.toMatch(/positive|non-negative/i);
  });
});
