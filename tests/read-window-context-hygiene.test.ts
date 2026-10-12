import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { registerReadTool } from "../src/read.js";

async function callRead(params: Record<string, unknown>): Promise<any> {
  let tool: any;
  registerReadTool({ registerTool(def: any) { tool = def; } } as any);
  return tool.execute("tc", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}
function fixture(lines: string[]): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-read-window-hygiene-"));
  const path = resolve(dir, "f.txt");
  writeFileSync(path, lines.join("\n"), "utf-8");
  return path;
}

describe("read window — context hygiene", () => {
  const long = "x".repeat(1200);

  it("records a read-context file resource identical to an ordinary read's", async () => {
    const path = fixture(["first", long]);
    const windowed = await callRead({ path, offset: 2, charOffset: 0 });
    const plain = await callRead({ path });
    expect(windowed.details.contextHygiene).toMatchObject({ tool: "read", classification: "read-context" });
    expect(windowed.details.contextHygiene.resources[0].kind).toBe("file");
    expect(windowed.details.contextHygiene.resources).toEqual(plain.details.contextHygiene.resources);
  });

  it("replays offset, charOffset (including 0) and a supplied charLimit", async () => {
    const path = fixture(["first", long]);
    const result = await callRead({ path, offset: 2, charOffset: 0, charLimit: 300 });
    expect(result.details.contextHygiene.rehydrate).toEqual({
      tool: "read",
      input: { path, offset: 2, charOffset: 0, charLimit: 300 },
    });
  });

  it("omits charLimit when the caller did not supply it", async () => {
    const path = fixture(["first", long]);
    const result = await callRead({ path, offset: 2, charOffset: 500 });
    expect(result.details.contextHygiene.rehydrate).toEqual({
      tool: "read",
      input: { path, offset: 2, charOffset: 500 },
    });
  });
});
