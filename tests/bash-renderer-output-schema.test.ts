import { it, expect, vi } from "vitest";
import { registerBashRendererTool } from "../src/bash-renderer.js";

it("preserves the optional native output schema without copying input metadata", () => {
  const outputSchema = { type: "object" };
  for (const native of [{ outputSchema }, {}]) {
    let registered: any;
    const createBuiltIn = vi.fn(() => native);
    const tool = registerBashRendererTool({ registerTool(def: any) { registered = def; } } as any, {
      cwd: "/tmp/work", createBuiltInBashTool: createBuiltIn,
    });
    expect(createBuiltIn).not.toHaveBeenCalled();
    expect(registered).toBe(tool);
    expect(tool.outputSchema).toBe((native as any).outputSchema);
    expect(createBuiltIn).toHaveBeenCalledWith("/tmp/work", { shellPath: undefined });
    expect(tool).not.toHaveProperty("constrainedSampling");
    expect(tool.parameters.properties.command.description).toBe("Test/build/git/pkg/external command; not repo file read/search/list/edit.");
  }
});
