import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
describe("public API ptc policy export", () => {
  it("re-exports the expanded policy contract from the package root without adding a prompt-assembler dependency", async () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    expect(pkg.exports).toEqual({ ".": "./index.ts" });
    expect(pkg.dependencies?.["pi-prompt-assembler"]).toBeUndefined();
    expect(pkg.peerDependencies?.["pi-prompt-assembler"]).toBeUndefined();
    const mod = await import(pathToFileURL(resolve(root, "index.ts")).href);
    expect(typeof mod.default).toBe("function");
    expect(mod.HASHLINE_TOOL_PTC_POLICY).toEqual(mod.getHashlineToolPtcPolicy());
    expect(mod.HASHLINE_TOOL_PTC_POLICY.tools.read.defaultExposure).toBe("safe-by-default");
    expect(mod.HASHLINE_TOOL_PTC_POLICY.tools.ls.defaultExposure).toBe("safe-by-default");
    expect(mod.HASHLINE_TOOL_PTC_POLICY.tools.find.defaultExposure).toBe("safe-by-default");
    expect(mod.HASHLINE_TOOL_PTC_POLICY.tools.ast_search.defaultExposure).toBe("opt-in");
    expect(mod.HASHLINE_TOOL_PTC_POLICY.tools.nu.defaultExposure).toBe("opt-in");
    expect(mod.HASHLINE_TOOL_PTC_POLICY.tools.edit.defaultExposure).toBe("not-safe-by-default");
  });
});

describe("executor map is covered by the exported policy", () => {
  it("every emitted executor tool (except debug-only) has a policy entry", async () => {
    const { default: init } = await import("../index.ts");
    const { HASHLINE_TOOL_PTC_POLICY } = await import("../src/ptc-tool-policy.ts");
    const emitted: Record<string, any>[] = [];
    const pi: any = {
      registeredTools: {} as Record<string, any>,
      registerTool(def: any) { this.registeredTools[def.name] = def; },
      on() {},
      events: { emit(_channel: string, payload: any) { emitted.push(payload); } },
    };
    init(pi);
    const map =
      (globalThis as any).__hashlineToolExecutors ??
      emitted[emitted.length - 1] ??
      {};
    // context_hygiene_report is a debug-only tool intentionally excluded from
    // the cross-extension ptc policy contract.
    const DEBUG_ONLY = new Set(["context_hygiene_report"]);
    const policyKeys = new Set(Object.keys(HASHLINE_TOOL_PTC_POLICY.tools));
    const uncovered = Object.keys(map).filter(
      (name) => !DEBUG_ONLY.has(name) && !policyKeys.has(name),
    );
    expect(uncovered).toEqual([]);
    // write specifically must be covered (the original drift).
    expect(policyKeys.has("write")).toBe(true);
  });
});