import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import init from "../index.js";
import { selectCompatHost } from "../scripts/pi-compat-host.mjs";

/**
 * Runs real codemode scripts from the selected Pi host against Hashline tools: the locked host,
 * or the install PI_COMPAT_HOST selects.
 */
const { host, version: hostVersion } = selectCompatHost();
const executorPath = join(host, "dist/extensions/codemode/execute.js");
if (process.env.PI_COMPAT_HOST && !existsSync(executorPath)) {
  throw new Error("Explicit compatibility host has no codemode executor");
}

function registerHashlineTools() {
  const tools = new Map<string, any>();
  init({
    registerTool(definition: any) {
      tools.set(definition.name, definition);
    },
    on() {},
    events: { emit() {}, on() {} },
  } as any);
  return tools;
}

describe.skipIf(!existsSync(executorPath))(`Pi ${hostVersion} codemode scripts`, () => {
  it("receive structured Hashline values and can chain grep anchors into edit", async () => {
    const { executeCodemode } = await import(pathToFileURL(executorPath).href);
    const cwd = mkdtempSync(join(tmpdir(), "pi-host-codemode-"));
    writeFileSync(join(cwd, "a.ts"), "const a = 1; // TODO\nconst b = 2;\n", "utf8");
    const registered = registerHashlineTools();
    let nextId = 0;
    const ctx = {
      cwd,
      tools: [...registered.values()],
      sessionManager: { getBranch: () => [] },
      async executeTool(name: string, args: Record<string, unknown>, options: { signal?: AbortSignal } = {}) {
        const id = `script/${nextId++}`;
        const tool = registered.get(name);
        const prepared = tool.prepareArguments ? tool.prepareArguments(args) : args;
        const result = await tool.execute(id, prepared, options.signal, undefined, { cwd });
        return { toolCall: { id, name, arguments: args }, result, isError: result.isError === true };
      },
    };
    const code = `
const g = await tools.grep({ pattern: "TODO", path: "a.ts", literal: true });
const hit = g.records.find((r) => r.kind === "match");
const e = await tools.edit({ path: "a.ts", edits: [{ set_line: { anchor: hit.anchor, new_text: hit.raw.replace(" // TODO", "") } }] });
const r = await tools.read({ path: "a.ts" });
let missing = "resolved";
try { await tools.read({ path: "missing.ts" }); } catch (err) { missing = "rejected"; }
return JSON.stringify({ raw: hit.raw, ok: e.ok, first: r.lines[0].raw, hasText: typeof r.text === "string", missing });
`;
    const result = await executeCodemode("script", { code }, undefined, undefined, ctx, {});
    const text = result.content.filter((item: any) => item.type === "text").map((item: any) => item.text).join("\n");
    expect(text, text).toContain("Script completed");
    expect(text, text).toContain("{");
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    expect(json).toEqual({ raw: "const a = 1; // TODO", ok: true, first: "const a = 1;", hasText: true, missing: "rejected" });
    expect(readFileSync(join(cwd, "a.ts"), "utf8")).toBe("const a = 1;\nconst b = 2;\n");
  }, 60_000);
});
