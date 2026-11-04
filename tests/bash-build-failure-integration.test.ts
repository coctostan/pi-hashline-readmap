import { describe, expect, it } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

async function loadToolResultHandler() {
  const modUrl = pathToFileURL(resolve(root, "index.ts")).href + `?issue-222=${Date.now()}`;
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
  return handlers.tool_result;
}

function bashEvent(
  toolCallId: string,
  command: string,
  text: string,
  isError: boolean,
) {
  return {
    type: "tool_result" as const,
    toolName: "bash",
    toolCallId,
    input: { command },
    content: [{ type: "text" as const, text }],
    isError,
    details: { existing: "kept" },
  };
}

describe("issue #222: Bash build failure integration", () => {
  it("records the process outcome while presenting the output as given", async () => {
    const handleToolResult = await loadToolResultHandler();

    const failedRaw = "\u001b[31mCompiling demo v0.1.0\nlinker terminated unexpectedly\u001b[0m\n";
    const failed = await handleToolResult(
      bashEvent("build-fail-positive-evidence", "cargo build", failedRaw, true),
    );

    expect(failed.content[0].text).toBe(
      "Compiling demo v0.1.0\nlinker terminated unexpectedly\n",
    );
    expect(failed.details.existing).toBe("kept");
    expect(failed.details.contextHygiene.commandState.outcome).toBe("failure");
    expect(Object.keys(failed.details).sort()).toEqual(["bashContextGuard", "bashOriginalOutput", "contextHygiene", "existing"]);

    const compilerError = "error TS5023: Unknown compiler option '--nonexistentflag'.\n\nCommand exited with code 1";
    const exactReproduction = await handleToolResult(
      bashEvent(
        "build-fail-ts5023",
        "./node_modules/.bin/tsc --nonexistentflag",
        compilerError,
        true,
      ),
    );

    expect(exactReproduction.content[0].text).toBe(compilerError);

    const uncertainRaw = "builder emitted an unfamiliar success message\n";
    const uncertain = await handleToolResult(
      bashEvent("build-low-confidence", "cargo build", uncertainRaw, false),
    );

    expect(uncertain.content[0].text).toContain("[Context hygiene]");
    expect(uncertain.content[0].text.endsWith(`---\n${uncertainRaw}`)).toBe(true);

    const successful = await handleToolResult(
      bashEvent(
        "build-success-positive-evidence",
        "cargo build",
        "Compiling demo v0.1.0\nFinished dev profile\n",
        false,
      ),
    );

    expect(successful.content[0].text).toContain("[Context hygiene]");
    expect(successful.content[0].text.endsWith("---\nCompiling demo v0.1.0\nFinished dev profile\n")).toBe(true);
    expect(successful.details.contextHygiene.commandState.outcome).toBe("success");
  });
});
