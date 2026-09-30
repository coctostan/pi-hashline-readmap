import { EventEmitter } from "node:events";
import { afterEach, it, expect, vi } from "vitest";
const mode = vi.hoisted(() => ({ value: "success" }));
vi.mock("node:child_process", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:child_process")>(),
  execFileSync: vi.fn(() => Buffer.from("0.114.1\n")),
  spawn: vi.fn(() => {
    if (mode.value === "spawn") throw new Error("audit spawn failure");
    const proc: any = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = vi.fn(() => { queueMicrotask(() => proc.emit("close", null)); return true; });
    if (mode.value !== "timeout") queueMicrotask(() => {
      proc.stdout.emit("data", Buffer.from("audit output"));
      proc.emit("close", mode.value === "exit" ? 7 : 0);
    });
    return proc;
  }),
}));
vi.mock("node:fs", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs")>(),
  writeFileSync: vi.fn(() => { if (mode.value === "temp") throw new Error("audit temp failure"); }),
  unlinkSync: vi.fn(),
}));
import { registerNuTool } from "../src/nu.js";
afterEach(() => vi.useRealTimers());
it("marks Nu failures consistently with the PTC envelope on every execution branch", async () => {
  vi.useFakeTimers();
  let tool: any;
  registerNuTool({ registerTool(def: any) { tool = def; } } as any);
  for (const [kind, code] of [
    ["exit", "nu-non-zero-exit"], ["timeout", "nu-timed-out"],
    ["temp", "nu-temp-file-error"], ["spawn", "nu-spawn-error"], ["success", undefined],
  ] as const) {
    mode.value = kind;
    const promise = tool.execute(`nu-${kind}`, { command: "error make {msg: 'audit failure'}", timeout: 1 }, undefined, undefined, { cwd: process.cwd() });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result.details.ptcValue.error?.code).toBe(code);
    expect(result.details.ptcValue.ok).toBe(kind === "success");
    expect(result.isError).toBe(kind !== "success");
    if (kind !== "success") {
      const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };
      const component = tool.renderResult(result, {}, theme, {});
      const rendered = component.text ?? component.render(80).join("\n");
      expect(rendered).not.toContain("lines returned");
      expect(rendered).not.toContain("line returned");
    }
  }
});
