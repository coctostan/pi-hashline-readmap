import { describe, it, expect } from "vitest";

async function getSgTool() {
  const { registerSgTool } = await import("../src/sg.js");
  let captured: any = null;
  const mockPi = {
    registerTool(def: any) {
      captured = def;
    },
  };
  registerSgTool(mockPi as any);
  if (!captured) throw new Error("sg tool was not registered");
  return captured;
}

describe("sg tool schema", () => {
  it("registers name=sg and requires pattern only", async () => {
    const tool = await getSgTool();

    expect(tool.name).toBe("sg");
    expect(tool.parameters).toBeTruthy();

    expect(tool.parameters.properties.pattern.type).toBe("string");
    expect(tool.parameters.properties.lang.type).toBe("string");
    expect(tool.parameters.properties.path.type).toBe("string");

    expect(tool.parameters.required).toContain("pattern");
    expect(tool.parameters.required).not.toContain("lang");
    expect(tool.parameters.required).not.toContain("path");
  });
});
