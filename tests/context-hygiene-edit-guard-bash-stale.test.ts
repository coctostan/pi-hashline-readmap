import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import init from "../index.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";

function createHarness() {
  const tools = new Map<string, any>();
  const handlers: Record<string, Function> = {};

  init({
    registerTool(def: any) {
      tools.set(def.name, def);
    },
    on(event: string, handler: Function) {
      handlers[event] = handler;
    },
    events: { emit() {}, on() {} },
  } as any);

  return { tools, handlers };
}

function fixtureFile(): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-bash-edit-guard-"));
  const filePath = resolve(dir, "sample.ts");
  writeFileSync(filePath, ["const one = 1;", "const two = 2;", "const three = 3;"].join("\n"), "utf-8");
  return filePath;
}

async function recordRead(tools: Map<string, any>, handlers: Record<string, Function>, filePath: string, toolCallId: string) {
  const readResult = await tools.get("read").execute(
    toolCallId,
    { path: filePath },
    new AbortController().signal,
    () => {},
    { cwd: process.cwd() },
  );
  expect(readResult.isError).not.toBe(true);
  await handlers.tool_result({
    type: "tool_result",
    toolName: "read",
    toolCallId,
    input: { path: filePath },
    content: readResult.content,
    isError: false,
    details: readResult.details,
  });
  return readResult;
}

describe("edit guard after bash shell-file mutation", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("requires a fresh read before immediate edit with pre-bash anchors", async () => {
    const { tools, handlers } = createHarness();
    const filePath = fixtureFile();
    const oldLineTwoAnchor = `2:${computeLineHash(2, "const two = 2;")}`;

    await recordRead(tools, handlers, filePath, "read-before-bash");

    writeFileSync(filePath, ["const one = 10;", "const two = 2;", "const three = 3;"].join("\n"), "utf-8");
    await handlers.tool_result({
      type: "tool_result",
      toolName: "bash",
      toolCallId: "bash-mutation",
      input: { command: `printf 'const one = 10;\\nconst two = 2;\\nconst three = 3;' > ${filePath}` },
      content: [{ type: "text", text: "" }],
      isError: false,
      details: {},
    });

    const immediateEdit = await tools.get("edit").execute(
      "edit-after-bash",
      { path: filePath, edits: [{ set_line: { anchor: oldLineTwoAnchor, new_text: "const two = 22;" } }] },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(immediateEdit.details?.ptcValue).toMatchObject({
      ok: false,
      error: { code: "file-not-read" },
    });
    expect(immediateEdit.content?.[0]?.text).toContain("You must get fresh anchors");

    await recordRead(tools, handlers, filePath, "read-after-bash");
    const editAfterFreshRead = await tools.get("edit").execute(
      "edit-after-fresh-read",
      { path: filePath, edits: [{ set_line: { anchor: oldLineTwoAnchor, new_text: "const two = 22;" } }] },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(editAfterFreshRead.details?.ptcValue).toMatchObject({ ok: true });
    expect(readFileSync(filePath, "utf-8")).toContain("const two = 22;");
  });

  it("does not invalidate edit guard state after targetless bash output", async () => {
    const { tools, handlers } = createHarness();
    const filePath = fixtureFile();
    const oldLineTwoAnchor = `2:${computeLineHash(2, "const two = 2;")}`;

    await recordRead(tools, handlers, filePath, "read-before-targetless-bash");
    await handlers.tool_result({
      type: "tool_result",
      toolName: "bash",
      toolCallId: "targetless-bash",
      input: { command: "pwd" },
      content: [{ type: "text", text: process.cwd() }],
      isError: false,
      details: {},
    });

    const editAfterTargetlessBash = await tools.get("edit").execute(
      "edit-after-targetless-bash",
      { path: filePath, edits: [{ set_line: { anchor: oldLineTwoAnchor, new_text: "const two = 22;" } }] },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(editAfterTargetlessBash.details?.ptcValue).toMatchObject({ ok: true });
    expect(readFileSync(filePath, "utf-8")).toContain("const two = 22;");
  });

  async function run(tools: Map<string, any>, handlers: Record<string, Function>, name: string, toolCallId: string, input: any) {
    const result = await tools.get(name).execute(toolCallId, input, new AbortController().signal, () => {}, { cwd: process.cwd() });
    await handlers.tool_result({ type: "tool_result", toolName: name, toolCallId, input, content: result.content, isError: result.isError === true, details: result.details });
    return result;
  }

  async function bashMutation(handlers: Record<string, Function>, filePath: string, content: string[], command: string) {
    writeFileSync(filePath, content.join("\n"), "utf-8");
    await handlers.tool_result({ type: "tool_result", toolName: "bash", toolCallId: "bash-mutation", input: { command }, content: [{ type: "text", text: "" }], isError: false, details: {} });
  }

  it("requires a fresh read after bash changes a file known only from write (no prior read)", async () => {
    const { tools, handlers } = createHarness();
    const filePath = fixtureFile();
    await run(tools, handlers, "write", "write-1", { path: filePath, content: "const one = 1;\nconst two = 2;\nconst three = 3;" });
    await bashMutation(handlers, filePath, ["outside", "const one = 1;", "const two = 2;", "const three = 3;"], `sed -i '1i outside' ${filePath}`);
    handlers.context({ type: "context", messages: [] });

    const edit = await run(tools, handlers, "edit", "edit-after-sed", { path: filePath, edits: [{ set_line: { anchor: `3:${computeLineHash(3, "const three = 3;")}`, new_text: "const three = 33;" } }] });

    expect(edit.details?.ptcValue).toMatchObject({ ok: false, error: { code: "file-not-read" } });
    expect(readFileSync(filePath, "utf-8")).not.toContain("33");
  });

  it("requires a fresh read after bash overwrites a file the agent wrote and edited", async () => {
    const { tools, handlers } = createHarness();
    const filePath = fixtureFile();
    await run(tools, handlers, "write", "write-1", { path: filePath, content: "const one = 1;\nconst two = 2;\nconst three = 3;" });
    const first = await run(tools, handlers, "edit", "edit-1", { path: filePath, edits: [{ set_line: { anchor: `1:${computeLineHash(1, "const one = 1;")}`, new_text: "const one = 11;" } }] });
    expect(first.details?.ptcValue).toMatchObject({ ok: true });
    await bashMutation(handlers, filePath, ["const one = 11;", "const two = 2;", "const three = 3;", ""], `printf 'const one = 11;\\nconst two = 2;\\nconst three = 3;\\n' > ${filePath}`);
    handlers.context({ type: "context", messages: [] });

    const edit = await run(tools, handlers, "edit", "edit-after-printf", { path: filePath, edits: [{ set_line: { anchor: `2:${computeLineHash(2, "const two = 2;")}`, new_text: "const two = 22;" } }] });

    expect(edit.details?.ptcValue).toMatchObject({ ok: false, error: { code: "file-not-read" } });
  });
});
