import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerEditTool } from "../src/edit.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";

function captureEditTool(): any {
  let captured: any;
  registerEditTool({
    registerTool(definition: any) {
      captured = definition;
    },
  } as any, {
    wasReadInSession: () => true,
    syntaxValidate: "off",
  });
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

describe("edit null parameters", () => {
  it("rejects null path and normalizes top-level and edit-item optional nulls", async () => {
    await ensureHashInit();
    const directory = mkdtempSync(join(tmpdir(), "null-edit-"));
    const file = join(directory, "sample.txt");
    const tool = captureEditTool();
    const signal = new AbortController().signal;
    const context = { cwd: directory };
    const anchor = `1:${computeLineHash(1, "alpha")}`;

    const execute = (params: Record<string, unknown>) =>
      tool.execute("null-edit", params, signal, undefined, context);
    const expectPair = async (
      omitted: Record<string, unknown>,
      nulled: Record<string, unknown>,
    ) => {
      writeFileSync(file, "alpha\n", "utf8");
      const omittedResult = await execute(omitted);
      writeFileSync(file, "alpha\n", "utf8");
      const nulledResult = await execute(nulled);
      expect(projection(nulledResult)).toEqual(projection(omittedResult));
    };

    try {
      expect(tool).not.toHaveProperty("constrainedSampling");
      const required = await execute({ path: null });
      expect(required).toMatchObject({
        isError: true,
        content: [{
          type: "text",
          text: "Invalid path: expected string, received null.",
        }],
        details: {
          ptcValue: {
            tool: "edit",
            ok: false,
            error: { code: "invalid-null" },
          },
        },
      });

      await expectPair(
        { path: file },
        { path: file, edits: null },
      );
      await expectPair(
        {
          path: file,
          edits: [{ set_line: { anchor, new_text: "beta" } }],
        },
        {
          path: file,
          edits: [{ set_line: { anchor, new_text: "beta" } }],
          postEditVerify: null,
        },
      );
      await expectPair(
        {
          path: file,
          edits: [{ insert_after: { anchor, new_text: "beta" } }],
        },
        {
          path: file,
          edits: [{
            insert_after: { anchor, new_text: "beta", text: null },
          }],
        },
      );
      await expectPair(
        {
          path: file,
          edits: [{
            replace: { old_text: "alpha", new_text: "beta" },
          }],
        },
        {
          path: file,
          edits: [{
            replace: { old_text: "alpha", new_text: "beta", all: null },
          }],
        },
      );
      await expectPair(
        {
          path: file,
          edits: [{
            replace: { old_text: "alpha", new_text: "beta" },
          }],
        },
        {
          path: file,
          edits: [{
            replace: { old_text: "alpha", new_text: "beta", fuzzy: null },
          }],
        },
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
