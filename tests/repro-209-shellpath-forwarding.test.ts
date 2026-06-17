import { describe, expect, it, vi } from "vitest";
import { registerBashRendererTool } from "../src/bash-renderer.js";

// Repro for issue #209: bash tool must thread pi's shellPath through
// registerBashRendererTool so the built-in bash factory spawns the
// configured shell instead of falling back to a PATH lookup.
describe("repro 209: shellPath forwarding", () => {
  it("forwards a configured shellPath to the built-in bash factory", async () => {
    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok\n" }] }));
    // The custom factory receives (cwd, options) so we can assert shellPath.
    const createBuiltIn = vi.fn((_cwd: string, _options?: { shellPath?: string }) => ({
      name: "bash",
      label: "bash",
      description: "bash",
      parameters: {},
      execute,
    }));

    let registered: any;
    registerBashRendererTool(
      { registerTool(def: any) { registered = def; } } as any,
      { createBuiltInBashTool: createBuiltIn as any, cwd: "/tmp/work", shellPath: "/custom/git/bin/bash" } as any,
    );

    await registered.execute("call-1", { command: "echo hi" }, undefined, undefined, { cwd: "/tmp/work" });

    // BUG: today the factory is only ever called with cwd; shellPath is dropped.
    expect(createBuiltIn).toHaveBeenCalledWith("/tmp/work", { shellPath: "/custom/git/bin/bash" });
  });
});
