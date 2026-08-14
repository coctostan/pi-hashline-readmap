import { describe, expect, it } from "vitest";
import { registerGrepTool } from "../src/grep.js";

const execute = (tool: any, input: Record<string, unknown>) => tool.execute("metadata", input, new AbortController().signal, undefined, { cwd: process.cwd() });

describe("provider-visible grep constraints", () => {
  it("states numeric, scope, and summary rules without changing validation", async () => {
    const grep = registerGrepTool({ registerTool() {} } as any) as any;
    expect(grep.parameters.properties.context.anyOf.map((x: any) => x.description)).toEqual([
      "Non-negative int or obvious base-10 numeric string",
      "Non-negative int or obvious base-10 numeric string",
    ]);
    expect(grep.parameters.properties.limit.anyOf.map((x: any) => x.description)).toEqual([
      "Positive int or obvious base-10 numeric string",
      "Positive int or obvious base-10 numeric string",
    ]);
    expect(grep.parameters.properties.summary.description).toBe("Per-file counts only; no edit anchors");
    expect(grep.parameters.properties.scope.description).toBe("symbol only; enables scopeContext");
    expect(grep.parameters.properties.scopeContext.anyOf.map((x: any) => x.description)).toEqual([
      "Non-negative int/base-10 string; requires scope: symbol",
      "Non-negative int/base-10 string; requires scope: symbol",
    ]);
    const result = await execute(grep, { pattern: "createDemoDirectory", scopeContext: "2" });
    expect(result).toMatchObject({ isError: true, content: [{ type: "text", text: "Invalid scopeContext: requires scope: \"symbol\". For normal surrounding-line context outside symbol scope, use the `context` parameter." }], details: { ptcValue: { tool: "grep", ok: false, error: { code: "invalid-params-combo" } } } });
  });
});
