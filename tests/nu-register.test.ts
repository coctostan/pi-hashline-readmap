import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { NU_GUIDELINES } from "../src/nu.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("NU_GUIDELINES", () => {
  const allText = NU_GUIDELINES.join("\n");
  const nuPrompt = readFileSync(resolve(__dirname, "../prompts/nu.md"), "utf-8");

  it("keeps provider-visible guidance compact and nu-specific", () => {
    expect(allText).toContain("nu");
    expect(allText.length).toBeLessThanOrEqual(500);
  });

  it("keeps detailed routing and syntax examples in prompts/nu.md", () => {
    expect(nuPrompt).toContain("bash");
    expect(nuPrompt).toContain("ls");
    expect(nuPrompt).toContain("where");
    expect(nuPrompt).toContain("sort-by");
    expect(nuPrompt).toContain("open");
    expect(nuPrompt).toContain("get");
    expect(nuPrompt).toContain("plugin list");
    expect(nuPrompt).toContain("plugins");
    expect(nuPrompt).toContain("length");
    expect(nuPrompt).toContain("math sum");
    expect(nuPrompt).toContain("group-by");
    expect(nuPrompt).toContain("first");
    expect(nuPrompt).toContain("tests");
    expect(nuPrompt).toContain("package.json");
  });
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("node:child_process");
});

describe("registerNuTool", () => {
  it("returns the registered tool definition when nushell is available", async () => {
    vi.resetModules();
    vi.doMock("node:child_process", async () => {
      const actual = await vi.importActual<any>("node:child_process");
      return {
        ...actual,
        execFileSync: vi.fn(() => Buffer.from("0.111.0\n")),
      };
    });
    const { registerNuTool } = await import("../src/nu.js");
    const pi = { registerTool: vi.fn() };
    const tool = registerNuTool(pi as any);
    expect(tool).toMatchObject({
      name: "nu",
      label: "nushell",
    });
    expect(pi.registerTool).toHaveBeenCalledWith(tool);
  });

  it("returns false without calling pi.registerTool when nushell is unavailable", async () => {
    vi.resetModules();
    vi.doMock("node:child_process", async () => {
      const actual = await vi.importActual<any>("node:child_process");
      return {
        ...actual,
        execFileSync: vi.fn(() => {
          throw new Error("nu missing");
        }),
      };
    });

    const { registerNuTool } = await import("../src/nu.js");
    const pi = { registerTool: vi.fn() };

    expect(registerNuTool(pi as any)).toBe(false);
    expect(pi.registerTool).not.toHaveBeenCalled();
  });
});
