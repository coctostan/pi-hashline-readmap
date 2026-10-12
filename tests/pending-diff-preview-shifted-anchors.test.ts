import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import init from "../index.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";
import { buildPendingEditPreviewData } from "../src/pending-diff-preview.js";
import { ServedLines } from "../src/served-lines.js";

beforeAll(async () => {
  await ensureHashInit();
});

const h = (text: string) => computeLineHash(1, text);

/** A served registry as the edit tool leaves it after a full read and its own line-shifting write. */
function servedAfterOwnWrite(path: string, before: string[], after: string[], lineMap: Array<number | undefined>) {
  const served = new ServedLines();
  served.record(path, before.map((raw, index) => ({ line: index + 1, hash: computeLineHash(index + 1, raw) })), true);
  served.remapAfterWrite(path, before, after, lineMap);
  return served;
}

describe("pending edit preview with anchors made stale by an earlier edit", () => {
  it("skips the preview for an ambiguous stale anchor instead of projecting it onto the wrong line", async () => {
    const dir = mkdtempSync(join(tmpdir(), "preview-shifted-"));
    const after = ["a", "x", "}", "}", "b", ""];
    writeFileSync(join(dir, "q.txt"), after.join("\n"), "utf8");
    const served = servedAfterOwnWrite(join(dir, "q.txt"), ["a", "}", "}", "b", ""], after, [1, 3, 4, 5, 6]);

    const preview = await buildPendingEditPreviewData(
      { path: "q.txt", edits: [{ set_line: { anchor: `3:${h("}")}`, new_text: "Z" } }] },
      dir,
      served,
    );

    expect(preview.type).toBe("skip");
  });

  it("previews a remappable stale anchor at the line execution will edit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "preview-shifted-"));
    const after = ["s", "x", "t", "}", "u", "}", ""];
    writeFileSync(join(dir, "r.txt"), after.join("\n"), "utf8");
    const served = servedAfterOwnWrite(join(dir, "r.txt"), ["s", "t", "}", "u", "}", ""], after, [1, 3, 4, 5, 6, 7]);

    const preview = await buildPendingEditPreviewData(
      { path: "r.txt", edits: [{ set_line: { anchor: `3:${h("}")}`, new_text: "Z" } }] },
      dir,
      served,
    );

    expect(preview.type).toBe("ok");
    if (preview.type !== "ok") return;
    expect(preview.data.nextContent).toBe("s\nx\nt\nZ\nu\n}\n");
  });

  it("edit renderCall does not preview the issue #271 stale anchor on the first brace", async () => {
    const dir = mkdtempSync(join(tmpdir(), "preview-shifted-session-"));
    writeFileSync(join(dir, "b.txt"), "a\n}\n}\nb\n", "utf8");
    const tools = new Map<string, any>();
    const handlers: Record<string, Function> = {};
    init({
      registerTool(definition: any) {
        tools.set(definition.name, definition);
      },
      on(event: string, handler: Function) {
        handlers[event] = handler;
      },
      events: { emit() {}, on() {} },
    } as any);
    let next = 0;
    async function call(name: string, params: Record<string, unknown>) {
      const tool = tools.get(name);
      const id = `call-${next++}`;
      const args = tool.prepareArguments ? tool.prepareArguments(params) : params;
      await handlers.tool_call?.({ type: "tool_call", toolName: name, toolCallId: id, input: args }, { cwd: dir });
      const result: any = await tool.execute(id, args, new AbortController().signal, undefined, { cwd: dir });
      await handlers.tool_result?.({ type: "tool_result", toolName: name, toolCallId: id, input: args, content: result.content, details: result.details, isError: result.isError === true }, { cwd: dir });
      return result;
    }

    await call("read", { path: "b.txt" });
    await call("edit", { path: "b.txt", edits: [{ insert_after: { anchor: `1:${h("a")}`, new_text: "x" } }] });

    const staleArgs = { path: "b.txt", edits: [{ set_line: { anchor: `3:${h("}")}`, new_text: "SECOND_BRACE_EDIT" } }] };
    const theme = { fg: (_style: string, text: string) => text, bold: (text: string) => text };
    const context: any = { argsComplete: true, executionStarted: false, cwd: dir, state: {}, invalidate: vi.fn(), lastComponent: undefined, expanded: true };
    const edit = tools.get("edit");
    const first = edit.renderCall(staleArgs, theme, context);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = edit.renderCall(staleArgs, theme, { ...context, lastComponent: first });
    const rendered = second?.text ?? second?.render?.(120)?.join("\n") ?? "";

    expect(rendered).not.toContain("SECOND_BRACE_EDIT");
    const executed = await call("edit", staleArgs);
    expect(executed.isError).toBe(true);
    expect(readFileSync(join(dir, "b.txt"), "utf8")).toBe("a\nx\n}\n}\nb\n");
  });
});
