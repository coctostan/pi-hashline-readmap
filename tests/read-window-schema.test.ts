import { describe, expect, it } from "vitest";
import { registerReadTool } from "../src/read.js";

function register(): any {
  let tool: any;
  registerReadTool({ registerTool(def: any) { tool = def; } } as any);
  return tool;
}

describe("read schema — long-line window params", () => {
  it("adds charOffset and charLimit as optional number|string params after limit", () => {
    const params = register().parameters;
    expect(Object.keys(params.properties)).toEqual([
      "path", "offset", "limit", "charOffset", "charLimit", "symbol", "strictSymbol", "map", "bundle",
    ]);
    expect(params.required).toEqual(["path"]);
    for (const key of ["charOffset", "charLimit"]) {
      expect(params.properties[key].anyOf.map((s: any) => s.type).sort()).toEqual(["number", "string"]);
    }
  });

  it("keeps schema and description static regardless of environment settings", () => {
    const before = register();
    const saved = process.env.PI_HASHLINE_GREP_MAX_LINES;
    process.env.PI_HASHLINE_GREP_MAX_LINES = "7";
    try {
      const after = register();
      expect(JSON.stringify(after.parameters)).toBe(JSON.stringify(before.parameters));
      expect(after.description).toBe(before.description);
    } finally {
      if (saved === undefined) delete process.env.PI_HASHLINE_GREP_MAX_LINES;
      else process.env.PI_HASHLINE_GREP_MAX_LINES = saved;
    }
  });
});
