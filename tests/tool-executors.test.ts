import { describe, it, expect, vi, beforeEach } from "vitest";

function createMockPi() {
  return {
    registerTool: vi.fn(),
    events: { emit: vi.fn(), on: vi.fn() },
    on: vi.fn(),
  };
}

describe("register functions return tool definitions", () => {
  it("registerReadTool returns a tool with name, execute, description, parameters", async () => {
    const { registerReadTool } = await import("../src/read.js");
    const pi = createMockPi();
    const tool = registerReadTool(pi as any);
    expect(tool).toBeDefined();
    expect(tool.name).toBe("read");
    expect(typeof tool.execute).toBe("function");
    expect(typeof tool.description).toBe("string");
    expect(tool.parameters).toBeDefined();
  });

  it("registerEditTool returns a tool with name, execute, description, parameters", async () => {
    const { registerEditTool } = await import("../src/edit.js");
    const pi = createMockPi();
    const tool = registerEditTool(pi as any);
    expect(tool).toBeDefined();
    expect(tool.name).toBe("edit");
    expect(typeof tool.execute).toBe("function");
    expect(typeof tool.description).toBe("string");
    expect(tool.parameters).toBeDefined();
    expect(tool.renderShell).toBe("default");
  });

  it("registerGrepTool returns a tool with name, execute, description, parameters", async () => {
    const { registerGrepTool } = await import("../src/grep.js");
    const pi = createMockPi();
    const tool = registerGrepTool(pi as any);
    expect(tool).toBeDefined();
    expect(tool.name).toBe("grep");
    expect(typeof tool.execute).toBe("function");
    expect(typeof tool.description).toBe("string");
    expect(tool.parameters).toBeDefined();
  });

  it("registerSgTool returns a tool with name, execute, description, parameters", async () => {
    const { registerSgTool } = await import("../src/sg.js");
    const pi = createMockPi();
    const tool = registerSgTool(pi as any);
    expect(tool).toBeDefined();
    expect(tool.name).toBe("ast_search");
    expect(typeof tool.execute).toBe("function");
    expect(typeof tool.description).toBe("string");
    expect(tool.parameters).toBeDefined();
  });

  it("pi.registerTool is still called for each tool", async () => {
    const pi = createMockPi();

    const { registerReadTool } = await import("../src/read.js");
    const { registerEditTool } = await import("../src/edit.js");
    const { registerGrepTool } = await import("../src/grep.js");
    const { registerSgTool } = await import("../src/sg.js");

    registerReadTool(pi as any);
    registerEditTool(pi as any);
    registerGrepTool(pi as any);
    registerSgTool(pi as any);

    expect(pi.registerTool).toHaveBeenCalledTimes(4);
  });
});

describe("index.ts emits and stashes tool executors", () => {
  beforeEach(() => {
    delete (globalThis as any).__hashlineToolExecutors;
  });

  it("stashes executors on globalThis.__hashlineToolExecutors", async () => {
    const pi = createMockPi();
    const { default: init } = await import("../index.js");
    init(pi as any);
    const stash = (globalThis as any).__hashlineToolExecutors;
    expect(stash).toBeDefined();
    expect(stash.read).toBeDefined();
    expect(stash.edit).toBeDefined();
    expect(stash.grep).toBeDefined();
    expect(stash.ast_search).toBeDefined();
    expect(stash.write).toBeDefined();
    expect(stash.ls).toBeDefined();
    expect(stash.find).toBeDefined();
  });
  it("emits on hashline:tool-executors channel", async () => {
    const pi = createMockPi();
    const { default: init } = await import("../index.js");
    init(pi as any);
    expect(pi.events.emit).toHaveBeenCalledWith(
      "hashline:tool-executors",
      expect.objectContaining({
        read: expect.objectContaining({ name: "read" }),
        edit: expect.objectContaining({ name: "edit" }),
        grep: expect.objectContaining({ name: "grep" }),
        ast_search: expect.objectContaining({ name: "ast_search" }),
        write: expect.objectContaining({ name: "write" }),
        ls: expect.objectContaining({ name: "ls" }),
        find: expect.objectContaining({ name: "find" }),
      })
    );
  });
  it("all stashed tools have callable execute functions", async () => {
    const pi = createMockPi();
    const { default: init } = await import("../index.js");
    init(pi as any);
    const stash = (globalThis as any).__hashlineToolExecutors;
    for (const key of ["read", "edit", "grep", "ast_search", "write", "ls", "find"]) {
      expect(typeof stash[key].execute).toBe("function");
    }
  });
  it("emitted payload includes full tool definitions with description and parameters", async () => {
    const pi = createMockPi();
    const { default: init } = await import("../index.js");
    init(pi as any);
    const payload = pi.events.emit.mock.calls.find(
      (c: any[]) => c[0] === "hashline:tool-executors"
    )?.[1] as Record<string, any>;
    expect(payload).toBeDefined();
    for (const key of ["read", "edit", "grep", "ast_search", "write", "ls", "find"]) {
      expect(typeof payload[key].description).toBe("string");
      expect(payload[key].parameters).toBeDefined();
      expect(typeof payload[key].execute).toBe("function");
    }
  });
});
