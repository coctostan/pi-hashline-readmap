import { describe, it, expect } from "vitest";
import { isNuAvailable } from "../src/nu.js";

const nuAvailable = isNuAvailable();
const itIfNu = nuAvailable ? it : it.skip;

async function callNu(params: Record<string, unknown>) {
  const { registerNuTool } = await import("../src/nu.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  const tool = registerNuTool(mockPi as any);
  if (tool === false) return null;
  if (!captured) throw new Error("nu tool not registered");
  return captured.execute("tc", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

describe("nu ptcValue envelope", () => {
  itIfNu("ok:true and no error on successful command", async () => {
    const r = await callNu({ command: "echo 'hello'" });
    expect(r).not.toBeNull();
    const ptc = r!.details?.ptcValue;
    expect(ptc).toBeDefined();
    expect(ptc.tool).toBe("nu");
    expect(ptc.ok).toBe(true);
    expect(ptc.error).toBeUndefined();
    expect(r!.isError).toBeFalsy();
  });

  itIfNu("nu-non-zero-exit marks the tool result as an error", async () => {
    const r = await callNu({ command: 'error make {msg: "audit failure"}' });
    expect(r).not.toBeNull();
    const ptc = r!.details?.ptcValue;
    expect(ptc.tool).toBe("nu");
    expect(ptc.ok).toBe(false);
    expect(ptc.error?.code).toBe("nu-non-zero-exit");
    expect(typeof ptc.error?.message).toBe("string");
    expect(ptc.error?.message.length).toBeGreaterThan(0);
    expect(ptc.error?.details).toMatchObject({ exitCode: expect.any(Number) });
    expect(r!.isError).toBe(true);
  });
});
