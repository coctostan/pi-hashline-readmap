import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const failure = vi.hoisted(() => ({ staged: [] as string[], enabled: true }));
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    async writeFile(path: any, ...args: any[]) {
      if (String(path).includes("pi-readmap-snapshot-") && failure.enabled) {
        failure.staged.push(String(path));
        throw new Error("injected snapshot write failure");
      }
      return Reflect.apply(actual.writeFile, actual, [path, ...args]);
    },
  };
});
import { registerReadTool } from "../src/read.js";
import { withCodemodeIntegration } from "../src/codemode-integration.js";
import { clearMapCache } from "../src/map-cache.js";

const dirs: string[] = [];
afterEach(() => {
  clearMapCache();
  failure.enabled = true;
  failure.staged = [];
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
it("refuses failed snapshot acquisition without serving an edit baseline", async () => {
  for (const strictSymbol of [false, true]) {
    const cwd = mkdtempSync(join(tmpdir(), "read-snapshot-failure-"));
    dirs.push(cwd);
    writeFileSync(join(cwd, "source.ts"), "export function target() { return 1; }\n");
    const onSuccessfulRead = vi.fn();
    let tool: any;
    registerReadTool(withCodemodeIntegration({ registerTool(t: any) { tool = t; } } as any), { onSuccessfulRead });
    const result = await tool.execute("failure", {
      path: "source.ts", symbol: "target", strictSymbol, errorMode: "value",
    }, undefined, undefined, { cwd }).catch(() => ({ isError: false }));
    if (!result.isError) throw new Error("snapshot acquisition did not produce a coded refusal");
    expect(result.structuredContent).toMatchObject({
      tool: "read", ok: false, error: { code: "read-snapshot-unavailable" },
    });
    expect(result.structuredContent.lines).toBeUndefined();
    expect(onSuccessfulRead).not.toHaveBeenCalled();
    expect(failure.staged.length).toBeGreaterThan(0);
    for (const path of failure.staged.splice(0)) expect(existsSync(dirname(path))).toBe(false);
    failure.enabled = false;
    const control = await tool.execute("control", { path: "source.ts", symbol: "target", strictSymbol }, undefined, undefined, { cwd });
    expect(control.isError).not.toBe(true);
    expect(onSuccessfulRead).toHaveBeenCalledTimes(1);
    failure.enabled = true;
  }
});
