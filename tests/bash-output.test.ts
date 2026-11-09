import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import init from "../index.js";
import { presentBashOutput } from "../src/bash-output.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";

const ALL = ["read", "bash", "edit", "write", "grep", "find", "ls"];

describe("presentBashOutput", () => {
  it("returns Pi's text as given, ANSI stripped, for any command", () => {
    const log = Array.from({ length: 25 }, (_, i) => `commit ${i}\n\n    change ${i}`).join("\n");
    expect(presentBashOutput("git log -25", log, ALL)).toBe(log);
    expect(presentBashOutput("npm run build", "\x1b[31merror\x1b[0m TS2322\n", ALL)).toBe("error TS2322\n");
    expect(presentBashOutput("ls -la", "a\nb\n", ALL)).toBe("a\nb\n");
  });

  it("appends the anti-pattern hint after a blank line", () => {
    expect(presentBashOutput("rg foo", "src/a.ts:1:foo", ALL)).toBe(
      "src/a.ts:1:foo\n\n[Hint: Prefer the grep tool for content search.]",
    );
    expect(presentBashOutput("find . -name '*.ts'", "./a.ts", ALL)).toBe(
      "./a.ts\n\n[Hint: Prefer the dedicated file-search tools for repository discovery.]",
    );
  });

  it("appends no hint naming an inactive tool", () => {
    const active = ALL.filter((name) => name !== "grep" && name !== "find");
    expect(presentBashOutput("rg foo", "src/a.ts:1:foo", active)).toBe("src/a.ts:1:foo");
    expect(presentBashOutput("find . -name '*.ts'", "./a.ts", active)).toBe("./a.ts");
  });

  it("returns the hint alone on empty text", () => {
    expect(presentBashOutput("rg foo", "", ALL)).toBe("[Hint: Prefer the grep tool for content search.]");
    expect(presentBashOutput("echo", "", ALL)).toBe("");
  });
});

describe("bash grep anchors in the tool_result handler", () => {
  afterEach(() => vi.unstubAllEnvs());

  function harness(switchOn: boolean) {
    vi.stubEnv("PI_HASHLINE_BASH_GREP_ANCHORS", switchOn ? "1" : "0");
    const tools: Record<string, any> = {};
    const handlers: Record<string, Function> = {};
    init({
      registerTool(def: any) { tools[def.name] = def; },
      on(name: string, fn: Function) { handlers[name] = fn; },
      events: { emit() {}, on() {} },
      getActiveTools: () => ["read", "bash", "edit", "write"],
    } as any);
    const cwd = mkdtempSync(join(tmpdir(), "bash-grep-handler-"));
    writeFileSync(join(cwd, "a.ts"), "alpha()\nbeta()\n");
    const raw = { output: "a.ts:2:beta()\n", exit_code: 0 };
    const emit = (nested = false, text = "a.ts:2:beta()\n") => handlers.tool_result({
      toolName: "bash", toolCallId: "grep-1", input: { command: "grep -rn beta ." },
      ...(nested ? { parentToolCallId: "script" } : {}),
      content: [{ type: "text", text }], structuredContent: raw, details: {}, isError: false,
    }, { cwd });
    return { tools, cwd, raw, emit };
  }

  it("anchors matching lines for the model alone, and edit takes the anchor", async () => {
    await ensureHashInit();
    const { tools, cwd, raw, emit } = harness(true);
    const hash = computeLineHash(2, "beta()");
    const result = emit();
    expect(result.content).toEqual([{ type: "text", text: `a.ts:2:${hash}|beta()\n` }]);
    expect(result.structuredContent).toBe(raw);
    expect(Object.keys(result.details)).toEqual(["contextHygiene"]);
    const edited = await tools.edit.execute("edit-1", { path: "a.ts", edits: [{ set_line: { anchor: `2:${hash}`, new_text: "gamma()" } }] }, undefined, undefined, { cwd });
    expect(edited.isError).not.toBe(true);
    expect(readFileSync(join(cwd, "a.ts"), "utf8")).toBe("alpha()\ngamma()\n");
  });

  it("records the anchored rows, so edit refuses a range over a shown line changed since", async () => {
    await ensureHashInit();
    const { tools, cwd, emit } = harness(true);
    writeFileSync(join(cwd, "a.ts"), "alpha()\nbeta()\ngamma()\n");
    emit(false, "a.ts:1:alpha()\na.ts:2:beta()\na.ts:3:gamma()\n");
    writeFileSync(join(cwd, "a.ts"), "alpha()\nBETA()\ngamma()\n");
    const range = { start_anchor: `1:${computeLineHash(1, "alpha()")}`, end_anchor: `3:${computeLineHash(3, "gamma()")}`, new_text: "x" };
    const edited = await tools.edit.execute("edit-2", { path: "a.ts", edits: [{ replace_lines: range }] }, undefined, undefined, { cwd });
    expect(edited.isError).toBe(true);
    expect(readFileSync(join(cwd, "a.ts"), "utf8")).toBe("alpha()\nBETA()\ngamma()\n");
  });

  it("changes nothing with the switch off or for a nested call", async () => {
    await ensureHashInit();
    expect(harness(false).emit().content).toEqual([{ type: "text", text: "a.ts:2:beta()\n" }]);
    expect(harness(true).emit(true).content).toEqual([{ type: "text", text: "a.ts:2:beta()\n" }]);
  });
});
