import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerReadTool } from "../src/read.js";

const fixture = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/small.ts");

function captureReadTool(): any {
  let captured: any;
  registerReadTool({
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

async function execute(tool: any, params: Record<string, unknown>) {
  return tool.execute(
    "null-read",
    params,
    new AbortController().signal,
    undefined,
    { cwd: process.cwd() },
  );
}

describe("read null parameters", () => {
  it("rejects null path and makes every optional null equivalent to omission", async () => {
    const tool = captureReadTool();
    expect(tool).not.toHaveProperty("constrainedSampling");

    const required = await execute(tool, { path: null });
    expect(required).toMatchObject({
      isError: true,
      content: [{
        type: "text",
        text: "Invalid path: expected string, received null.",
      }],
      details: {
        ptcValue: {
          tool: "read",
          ok: false,
          error: { code: "invalid-null" },
        },
      },
    });

    for (const key of ["offset", "limit", "symbol", "map", "bundle"] as const) {
      const omitted = await execute(tool, { path: fixture });
      const nulled = await execute(tool, { path: fixture, [key]: null });
      expect(projection(nulled), key).toEqual(projection(omitted));
    }
  });
});
