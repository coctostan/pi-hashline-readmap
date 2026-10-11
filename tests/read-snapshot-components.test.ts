import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const race = vi.hoisted(() => ({ calls: 0, hasSymbol: true, replacement: "" }));
vi.mock("../src/map-cache.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../src/map-cache.js")>();
  return {
    ...actual,
    async getOrGenerateMap(path: string, ...args: unknown[]) {
      race.calls++;
      const { writeFile } = await import("node:fs/promises");
      if (!race.hasSymbol && race.calls === 1) await writeFile(path, race.replacement);
      const result = await Reflect.apply(actual.getOrGenerateMap, actual, [path, ...args]);
      if (race.hasSymbol && race.calls === 1) await writeFile(path, race.replacement);
      return result;
    },
  };
});
import { registerReadTool } from "../src/read.js";
import { withCodemodeIntegration } from "../src/codemode-integration.js";
import { computeLineHash } from "../src/hashline.js";
import { clearMapCache } from "../src/map-cache.js";

const dirs: string[] = [];
afterEach(() => {
  clearMapCache();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
it("uses one captured map for every component of a read response", async () => {
  const before = "function snapshotBefore() { return 1; }\nexport function target() {\n  return snapshotBefore();\n}\n";
  const after = "// padding\n".repeat(80) + "function snapshotAfter() { return 2; }\nexport function target() { return snapshotAfter(); }\n";
  const requests = [
    { symbol: "target", map: true },
    { symbol: "target", map: true, strictSymbol: true },
    { symbol: "target", bundle: "local", map: true },
    { symbol: "target", bundle: "local", map: true, limit: 1, strictSymbol: true },
    { map: true },
    {},
  ];
  for (const request of requests) {
    const cwd = mkdtempSync(join(tmpdir(), "read-snapshot-components-"));
    dirs.push(cwd);
    const source = Object.keys(request).length === 0 ? before + "// padding\n".repeat(2100) : before;
    writeFileSync(join(cwd, "source.ts"), source);
    race.calls = 0;
    race.hasSymbol = "symbol" in request;
    race.replacement = after;
    let tool: any;
    registerReadTool(withCodemodeIntegration({ registerTool(t: any) { tool = t; } } as any));
    const result = await tool.execute("components", { path: "source.ts", ...request }, undefined, undefined, { cwd });
    expect(result.isError).not.toBe(true);
    if (race.hasSymbol && race.calls !== 1) throw new Error("read acquired a second map for the same symbol snapshot");
    const r = result.structuredContent;
    expect(r.map.appended).toBe(true);
    expect(r.text).not.toContain("snapshotAfter");
    expect(r.text).toContain("snapshotBefore");
    expect(r.text).not.toContain("pi-readmap-snapshot-");
    if ("bundle" in request) {
      const support = r.bundle.localSupport[0];
      expect(support.name).toBe("snapshotBefore");
      expect(support.lineAnchors).toEqual([`1:${computeLineHash(1, before.split("\n")[0])}`]);
    }
    if ("limit" in request) {
      expect(r.lines).toHaveLength(1);
      expect(r.continuation.nextOffset).toBe(3);
    }
  }
});
