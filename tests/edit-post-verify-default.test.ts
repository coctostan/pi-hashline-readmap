import { describe, expect, it, beforeEach, vi } from "vitest";
import { computeLineHash } from "../src/hashline.js";

const fsMock = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return { ...actual, readFile: fsMock.readFile, writeFile: fsMock.writeFile };
});

import { registerEditTool } from "../src/edit.js";

function captureEditTool() {
  let tool: any;
  registerEditTool({ registerTool(def: any) { tool = def; } } as any, { wasReadInSession: () => true });
  if (!tool) throw new Error("edit tool was not registered");
  return tool;
}

describe("edit postEditVerify default", () => {
  beforeEach(async () => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
  });

  it("documents the explicit option and leaves verification off when absent", async () => {
    const tool = captureEditTool();
    expect(tool.parameters.properties.postEditVerify).toBeTruthy();
    expect(tool.parameters.properties.postEditVerify.type).toBe("boolean");

    fsMock.readFile.mockResolvedValue(Buffer.from("alpha\nbeta", "utf8"));
    fsMock.writeFile.mockResolvedValue(undefined);
    const anchor = `1:${computeLineHash(1, "alpha")}`;

    const result = await tool.execute(
      "tc",
      { path: "/tmp/post-edit-default.txt", edits: [{ set_line: { anchor, new_text: "ALPHA" } }] },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).toBeUndefined();
    expect(fsMock.writeFile).toHaveBeenCalledWith("/tmp/post-edit-default.txt", "ALPHA\nbeta", "utf-8");
    expect(fsMock.readFile).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toContain("Edited /tmp/post-edit-default.txt");
    expect(result.details.diff).toContain("alpha");
    expect(result.details.diffData).toEqual(result.details.ptcValue.diffData);
    expect(result.details.ptcValue.ok).toBe(true);
    expect(result.details.ptcValue.warnings).toEqual([]);
    expect(result.details.ptcValue.semanticSummary).toBeTruthy();
    expect(result.details.firstChangedLine).toBe(1);
    expect(result.details.contextHygiene.classification).toBe("mutation");
  });
});
