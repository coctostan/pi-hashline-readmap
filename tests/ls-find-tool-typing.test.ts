import { describe, it, expect, vi } from "vitest";
import { registerLsTool } from "../src/ls.js";
import { registerFindTool } from "../src/find.js";

describe("ls/find tool registration contract", () => {
  it("returns the same tool definitions passed to registerTool", () => {
    const pi = { registerTool: vi.fn() };

    const lsTool = registerLsTool(pi as any);
    const findTool = registerFindTool(pi as any);

    expect(pi.registerTool).toHaveBeenNthCalledWith(1, lsTool);
    expect(pi.registerTool).toHaveBeenNthCalledWith(2, findTool);
    expect(lsTool).toMatchObject({ name: "ls" });
    expect(findTool).toMatchObject({ name: "find" });
    expect(lsTool).not.toHaveProperty("ptc");
    expect(findTool).not.toHaveProperty("ptc");
    expect(typeof lsTool.execute).toBe("function");
    expect(typeof findTool.execute).toBe("function");
  });
});
