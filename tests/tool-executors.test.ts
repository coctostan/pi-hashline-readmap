import { describe, it, expect, vi } from "vitest";

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

describe("index.ts does not publish a side-channel executor map", () => {
  it("neither stashes executors on globalThis nor emits hashline:tool-executors", async () => {
    const pi = createMockPi();
    const { default: init } = await import("../index.js");
    init(pi as any);
    expect((globalThis as any).__hashlineToolExecutors).toBeUndefined();
    expect(pi.events.emit).not.toHaveBeenCalledWith("hashline:tool-executors", expect.anything());
  });
});
