import { describe, expect, it, vi } from "vitest";

const delegated = vi.hoisted(() => {
  const error = { code: "delegated-error", message: "Delegated read failed." };
  const warning = { code: "existing-warning", message: "Existing warning." };
  const adjustedResult = {
    content: [{ type: "text", text: error.message }],
    isError: true,
    details: {
      delegated: true,
      ptcValue: { tool: "read", ok: false, error, warnings: [warning] },
    },
  };
  const cleanResult = {
    content: [
      { type: "text", text: "Read image file [image/png]" },
      { type: "image", data: "mock-image", mimeType: "image/png" },
    ],
    details: { delegated: true },
  };
  const execute = vi.fn(async (_id: string, params: any) =>
    String(params.path).includes("clean") ? cleanResult : adjustedResult,
  );
  return { error, warning, adjustedResult, cleanResult, execute };
});

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return { ...actual, createReadTool: () => ({ execute: delegated.execute }) };
});

function textOf(result: any): string {
  return result.content.find((item: any) => item.type === "text")?.text ?? "";
}

async function tool(): Promise<any> {
  const { registerReadTool } = await import("../src/read.js");
  let captured: any;
  registerReadTool({ registerTool(def: any) { captured = def; } } as any);
  return captured;
}

describe("delegated read adjustment boundary", () => {
  it("decorates adjusted metadata immutably and preserves clean identity", async () => {
    const readTool = await tool();
    const adjusted = await readTool.execute(
      "read-delegated-error",
      { path: "adjusted.png", offset: 0 },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );
    const clean = await readTool.execute(
      "read-clean-image",
      { path: "clean.png" },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(textOf(adjusted)).toBe(
      "[Read params adjusted: ignored offset 0]\n\nDelegated read failed.",
    );
    expect(adjusted.details.ptcValue.error).toBe(delegated.error);
    expect(adjusted.details.ptcValue.warnings).toEqual([
      expect.objectContaining({ code: "params-adjusted" }),
      delegated.warning,
    ]);
    expect(adjusted.details.ptcValue.warnings[1]).toBe(delegated.warning);
    expect(delegated.adjustedResult.details.ptcValue.error).toBe(delegated.error);
    expect(delegated.adjustedResult.details.ptcValue.warnings).toEqual([delegated.warning]);
    expect(delegated.adjustedResult.content[0].text).toBe("Delegated read failed.");

    expect(clean).toBe(delegated.cleanResult);
    expect(clean.content[0].text).toBe("Read image file [image/png]");
    expect(clean.details.ptcValue).toBeUndefined();
  });
});
