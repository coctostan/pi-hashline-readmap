import { beforeEach, describe, expect, it, vi } from "vitest";

const builtinExecute = vi.fn();

vi.mock("@earendil-works/pi-coding-agent", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "@earendil-works/pi-coding-agent",
  );
  return {
    ...actual,
    createGrepTool: () => ({ execute: builtinExecute }),
  };
});

import { registerGrepTool } from "../src/grep.js";

function captureGrepTool(): any {
  let captured: any;
  registerGrepTool({
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
    "null-grep",
    params,
    new AbortController().signal,
    undefined,
    { cwd: process.cwd() },
  );
}

describe("grep null parameters", () => {
  beforeEach(() => {
    builtinExecute.mockReset();
    builtinExecute.mockResolvedValue({
      content: [{ type: "text", text: "" }],
      isError: false,
      details: { ptcValue: { tool: "grep", ok: true, matches: [] } },
    });
  });

  it("rejects null pattern before delegation and makes every optional null equivalent to omission", async () => {
    const tool = captureGrepTool();
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
          tool: "grep",
          ok: false,
          error: { code: "invalid-null" },
        },
      },
    });
    expect(builtinExecute).not.toHaveBeenCalled();

    const optionalKeys = [
      "path",
      "glob",
      "ignoreCase",
      "literal",
      "context",
      "limit",
      "summary",
      "scope",
      "scopeContext",
    ] as const;
    for (const key of optionalKeys) {
      const omitted = await execute(tool, { pattern: "needle" });
      const nulled = await execute(tool, { pattern: "needle", [key]: null });
      expect(projection(nulled), key).toEqual(projection(omitted));
    }
  });
});
