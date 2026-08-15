import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerLsTool } from "../src/ls.js";

function captureLsTool(): any {
  let captured: any;
  registerLsTool({
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

describe("ls null parameters", () => {
  it("makes every optional null equivalent to omission", async () => {
    const directory = mkdtempSync(join(tmpdir(), "null-ls-"));
    writeFileSync(join(directory, "alpha.ts"), "alpha\n", "utf8");
    writeFileSync(join(directory, "beta.txt"), "beta\n", "utf8");
    const tool = captureLsTool();
    const execute = (params: Record<string, unknown>) => tool.execute(
      "null-ls",
      params,
      new AbortController().signal,
      undefined,
      { cwd: directory },
    );

    try {
      expect(tool).not.toHaveProperty("constrainedSampling");
      const rows: Array<{
        key: "path" | "limit" | "glob";
        base: Record<string, unknown>;
      }> = [
        { key: "path", base: {} },
        { key: "limit", base: { path: directory } },
        { key: "glob", base: { path: directory } },
      ];

      for (const { key, base } of rows) {
        const omitted = await execute(base);
        const nulled = await execute({ ...base, [key]: null });
        expect(projection(nulled), key).toEqual(projection(omitted));
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
