import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import init from "../index.js";
import { buildContextHygieneMetadata, buildFileResource } from "../src/context-hygiene.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";

function createHarness() {
  const tools = new Map<string, any>();
  const handlers: Record<string, Function> = {};
  init({
    registerTool(def: any) { tools.set(def.name, def); },
    on(event: string, handler: Function) { handlers[event] = handler; },
    events: { emit() {}, on() {} },
  } as any);
  async function run(name: string, toolCallId: string, input: any) {
    const result = await tools.get(name).execute(toolCallId, input, new AbortController().signal, () => {}, { cwd: process.cwd() });
    await handlers.tool_result({ type: "tool_result", toolName: name, toolCallId, input, content: result.content, isError: result.isError === true, details: result.details });
    return result;
  }
  // A new turn: Pi runs the context handlers before the next model request.
  const nextTurn = () => handlers.context({ type: "context", messages: [] });
  return { run, handlers, nextTurn };
}

const lines = ["const one = 1;", "const two = 2;", "const three = 3;"];
const lineTwo = () => `2:${computeLineHash(2, lines[1])}`;

function fixtureFile(): string {
  const filePath = resolve(mkdtempSync(resolve(tmpdir(), "pi-freshness-expiry-")), "sample.ts");
  writeFileSync(filePath, lines.join("\n"), "utf-8");
  return filePath;
}

describe("freshness after the extension's own changes", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("keeps a file fresh after a write that shows its anchors", async () => {
    const { run, nextTurn } = createHarness();
    const filePath = fixtureFile();
    await run("read", "read-1", { path: filePath });
    await run("write", "write-1", { path: filePath, content: lines.join("\n") });
    await nextTurn();
    const edit = await run("edit", "edit-1", { path: filePath, edits: [{ set_line: { anchor: lineTwo(), new_text: "const two = 22;" } }] });
    expect(edit.details?.ptcValue).toMatchObject({ ok: true });
  });

  it("requires a fresh read after a write that shows no anchors", async () => {
    const { run, nextTurn } = createHarness();
    const filePath = fixtureFile();
    await run("read", "read-1", { path: filePath });
    // Over write's 2000-line anchor budget; line 2 keeps its text, so only the freshness guard can refuse.
    const content = [...lines, ...Array.from({ length: 2000 }, (_, i) => `// ${i}`)].join("\n");
    const write = await run("write", "write-1", { path: filePath, content });
    expect(write.details?.ptcValue?.lines).toEqual([]);
    await nextTurn();
    const edit = await run("edit", "edit-1", { path: filePath, edits: [{ set_line: { anchor: lineTwo(), new_text: "const two = 22;" } }] });
    expect(edit.details?.ptcValue).toMatchObject({ ok: false, error: { code: "file-not-read" } });
  });

  it("requires a fresh read after an edit that wrote but failed its post-edit verification", async () => {
    const { run, handlers, nextTurn } = createHarness();
    const filePath = fixtureFile();
    await run("read", "read-1", { path: filePath });
    // The result edit returns when the file it wrote reads back different (tests/edit-post-verify-mismatch.test.ts).
    await handlers.tool_result({
      type: "tool_result", toolName: "edit", toolCallId: "edit-verify", input: { path: filePath },
      content: [{ type: "text", text: "Edit write completed but post-edit verification did not confirm the intended content" }],
      isError: true,
      details: { contextHygiene: buildContextHygieneMetadata({ tool: "edit", classification: "mutation", resources: [buildFileResource(filePath)] }) },
    });
    await nextTurn();
    const edit = await run("edit", "edit-1", { path: filePath, edits: [{ set_line: { anchor: lineTwo(), new_text: "const two = 22;" } }] });
    expect(edit.details?.ptcValue).toMatchObject({ ok: false, error: { code: "file-not-read" } });
    expect(readFileSync(filePath, "utf-8")).not.toContain("22");
  });
});
