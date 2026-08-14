import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { registerWriteTool } from "../src/write.js";
const execute = (tool: any, input: Record<string, unknown>, cwd: string) => tool.execute("metadata", input, new AbortController().signal, undefined, { cwd });

describe("provider-visible write constraints", () => {
  it("states complete-write edge cases without changing runtime envelopes", async () => {
    const write = registerWriteTool({ registerTool() {} } as any) as any; const p = write.parameters.properties;
    expect(p.path.description).toBe("New or existing file path; fully overwrites target");
    expect(p.content.description).toBe("Complete content; bare CR refused; binary gets no anchors");
    expect(p.map.description).toBe("Request a structural map after writing");
    const cwd = mkdtempSync(join(tmpdir(), "hashline-write-metadata-"));
    const barePath = join(cwd, "bare.txt");
    expect(await execute(write, { path: barePath, content: "a\rb" }, cwd)).toMatchObject({ isError: true, details: { ptcValue: { tool: "write", ok: false, lines: [], error: { code: "bare-cr" } } } });
    expect(existsSync(barePath)).toBe(false);
    const binaryPath = join(cwd, "binary.dat");
    expect(await execute(write, { path: binaryPath, content: "a\u0000b" }, cwd)).toMatchObject({ isError: true, details: { ptcValue: { tool: "write", ok: false, lines: [], error: { code: "binary-content" } } } });
    expect(existsSync(binaryPath)).toBe(true);
  });
});
