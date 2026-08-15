import { describe, expect, it, vi } from "vitest";
import { registerBashRendererTool } from "../src/bash-renderer.js";

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

describe("bash null parameters", () => {
  it("rejects null command before delegation and makes null timeout equivalent to omission", async () => {
    const executeBuiltIn = vi.fn(async (
      _toolCallId: string,
      params: Record<string, unknown>,
    ) => ({
      content: [{ type: "text", text: JSON.stringify(params) }],
      details: { ptcValue: { tool: "bash", params } },
    }));
    let captured: any;
    registerBashRendererTool({
      registerTool(definition: any) {
        captured = definition;
      },
    } as any, {
      cwd: "/tmp/null-bash",
      createBuiltInBashTool: () => ({ execute: executeBuiltIn }),
    });

    expect(captured).not.toHaveProperty("constrainedSampling");
    const required = await captured.execute(
      "null-bash",
      { command: null },
      undefined,
      undefined,
      { cwd: "/tmp/null-bash" },
    );
    expect(required).toMatchObject({
      isError: true,
      content: [{
        type: "text",
        text: "Invalid command: expected string, received null.",
      }],
      details: {
        ptcValue: {
          tool: "bash",
          ok: false,
          error: { code: "invalid-null" },
        },
      },
    });
    expect(executeBuiltIn).not.toHaveBeenCalled();

    const omitted = await captured.execute(
      "null-bash",
      { command: "echo ok" },
      undefined,
      undefined,
      { cwd: "/tmp/null-bash" },
    );
    const nulled = await captured.execute(
      "null-bash",
      { command: "echo ok", timeout: null },
      undefined,
      undefined,
      { cwd: "/tmp/null-bash" },
    );

    expect(projection(nulled)).toEqual(projection(omitted));
    expect(executeBuiltIn).toHaveBeenNthCalledWith(
      1,
      "null-bash",
      { command: "echo ok" },
      undefined,
      undefined,
    );
    expect(executeBuiltIn).toHaveBeenNthCalledWith(
      2,
      "null-bash",
      { command: "echo ok" },
      undefined,
      undefined,
    );
  });
});
