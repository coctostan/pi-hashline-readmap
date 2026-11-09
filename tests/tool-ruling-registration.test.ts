import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentSession, DefaultResourceLoader, SessionManager } from "@earendil-works/pi-coding-agent";
import { registerFauxProvider } from "@earendil-works/pi-ai/compat";

// Rulings 0008 (`ls` and `find` deferred, `grep` kept) and 0009 (anchored bash grep dropped),
// observed at the real createAgentSession boundary.
async function session(tools?: string[]) {
  // A scratch cwd and agent dir, so no project or user extension adds tools.
  const agentDir = mkdtempSync(join(tmpdir(), "tool-ruling-registration-"));
  const cwd = agentDir;
  const faux = registerFauxProvider({ models: [{ id: "tool-ruling-registration" }] });
  const { default: extensionFactory } = await import("../index.js");
  const resourceLoader = new DefaultResourceLoader({
    cwd, agentDir, extensionFactories: [extensionFactory],
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  });
  await resourceLoader.reload();
  const created = await createAgentSession({
    cwd, agentDir, model: faux.getModel(), resourceLoader, sessionManager: SessionManager.inMemory(cwd),
    ...(tools ? { tools } : {}),
  });
  const s = created.session;
  const close = () => { s.dispose(); faux.unregister(); rmSync(agentDir, { recursive: true, force: true }); };
  return { s, close };
}

describe("tools register as ruled", () => {
  afterEach(() => vi.resetModules());

  it("declares grep by default and defers ls and find: registered, callable from codemode, searchable", async () => {
    const { s, close } = await session();
    try {
      const active = s.getActiveToolNames();
      expect(active).toEqual(expect.arrayContaining(["read", "bash", "edit", "write", "grep"]));
      expect(active).not.toContain("ls");
      expect(active).not.toContain("find");
      const exposure = Object.fromEntries(s.getAllTools().map((tool) => [tool.name, tool.exposure]));
      expect({ ls: exposure.ls, find: exposure.find, grep: exposure.grep }).toEqual({ ls: "deferred", find: "deferred", grep: "direct" });
      expect(s.getCallableToolNames()).toEqual(expect.arrayContaining(["ls", "find", "grep"]));
    } finally {
      close();
    }
  }, 20_000);

  it("activates a deferred tool named in the tool selection", async () => {
    const { s, close } = await session(["+ls"]);
    try {
      expect(s.getActiveToolNames()).toContain("ls");
      expect(s.getActiveToolNames()).not.toContain("find");
    } finally {
      close();
    }
  }, 20_000);

  it("leaves no active tool's provider-visible text naming an inactive ls or find", async () => {
    const { s, close } = await session();
    try {
      const active = new Set(s.getActiveToolNames());
      const offenders: string[] = [];
      for (const name of active) {
        const tool = s.getToolDefinition(name) as { description?: string; promptSnippet?: string; promptGuidelines?: string[]; parameters?: unknown } | undefined;
        const text = [tool?.description, tool?.promptSnippet, ...(tool?.promptGuidelines ?? []), JSON.stringify(tool?.parameters ?? {})].join("\n");
        for (const inactive of ["ls", "find"]) {
          if (new RegExp(`\\b${inactive}\\b`).test(text)) offenders.push(`${name} names ${inactive}`);
        }
      }
      expect(offenders).toEqual([]);
    } finally {
      close();
    }
  }, 20_000);

  it("points read on a directory at ls only while ls is active", async () => {
    const { default: init } = await import("../index.js");
    const readOn = async (active: string[]) => {
      const tools: Record<string, any> = {};
      init({ registerTool(def: any) { tools[def.name] = def; }, on() {}, events: { emit() {}, on() {} }, getActiveTools: () => active } as any);
      const result = await tools.read.execute("read-1", { path: "src" }, undefined, undefined, { cwd: join(__dirname, "..") });
      return { text: result.content[0].text, hint: result.details.ptcValue.error.hint };
    };
    expect(await readOn(["read", "bash"])).toEqual({ text: "Path is a directory: src. Use bash ls to inspect directories.", hint: 'Use ls("src") to inspect directories.' });
    expect((await readOn(["read", "bash", "ls"])).text).toBe("Path is a directory: src. Use ls to inspect directories.");
  });

  it("ships no anchored bash grep", () => {
    expect(existsSync(join(__dirname, "../src/bash-grep-anchors.ts"))).toBe(false);
  });
});
