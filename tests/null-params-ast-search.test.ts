import { describe, expect, it, vi } from "vitest";
import * as cp from "node:child_process";

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "node:child_process",
  );
  return { ...actual, execFile: vi.fn() };
});

import { registerSgTool } from "../src/sg.js";

function captureAstSearchTool(): any {
  let captured: any;
  registerSgTool({
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
    "null-ast-search",
    params,
    new AbortController().signal,
    undefined,
    { cwd: process.cwd() },
  );
}

describe("ast_search null parameters", () => {
  it("rejects null pattern before spawning ast-grep and makes optional nulls equivalent to omission", async () => {
    vi.mocked(cp.execFile).mockImplementation((
      _command: any,
      _args: any,
      _options: any,
      callback: any,
    ) => {
      callback(null, "[]", "");
      return {} as any;
    });

    const tool = captureAstSearchTool();
    expect(tool).not.toHaveProperty("constrainedSampling");

    const required = await execute(tool, { pattern: null });
    expect(required).toMatchObject({
      isError: true,
      content: [{
        type: "text",
        text: "Invalid pattern: expected string, received null.",
      }],
      details: {
        ptcValue: {
          tool: "ast_search",
          ok: false,
          error: { code: "invalid-null" },
        },
      },
    });
    expect(cp.execFile).not.toHaveBeenCalled();

    for (const key of ["lang", "path", "limit"] as const) {
      const omitted = await execute(tool, { pattern: "$VALUE" });
      const nulled = await execute(tool, { pattern: "$VALUE", [key]: null });
      expect(projection(nulled), key).toEqual(projection(omitted));
    }
  });
});
