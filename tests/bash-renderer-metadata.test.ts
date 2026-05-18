import { describe, expect, it, vi } from "vitest";
import { registerBashRendererTool } from "../src/bash-renderer.js";

function capturePi() {
  let registered: any;
  return {
    pi: {
      registerTool: vi.fn((tool: any) => {
        registered = tool;
      }),
    },
    get tool() {
      return registered;
    },
  };
}

describe("bash renderer provider-visible metadata", () => {
  it("uses compact local metadata and still delegates execution", async () => {
    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const createBuiltInBashTool = vi.fn(() => ({
      description: "VERBOSE BUILTIN BASH DESCRIPTION THAT SHOULD NOT BE PROVIDER VISIBLE",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "VERBOSE BUILTIN COMMAND PARAMETER DESCRIPTION" },
        },
      },
      execute,
    }));
    const captured = capturePi();

    const tool = registerBashRendererTool(captured.pi as any, {
      cwd: "/tmp/project",
      createBuiltInBashTool,
    });

    expect(captured.tool).toBe(tool);
    expect(tool.description).toBe("Run tests, builds, git, package managers, and external CLIs; do not use for repo file reading/searching/listing/editing (use read, grep, find, ls, edit, or write).");
    expect(tool.promptSnippet).toBe("Bash only for tests/builds/git/pkg/external CLIs. Don't use cat/head/tail, grep/rg, find/ls/tree, sed/awk/perl/python rewrites, or > heredocs/tee for repo files; use read/grep/find/ls/edit/write.");
    expect(tool.promptGuidelines).toEqual([
      "Use bash for tests, builds, git, package managers, and external CLIs.",
      "Do not use bash cat/head/tail/grep/rg/find/ls/tree/sed/awk for repo files.",
      "Use read/grep/find/ls/edit/write for repo file operations.",
    ]);
    expect(tool.parameters.properties.command.description).toBe("Test/build/git/pkg/external command; not repo file read/search/list/edit.");
    expect(tool.parameters.properties.timeout.description).toBe("Timeout seconds");

    await tool.execute("call-1", { command: "npm test", timeout: 30 }, undefined, undefined, { cwd: "/tmp/project" });
    expect(execute).toHaveBeenCalledWith("call-1", { command: "npm test", timeout: 30 }, undefined, undefined);
  });
});
