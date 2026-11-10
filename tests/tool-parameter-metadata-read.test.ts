import { describe, expect, it } from "vitest";
import { registerReadTool } from "../src/read.js";

const capture = () => registerReadTool({ registerTool() {} } as any) as any;
const execute = (tool: any, input: Record<string, unknown>) => tool.execute("metadata", input, new AbortController().signal, undefined, { cwd: process.cwd() });

describe("provider-visible read constraints", () => {
  it("states numeric and composition rules while preserving runtime envelopes", async () => {
    const read = capture();
    expect(read.parameters.properties.offset.anyOf.map((x: any) => x.description)).toEqual([
      "Positive 1-indexed int or base-10 string; symbol wins",
      "Positive 1-indexed int or base-10 string; symbol wins",
    ]);
    expect(read.parameters.properties.limit.anyOf.map((x: any) => x.description)).toEqual([
      "Positive int or obvious base-10 numeric string",
      "Positive int or obvious base-10 numeric string",
    ]);
    expect(read.parameters.properties.symbol.description).toBe("Non-empty; may combine with limit, map, or local bundle");
    expect(read.parameters.properties.map.description).toBe("Append map; valid with symbol, limit, and local bundle");
    expect(read.parameters.properties.bundle.description).toBe("local; requires symbol; valid with limit and map");

    const symbolOffset = await execute(read, { path: "tests/fixtures/small.ts", symbol: "createDemoDirectory", offset: 1 });
    expect(symbolOffset.isError).not.toBe(true);
    expect(symbolOffset.content[0].text).toMatch(/^\[Read params adjusted: ignored offset 1 with symbol\]\n\n.*createDemoDirectory/s);
    expect(symbolOffset.details.ptcValue.warnings[0]).toMatchObject({ code: "params-adjusted", message: "[Read params adjusted: ignored offset 1 with symbol]" });
    const bundleOnly = await execute(read, { path: "tests/fixtures/small.ts", bundle: "local" });
    expect(bundleOnly).toMatchObject({ isError: true, content: [{ type: "text", text: "Cannot use bundle without symbol. Use read({ path, symbol, bundle: \"local\" })." }], details: { ptcValue: { tool: "read", ok: false, error: { code: "invalid-params-combo" } } } });
    for (const input of [
      { path: "tests/fixtures/small.ts", symbol: "createDemoDirectory", limit: 2 },
      { path: "tests/fixtures/small.ts", symbol: "createDemoDirectory", map: true },
      { path: "tests/fixtures/small.ts", symbol: "createDemoDirectory", limit: 2, bundle: "local", map: true },
    ]) expect((await execute(read, input)).isError, JSON.stringify(input)).not.toBe(true);
  });
});
