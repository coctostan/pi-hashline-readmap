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


async function loadHandlers(tag: string) {
  const modUrl = pathToFileURL(resolve(root, "index.ts")).href + `?bash-output=${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const handlers: Record<string, Function> = {};
  const mockPi = {
    registerTool() {},
    on(event: string, handler: Function) {
      handlers[event] = handler;
    },
    events: { emit() {}, on() {} },
  };

  const mod = await import(modUrl);
  mod.default(mockPi as any);
  return handlers;
}

describe("bash output integration", () => {
  it("tool_result handler is registered and only modifies bash results", async () => {
    const handlers = await loadHandlers("registration");

    expect(handlers["tool_result"]).toBeDefined();

    const hashlineText = "1:ab|some hashline content";

    expect(await handlers["tool_result"](makeEvent("read", "t-read", { path: "foo.ts" }, hashlineText))).toBeUndefined();
    expect(await handlers["tool_result"](makeEvent("grep", "t-grep", { pattern: "x" }, hashlineText))).toBeUndefined();
    expect(await handlers["tool_result"](makeEvent("edit", "t-edit", { path: "foo.ts" }, hashlineText))).toBeUndefined();
    expect(await handlers["tool_result"](makeEvent("ast_search", "t-ast", { pattern: "$X" }, hashlineText))).toBeUndefined();

    const bashEvent = makeEvent("bash", "t-bash", { command: "echo hello" }, "\x1b[32mhello\x1b[0m");

    const result = await handlers["tool_result"](bashEvent);
    expect(result).toBeDefined();
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("hello");
  });

  it.each([
    [
      "git diff --stat",
      "src/a.ts | 10 +++++-----\n1 file changed, 5 insertions(+), 5 deletions(-)\n",
      "src/a.ts | 10 +++++-----\n1 file changed, 5 insertions(+), 5 deletions(-)\n",
    ],
    ["git diff --name-only", "src/a.ts\nsrc/b.ts\n", "src/a.ts\nsrc/b.ts\n"],
    ["eslint --version", "\x1b[32mv9.0.0\x1b[0m\n", "v9.0.0\n"],
    ["printf 'eslint config\\n'", "eslint config\n", "eslint config\n"],
    [
      "cat eslint.config.js",
      "export default [{ rules: {} }];\n",
      "export default [{ rules: {} }];\n\n\n[Hint: Prefer the read tool for file contents.]",
    ],
  ])("preserves semantic output for %s", async (command, input, expected) => {
    const handlers = await loadHandlers("preserve");

    const result = await handlers["tool_result"](makeEvent("bash", `preserve-${command}`, { command }, input));

    expect(result.content[0].text).toBe(expected);
  });


  it("omits removed RTK metadata while preserving existing details", async () => {
    const handlers = await loadHandlers("metadata");

    const result = await handlers["tool_result"]({
      ...makeEvent("bash", "metadata", { command: "echo hello" }, "hello\n"),
      details: { existing: "keep", ptcValue: { existingPtc: "keep" } },
    });

    expect(result.details.existing).toBe("keep");
    expect(result.details.ptcValue).toEqual({ existingPtc: "keep" });
    expect(result.details).not.toHaveProperty("compressionInfo");
    expect(result.details).not.toHaveProperty("rtkCompaction");
  });
});
