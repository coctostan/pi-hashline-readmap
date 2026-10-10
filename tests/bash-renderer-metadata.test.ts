import { afterEach, describe, expect, it, vi } from "vitest";
import { registerBashRendererTool } from "../src/bash-renderer.js";
import init from "../index.js";

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
    expect(tool.description).toBe("Run tests, builds, git, package managers, and external CLIs; do not use for repo file reading/searching/listing/editing (use read, grep, find, ls, edit, or write). Scripts receive native raw output, exit_code, and native truncation/full_output_path; RTK and context-budget compression affect model presentation only. PI_RTK_BYPASS=1 bypasses RTK, not native output limits. Nonzero exits remain native values on structured-output hosts.");
    expect(tool.promptSnippet).toBe("Bash only for tests/builds/git/pkg/external CLIs. Don't use cat/head/tail, grep/rg, find/ls/tree, sed/awk/perl/python rewrites, or > heredocs/tee for repo files; use read/grep/find/ls/edit/write.");
    expect(tool.promptGuidelines).toEqual([
      "Use bash for tests, builds, git, package managers, and external CLIs.",
      "Do not use bash cat/head/tail/grep/rg/find/ls/tree/sed/awk for repo files.",
      "Use read/grep/find/ls/edit/write for repo file operations.",
    ]);
    expect(tool.parameters.properties.command.description).toBe("Test/build/git/pkg/external command; not repo file read/search/list/edit.");
    expect(tool.parameters.properties.timeout.description).toBe("Timeout seconds");

    await tool.execute("call-1", { command: "npm test", timeout: 30 }, undefined, undefined, { cwd: "/tmp/project" });
    expect(execute).toHaveBeenCalledWith("call-1", { command: "npm test", timeout: 30 }, undefined, undefined, { cwd: "/tmp/project" });
  });
});

afterEach(() => vi.unstubAllEnvs());

const EXPECTED_BASH_DESCRIPTION = "Run tests, builds, git, package managers, and external CLIs; do not use for repo file reading/searching/listing/editing (use read, grep, find, ls, edit, or write). Scripts receive native raw output, exit_code, and native truncation/full_output_path; RTK and context-budget compression affect model presentation only. PI_RTK_BYPASS=1 bypasses RTK, not native output limits. Nonzero exits remain native values on structured-output hosts.";

function hookHarness() {
  vi.stubEnv("PI_HASHLINE_BASH_CONTEXT_GUARD", "0");
  const tools = new Map<string, any>();
  const handlers: Record<string, Function> = {};
  init({ registerTool(t: any) { tools.set(t.name, t); }, on(n: string, h: Function) { handlers[n] = h; },
    events: { emit() {}, on() {} } } as any);
  const emit = async (command: string, structuredContent: any, text: string, nested: boolean, isError = false) =>
    handlers.tool_result({ type: "tool_result", toolName: "bash", toolCallId: command,
      ...(nested ? { parentToolCallId: "script" } : {}), input: { command },
      content: [{ type: "text", text }], structuredContent, details: {}, isError }, { cwd: process.cwd() });
  return { tools, emit };
}
function rawLog() {
  const output = Array.from({ length: 5 }, (_, i) =>
    "commit " + String(i).repeat(40) + "\nAuthor: Example <example@example.test>\nDate: Mon Jan 1 00:00:00 2024 +0000\n\n    subject " + i + "\n\n    " + "detail ".repeat(50) + "\n").join("\n");
  return { output, truncated: true, full_output_path: "/tmp/native-full-output", exit_code: 0, wall_time_seconds: 0.01 };
}

it("advertises native raw Bash values explicitly", () => {
  const { tools } = hookHarness();
  if (tools.get("bash").description !== EXPECTED_BASH_DESCRIPTION) {
    throw new Error("Bash raw/presentation contract is not discoverable");
  }
  expect(tools.get("bash").description).toBe(EXPECTED_BASH_DESCRIPTION);
});

it.each([false, true])("compresses presentation while preserving raw identity (nested=%s)", async nested => {
  const { emit } = hookHarness();
  const raw = rawLog();
  const changed = await emit("git log -5", raw, raw.output, nested);
  expect(changed.structuredContent).toBe(raw);
  expect(changed.structuredContent.output).toBe(raw.output);
  expect(changed.content[0].text).toContain("[RTK:");
  expect(changed.content[0].text.length).toBeLessThan(raw.output.length);
  expect(raw.truncated).toBe(true);
  expect(raw.full_output_path).toBe("/tmp/native-full-output");
});

it.each([false, true])("bypasses RTK without replacing raw data (nested=%s)", async nested => {
  const { emit } = hookHarness();
  const raw = rawLog();
  const bypass = await emit("PI_RTK_BYPASS=1 git log -5", raw, raw.output, nested);
  expect(bypass.structuredContent).toBe(raw);
  expect(bypass.content[0].text).not.toContain("[RTK:");
});

it("preserves native nonzero exit values", async () => {
  const { emit } = hookHarness();
  const raw = { output: "diagnostic\n", truncated: false, exit_code: 7, wall_time_seconds: 0 };
  expect((await emit("printf diagnostic; exit 7", raw, raw.output, true)).structuredContent).toBe(raw);
});

it("does not fabricate legacy structured output", async () => {
  const { emit } = hookHarness();
  expect((await emit("printf diagnostic", undefined, "diagnostic", true)).structuredContent).toBeUndefined();
});

it("does not fabricate structured output for aborts", async () => {
  const { emit } = hookHarness();
  expect((await emit("git log -5", undefined, "Command aborted", true, true)).structuredContent).toBeUndefined();
});
