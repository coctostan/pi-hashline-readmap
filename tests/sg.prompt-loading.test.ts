import { describe, it, expect } from "vitest";

async function getSgTool() {
  const { registerSgTool } = await import("../src/sg.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerSgTool(mockPi as any);
  if (!captured) throw new Error("sg tool was not registered");
  return captured;
}

describe("sg prompt loading", () => {
  it("uses prompts/sg.md as tool description", async () => {
    const tool = await getSgTool();
    expect(tool.description).toContain("ast-grep");
    expect(tool.description).toContain("$NAME");
  });
});
