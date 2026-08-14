import { describe, expect, it } from "vitest";
import { parseRelativeOrIsoDate, parseSize } from "../src/find-parsers.js";
import { _testable, registerFindTool } from "../src/find.js";
const execute = (tool: any, input: Record<string, unknown>) => tool.execute("metadata", input, new AbortController().signal, undefined, { cwd: process.cwd() });

describe("provider-visible find constraints", () => {
  it("states directory, numeric, regex, date, and size domains", async () => {
    const find = registerFindTool({ registerTool() {} } as any) as any;
    const p = find.parameters.properties;
    expect(p.pattern.description).toBe("Glob/basename; JavaScript regex when regex is true");
    expect(p.path.description).toBe("Directory search root");
    expect(p.limit.description).toBe("Positive int or obvious base-10 numeric string");
    expect(p.maxDepth.description).toBe("Non-negative int; runtime also accepts base-10 strings");
    expect(p.regex.description).toBe("If true, pattern must be a valid JavaScript regex");
    expect(p.modifiedSince.description).toBe("ISO date/time or Nm, Nh, Nd relative age");
    expect(p.minSize.description).toBe("Non-negative bytes or B/K/KB/M/MB/G/GB size");
    expect(p.maxSize.description).toBe("Non-negative bytes or B/K/KB/M/MB/G/GB size");
    expect(parseRelativeOrIsoDate("modifiedSince", "30m", new Date("2026-01-01T00:00:00Z"))).toBeInstanceOf(Date);
    expect(parseRelativeOrIsoDate("modifiedSince", "2026-01-01").toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(parseSize("minSize", 0)).toBe(0);
    for (const value of ["1B", "1K", "1KB", "1M", "1MB", "1G", "1GB"]) expect(parseSize("minSize", value), value).toBeGreaterThanOrEqual(1);
    expect(await execute(find, { pattern: "*.ts", path: "tests", maxDepth: -1 })).toMatchObject({ isError: true, content: [{ type: "text", text: "Error: Invalid maxDepth: expected a non-negative integer, received -1." }], details: { ptcValue: { tool: "find", ok: false, error: { code: "invalid-params-combo" } } } });
    const previous = _testable.isFdAvailable; _testable.isFdAvailable = () => false;
    try { const bad = await execute(find, { pattern: "[", path: "tests", regex: true }); expect(bad.isError).toBe(true); expect(bad.content[0].text).toContain("invalid regex for fields 'pattern'/'regex'"); }
    finally { _testable.isFdAvailable = previous; }
  });
});
