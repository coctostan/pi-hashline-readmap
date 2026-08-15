import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "node:child_process",
  );
  return {
    ...actual,
    execFileSync: vi.fn(() => Buffer.from("0.111.0\n")),
    spawn: spawnMock,
  };
});

import { registerNuTool } from "../src/nu.js";

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

describe("nu null parameters", () => {
  it("rejects null command before spawning and makes null timeout equivalent to omission", async () => {
    spawnMock.mockImplementation(() => {
      const process = new EventEmitter() as any;
      process.stdout = new EventEmitter();
      process.stderr = new EventEmitter();
      process.kill = vi.fn();
      queueMicrotask(() => {
        process.stdout.emit("data", Buffer.from("ok\n"));
        process.emit("close", 0);
      });
      return process;
    });

    const pi: any = { registerTool: vi.fn() };
    const tool = registerNuTool(pi);
    if (!tool) throw new Error("expected nu registration to succeed");
    expect(tool).not.toHaveProperty("constrainedSampling");

    const execute = (params: Record<string, unknown>) => tool.execute(
      "null-nu",
      params as any,
      undefined,
      undefined,
      { cwd: process.cwd() } as any,
    );

    const required = await execute({ command: null });
    expect(required).toMatchObject({
      isError: true,
      content: [{
        type: "text",
        text: "Invalid command: expected string, received null.",
      }],
      details: {
        ptcValue: {
          tool: "nu",
          ok: false,
          error: { code: "invalid-null" },
        },
      },
    });
    expect(spawnMock).not.toHaveBeenCalled();

    const omitted = await execute({ command: "echo ok" });
    const nulled = await execute({ command: "echo ok", timeout: null });
    expect(projection(nulled)).toEqual(projection(omitted));
  });
});
