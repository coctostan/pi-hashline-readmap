import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import { registerBashRendererTool } from "../src/bash-renderer.js";

const theme = { fg: (_: string, text: string) => text, bold: (text: string) => text };
function textOf(component: any): string { return component?.text ?? component?.render?.(80)?.join("\n") ?? ""; }

describe("bash renderer wrapper", () => {
  it("delegates native bash with intact execution context", async () => {
    const ctx: any = {
      cwd: process.cwd(),
      model: { provider: "anthropic", id: "claude-test-model" },
      sessionManager: { getSessionId: () => "session-test", getSessionFile: () => undefined },
      thinkingLevel: "high",
    };
    const native = createBashTool(ctx.cwd);
    const execute = vi.fn(native.execute.bind(native));
    const createBuiltIn = vi.fn(() => ({ ...native, execute }));
    let registered: any;
    registerBashRendererTool({ registerTool(def: any) { registered = def; } } as any, {
      createBuiltInBashTool: createBuiltIn, cwd: ctx.cwd,
    });
    const params = { command: "echo PI_MODEL=$PI_MODEL" };
    const direct = await (native.execute as any)("direct", params, undefined, undefined, ctx);
    const result = await registered.execute("call-1", params, undefined, undefined, ctx);
    const text = (r: any) => r.content.find((c: any) => c.type === "text")?.text.trim();
    expect(text(direct)).toBe("PI_MODEL=claude-test-model");
    expect(text(result)).toBe(text(direct));
    expect(createBuiltIn).toHaveBeenCalledWith(ctx.cwd, { shellPath: undefined });
    expect(execute).toHaveBeenCalledWith("call-1", params, undefined, undefined, ctx);
    expect(textOf(registered.renderCall({ command: "npm test" }, theme))).toBe("bash npm test");
    expect(textOf(registered.renderResult({ content: [{ type: "text", text: "ok\n" }] }, {}, theme, {}))).toBe("↳ 1 line returned\nok");
    expect(textOf(registered.renderResult({ content: [{ type: "text", text: "" }] }, {}, theme, {}))).toBe("↳ command completed (no output)");
  });

  it("keeps renderResult diagnostics clean for intentionally unused theme", () => {
    const source = readFileSync(new URL("../src/bash-renderer.ts", import.meta.url), "utf8");
    expect(source).not.toContain("renderResult(result: any, optionsArg: any, theme: any");
  });

  it("uses compact local metadata instead of forwarding verbose built-in metadata", () => {
    const params = { type: "object", properties: { command: { type: "string" } }, required: ["command"] };
    const builtIn = { name: "bash", label: "bash", description: "real bash description", parameters: params, execute: async () => ({ content: [{ type: "text", text: "" }] }) };
    let registered: any;
    registerBashRendererTool({ registerTool(def: any) { registered = def; } } as any, { createBuiltInBashTool: () => builtIn, cwd: "/tmp/work" });
    expect(registered.description).toBe("Run tests, builds, git, package managers, and external CLIs; do not use for repo file reading/searching/listing/editing (use read, grep, find, ls, edit, or write).");
    expect(registered.promptSnippet).toBe("Bash only for tests/builds/git/pkg/external CLIs. Don't use cat/head/tail, grep/rg, find/ls/tree, sed/awk/perl/python rewrites, or > heredocs/tee for repo files; use read/grep/find/ls/edit/write.");
    expect(registered.promptGuidelines).toEqual([
      "Use bash for tests, builds, git, package managers, and external CLIs.",
      "Do not use bash cat/head/tail/grep/rg/find/ls/tree/sed/awk for repo files.",
      "Use read/grep/find/ls/edit/write for repo file operations.",
    ]);
    expect(registered.parameters.properties.command.description).toBe("Test/build/git/pkg/external command; not repo file read/search/list/edit.");
  });
});
