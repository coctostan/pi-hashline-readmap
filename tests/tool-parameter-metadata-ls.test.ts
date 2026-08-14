import { describe, expect, it } from "vitest";
import { registerLsTool } from "../src/ls.js";
const execute = (tool: any, input: Record<string, unknown>) => tool.execute("metadata", input, new AbortController().signal, undefined, { cwd: process.cwd() });

describe("provider-visible ls constraints", () => {
  it("states directory, limit, and balanced-glob rules without changing errors", async () => {
    const ls = registerLsTool({ registerTool() {} } as any) as any;
    expect(ls.parameters.properties.path.description).toBe("One directory path");
    expect(ls.parameters.properties.limit.description).toBe("Positive int or obvious base-10 numeric string");
    expect(ls.parameters.properties.glob.description).toBe("Entry glob with balanced brackets and braces");
    expect(await execute(ls, { path: "tests", limit: "0" })).toMatchObject({ isError: true, content: [{ type: "text", text: "Invalid limit: expected a positive integer, received 0." }], details: { ptcValue: { tool: "ls", ok: false, error: { code: "invalid-limit" } } } });
    expect(await execute(ls, { path: "tests", glob: "[*.ts" })).toMatchObject({ isError: true, content: [{ type: "text", text: "Invalid glob \"[*.ts\": Unterminated character class." }], details: { ptcValue: { tool: "ls", ok: false, error: { code: "invalid-params-combo" } } } });
  });
});
