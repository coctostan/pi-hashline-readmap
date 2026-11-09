import { afterEach, describe, expect, it, vi } from "vitest";
import { registerBashRendererTool } from "../src/bash-renderer.js";
import init from "../index.js";
import { gitLog } from "./helpers/git-log-fixture.js";

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
    expect(tool.description).toBe(EXPECTED_BASH_DESCRIPTION);
    expect(tool.promptSnippet).toBe("Bash for tests/builds/git/pkg/external CLIs and listing files. Don't use cat/head/tail, grep/rg, sed/awk/perl/python rewrites, or > heredocs/tee for repo files; use read/grep/edit/write.");
    expect(tool.promptGuidelines).toEqual([
      "Use bash for tests, builds, git, package managers, external CLIs, and listing files.",
      "Do not use bash cat/head/tail/grep/rg/sed/awk for repo files.",
      "Use read/grep/edit/write for repo file reads, searches and edits.",
    ]);
    expect(tool.parameters.properties.command.description).toBe("Test/build/git/pkg/external/listing command; not repo file read/search/edit.");
    expect(tool.parameters.properties.timeout.description).toBe("Timeout seconds");

    await tool.execute("call-1", { command: "npm test", timeout: 30 }, undefined, undefined, { cwd: "/tmp/project" });
    expect(execute).toHaveBeenCalledWith("call-1", { command: "npm test", timeout: 30 }, undefined, undefined, { cwd: "/tmp/project" });
  });
});

afterEach(() => vi.unstubAllEnvs());

const EXPECTED_BASH_DESCRIPTION = "Run tests, builds, git, package managers, external CLIs, and file listings; do not use for repo file reading/searching/editing (use read, grep, edit, or write). Scripts receive native raw output, exit_code, and native truncation/full_output_path; the model reads Pi's output with ANSI codes stripped plus any hint. Nonzero exits remain native values on structured-output hosts.";

function hookHarness() {
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
  const output = gitLog(25);
  return { output, truncated: true, full_output_path: "/tmp/native-full-output", exit_code: 0, wall_time_seconds: 0.01 };
}

it("advertises native raw Bash values explicitly", () => {
  const { tools } = hookHarness();
  if (tools.get("bash").description !== EXPECTED_BASH_DESCRIPTION) {
    throw new Error("Bash raw/presentation contract is not discoverable");
  }
  expect(tools.get("bash").description).toBe(EXPECTED_BASH_DESCRIPTION);
});

it.each([false, true])("presents Pi's text unchanged while preserving raw identity (nested=%s)", async nested => {
  const { emit } = hookHarness();
  const raw = rawLog();
  const changed = await emit("git log -25", raw, raw.output, nested);
  expect(changed.structuredContent).toBe(raw);
  expect(changed.content).toEqual([{ type: "text", text: raw.output }]);
  expect(raw.truncated).toBe(true);
  expect(raw.full_output_path).toBe("/tmp/native-full-output");
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
