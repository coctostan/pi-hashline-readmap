import { describe, it, expect } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function makeEvent(toolName: string, toolCallId: string, input: Record<string, unknown>, text: string) {
  return {
    type: "tool_result" as const,
    toolName,
    toolCallId,
    input,
    content: [{ type: "text" as const, text }],
    isError: false,
    details: undefined,
  };
}
describe("bash filter integration", () => {
  it("tool_result handler is registered and only modifies bash results", async () => {
    const mod = await import(pathToFileURL(resolve(root, "index.ts")).href);
    const handlers: Record<string, Function> = {};
    const mockPi = {
      registerTool() {},
      on(event: string, handler: Function) {
        handlers[event] = handler;
      },
    };

    mod.default(mockPi as any);

    expect(handlers["tool_result"]).toBeDefined();

    // Non-bash tools must be untouched (AC17: read, grep, edit, sg)
    const hashlineText = "1:ab|some hashline content";

    expect(await handlers["tool_result"](makeEvent("read", "t-read", { path: "foo.ts" }, hashlineText))).toBeUndefined();
    expect(await handlers["tool_result"](makeEvent("grep", "t-grep", { pattern: "x" }, hashlineText))).toBeUndefined();
    expect(await handlers["tool_result"](makeEvent("edit", "t-edit", { path: "foo.ts" }, hashlineText))).toBeUndefined();
    expect(await handlers["tool_result"](makeEvent("sg", "t-sg", { pattern: "$X" }, hashlineText))).toBeUndefined();
    // Bash is compressed (at least ANSI-stripped)
    const bashEvent = makeEvent("bash", "t-bash", { command: "echo hello" }, "\x1b[32mhello\x1b[0m");
    const result = await handlers["tool_result"](bashEvent);
    expect(result).toBeDefined();
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("hello");
  });
});
