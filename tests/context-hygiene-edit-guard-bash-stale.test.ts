import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import init from "../index.js";
import { computeLineHash } from "../src/hashline.js";

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
});
