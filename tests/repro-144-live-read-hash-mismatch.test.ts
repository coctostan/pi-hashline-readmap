import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { computeLineHash } from "../src/hashline.js";
import init from "../index.js";

function getTextContent(result: any): string {
  return result.content?.find((item: any) => item.type === "text")?.text ?? "";
}

function createHarness() {
  const tools: Record<string, any> = {};
  const handlers: Record<string, Function> = {};
  init({
    registerTool(def: any) { tools[def.name] = def; },
    on(event: string, handler: Function) { handlers[event] = handler; },
    events: { emit() {}, on() {} },
  } as any);
  return { tools, handlers };
}

describe("issue 144 — live-read hash-mismatch path is unchanged", () => {
  it("rejects with '>>>' annotated context, NOT with 'must get fresh anchors', when the read was live", async () => {

    const dir = mkdtempSync(resolve(tmpdir(), "pi-issue-144-mismatch-"));
    const filePath = resolve(dir, "small.ts");
    writeFileSync(filePath, ["alpha", "beta", "gamma", "delta", "epsilon"].join("\n") + "\n", "utf-8");

    const { tools, handlers } = createHarness();

    // 1. Live read — feeds tracker.
    const readResult = await tools.read.execute(
      "read-1", { path: filePath },
      new AbortController().signal, () => {}, { cwd: process.cwd() },
    );
    await handlers.tool_result({
      toolName: "read", toolCallId: "read-1", input: { path: filePath },
      content: readResult.content, isError: false, details: readResult.details,
    }, {});

    // 2. No mutation, no context-handler turn — supply an anchor whose line and
    //    hash do not match any line in the file (and are not findable via
    //    adaptive relocation). This must reach applyHashlineEdits, not the
    //    read-before-edit guard.
    //    We use line 1 with a hash for a content string that is nowhere in the
    //    file ("nope-not-here") so no relocation candidate exists.
    const unmatchableHash = computeLineHash(1, "nope-not-here");
    const result = await tools.edit.execute(
      "edit-1",
      { path: filePath, edits: [{ set_line: { anchor: `1:${unmatchableHash}`, new_text: "REPLACED" } }] },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).toBe(true);
    const text = getTextContent(result);
    expect(text).toContain("changed since last read");
    expect(text).toContain(">>>");
    expect(text).not.toContain("You must get fresh anchors");
    expect(readFileSync(filePath, "utf-8"))
      .toBe(["alpha", "beta", "gamma", "delta", "epsilon"].join("\n") + "\n");
  });
});
