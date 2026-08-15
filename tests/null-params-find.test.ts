import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _testable, registerFindTool } from "../src/find.js";

function captureFindTool(): any {
  let captured: any;
  registerFindTool({
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

describe("find null parameters", () => {
  it("rejects null pattern and makes every optional null equivalent to omission", async () => {
    const directory = mkdtempSync(join(tmpdir(), "null-find-"));
    writeFileSync(join(directory, "alpha.ts"), "alpha\n", "utf8");
    writeFileSync(join(directory, "beta.txt"), "beta\n", "utf8");
    const originalIsFdAvailable = _testable.isFdAvailable;
    const originalHintShown = _testable.fdHintShown;
    _testable.isFdAvailable = () => false;
    const tool = captureFindTool();
    const execute = (params: Record<string, unknown>) => {
      _testable.fdHintShown = true;
      return tool.execute(
        "null-find",
        params,
        new AbortController().signal,
        undefined,
        { cwd: directory },
      );
    };

    try {
      expect(tool).not.toHaveProperty("constrainedSampling");
      const required = await execute({ pattern: null });
      expect(required).toMatchObject({
        isError: true,
        content: [{
          type: "text",
          text: "Invalid pattern: expected string, received null.",
        }],
        details: {
          ptcValue: {
            tool: "find",
            ok: false,
            error: { code: "invalid-null" },
          },
        },
      });

      const optionalKeys = [
        "path",
        "limit",
        "type",
        "maxDepth",
        "regex",
        "sortBy",
        "reverse",
        "modifiedSince",
        "minSize",
        "maxSize",
      ] as const;
      for (const key of optionalKeys) {
        const omitted = await execute({ pattern: "*.ts" });
        const nulled = await execute({ pattern: "*.ts", [key]: null });
        expect(projection(nulled), key).toEqual(projection(omitted));
      }
    } finally {
      _testable.isFdAvailable = originalIsFdAvailable;
      _testable.fdHintShown = originalHintShown;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
