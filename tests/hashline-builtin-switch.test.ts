import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentSession, DefaultResourceLoader, SessionManager } from "@earendil-works/pi-coding-agent";
import { registerFauxProvider } from "@earendil-works/pi-ai/compat";

// PI_HASHLINE_BUILTIN, observed at the locked host's real createAgentSession boundary.
async function session(builtin: string | undefined) {
  if (builtin === undefined) vi.stubEnv("PI_HASHLINE_BUILTIN", undefined as unknown as string);
  else vi.stubEnv("PI_HASHLINE_BUILTIN", builtin);
  // A scratch cwd and agent dir, so no project or user extension adds tools.
  const agentDir = mkdtempSync(join(tmpdir(), "hashline-builtin-switch-"));
  const cwd = agentDir;
  const faux = registerFauxProvider({ models: [{ id: "hashline-builtin-switch" }] });
  const { default: extensionFactory } = await import("../index.js");
  const resourceLoader = new DefaultResourceLoader({
    cwd, agentDir, extensionFactories: [extensionFactory],
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  });
  await resourceLoader.reload();
  const created = await createAgentSession({
    cwd, agentDir, model: faux.getModel(), resourceLoader, sessionManager: SessionManager.inMemory(cwd),
  });
  const s = created.session;
  const close = () => { s.dispose(); faux.unregister(); rmSync(agentDir, { recursive: true, force: true }); };
  const errors = resourceLoader.getExtensions().errors;
  return { s, errors, close };
}

function owners(s: Awaited<ReturnType<typeof session>>["s"]) {
  const byName = Object.fromEntries(s.getAllTools().map((tool) => [tool.name, tool.sourceInfo]));
  const owner = (name: string) => (byName[name] === undefined ? "missing" : byName[name].source === "builtin" ? "pi" : byName[name].path === "<inline:1>" ? "hashline" : `other ${byName[name].path}`);
  return { read: owner("read"), edit: owner("edit"), write: owner("write"), grep: owner("grep") };
}

describe("PI_HASHLINE_BUILTIN leaves Pi's built-ins in place", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  for (const [builtin, expected] of [
    [undefined, { read: "hashline", edit: "hashline", write: "hashline", grep: "hashline" }],
    ["", { read: "hashline", edit: "hashline", write: "hashline", grep: "hashline" }],
    ["edit,write", { read: "hashline", edit: "pi", write: "pi", grep: "hashline" }],
    ["read", { read: "pi", edit: "hashline", write: "hashline", grep: "hashline" }],
  ] as const) {
    it(`declares ${JSON.stringify(expected)} with PI_HASHLINE_BUILTIN=${JSON.stringify(builtin)}`, async () => {
      const { s, errors, close } = await session(builtin);
      try {
        expect(errors).toEqual([]);
        expect(s.getActiveToolNames()).toEqual(expect.arrayContaining(["read", "edit", "write", "grep"]));
        expect(owners(s)).toEqual(expected);
      } finally {
        close();
      }
    }, 20_000);
  }

  it("refuses an unknown name at load, naming the accepted ones, and loads none of Hashline's tools", async () => {
    const { s, errors, close } = await session("grep");
    try {
      expect(errors).toHaveLength(1);
      expect(errors[0].error).toMatch(/PI_HASHLINE_BUILTIN.*"grep".*read, edit, write/);
      expect(owners(s)).toEqual({ read: "pi", edit: "pi", write: "pi", grep: "pi" });
      expect(s.getAllTools().filter((tool) => tool.sourceInfo.path === "<inline:1>").map((tool) => tool.name)).toEqual([]);
    } finally {
      close();
    }
  }, 20_000);
});
