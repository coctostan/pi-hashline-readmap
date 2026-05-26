import { describe, it, expect } from "vitest";
import { registerWriteTool } from "../src/write.js";

function captureWrite() {
  const tools: Record<string, any> = {};
  const pi = { registerTool(def: any) { tools[def.name] = def; } };
  registerWriteTool(pi as any);
  return tools.write;
}

describe("write tool inline ptc", () => {
  it("exposes an inline ptc block matching pi-ptc-next's mutating fallback", () => {
    const write = captureWrite();
    expect(write.ptc).toBeDefined();
    expect(write.ptc.pythonName).toBe("write");
    expect(write.ptc.policy).toBe("mutating");
    expect(write.ptc.readOnly).toBe(false);
    expect(write.ptc.callable).toBe(true);
    expect(write.ptc.enabled).toBe(true);
    expect(write.ptc.defaultExposure).toBe("not-safe-by-default");
  });
});
