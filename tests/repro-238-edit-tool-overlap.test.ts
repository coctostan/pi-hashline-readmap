import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { registerEditTool } from "../src/edit.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";

function captureEditTool() {
  let tool: any;
  const pi = { registerTool(definition: any) { tool = definition; } };
  registerEditTool(pi as any, { wasReadInSession: () => true });
  if (!tool) throw new Error("edit tool not registered");
  return tool;
}

describe("issue 238 — edit tool overlap error", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("returns overlapping-edit without writing the file", async () => {
    const cwd = mkdtempSync(resolve(tmpdir(), "pi-edit-overlap-"));
    const filePath = resolve(cwd, "sample.txt");
    const original = ["one", "last request", "three"].join("\n");
    writeFileSync(filePath, original, "utf8");

    const result = await captureEditTool().execute(
      "call-238",
      {
        path: filePath,
        edits: [
          {
            replace_lines: {
              start_anchor: `1:${computeLineHash(1, "one")}`,
              end_anchor: `3:${computeLineHash(3, "three")}`,
              new_text: "whole range",
            },
          },
          {
            set_line: {
              anchor: `2:${computeLineHash(2, "last request")}`,
              new_text: "inside",
            },
          },
        ],
      },
      undefined,
      undefined,
      { cwd },
    );

    expect(result.isError).toBe(true);
    expect(result.details?.ptcValue?.error).toEqual({
      code: "overlapping-edit",
      message:
        "Overlapping anchored edits are not allowed: edits[0] targets lines 1-3 and edits[1] targets line 2.",
    });
    expect(result.content?.[0]?.text).toBe(
      "Overlapping anchored edits are not allowed: edits[0] targets lines 1-3 and edits[1] targets line 2.",
    );
    expect(readFileSync(filePath)).toEqual(Buffer.from(original, "utf8"));
  });
});
