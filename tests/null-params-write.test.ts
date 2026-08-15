import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerWriteTool } from "../src/write.js";

function captureWriteTool(): any {
  let captured: any;
  registerWriteTool({
    registerTool(definition: any) {
      captured = definition;
    },
  } as any);
  return captured;
}

function projection(result: any) {
  return {
    content: (result.content ?? [])
      .filter((item: any) => item.type === "text")
      .map((item: any) => item.text)
      .join("\n"),
    isError: result.isError,
    ptcValue: result.details?.ptcValue,
  };
}

describe("write null parameters", () => {
  it("rejects null required strings and makes null map equivalent to omission", async () => {
    const directory = mkdtempSync(join(tmpdir(), "null-write-"));
    const file = join(directory, "sample.txt");
    const tool = captureWriteTool();
    const execute = (params: Record<string, unknown>) => tool.execute(
      "null-write",
      params,
      new AbortController().signal,
      undefined,
      { cwd: directory },
    );

    try {
      expect(tool).not.toHaveProperty("constrainedSampling");

      const nullPath = await execute({ path: null, content: "alpha\n" });
      expect(nullPath).toMatchObject({
        isError: true,
        content: [{
          type: "text",
          text: "Invalid path: expected string, received null.",
        }],
        details: {
          ptcValue: {
            tool: "write",
            ok: false,
            error: { code: "invalid-null" },
          },
        },
      });

      const nullContent = await execute({ path: file, content: null });
      expect(nullContent).toMatchObject({
        isError: true,
        content: [{
          type: "text",
          text: "Invalid content: expected string, received null.",
        }],
        details: {
          ptcValue: {
            tool: "write",
            ok: false,
            error: { code: "invalid-null" },
          },
        },
      });

      rmSync(file, { force: true });
      const omitted = await execute({ path: file, content: "alpha\n" });
      rmSync(file, { force: true });
      const nulled = await execute({
        path: file,
        content: "alpha\n",
        map: null,
      });
      expect(projection(nulled)).toEqual(projection(omitted));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
