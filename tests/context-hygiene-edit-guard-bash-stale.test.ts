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

  const lines = ["const one = 1;", "const two = 2;", "const three = 3;"];
  // Each bash change keeps line 3's text, so only the freshness guard can refuse the old anchor.
  // No `context` event fires between bash and edit, as in one batch: the bash result alone must expire.
  it.each([
    { name: "a file known only from write, after cd", known: "write", command: (dir: string) => `cd ${dir} && sed -i '1i x' sample.ts`, isError: false },
    { name: "a file known only from write, inside a subshell", known: "write", command: (dir: string) => `(sed -i '1i x' ${dir}/sample.ts)`, isError: false },
    { name: "a file known only from write, after a here-string", known: "write", command: (dir: string) => `cat <<< x > ${dir}/sample.ts`, isError: false },
    { name: "a file known from write and edit, after a redirect", known: "edit", command: (dir: string) => `printf x > ${dir}/sample.ts`, isError: false },
    { name: "a read file, after a failed redirect", known: "read", command: (dir: string) => `printf x > ${dir}/sample.ts; false`, isError: true },
  ])("requires a fresh read after bash changes $name", async ({ known, command, isError }) => {
    const { tools, handlers } = createHarness();
    const filePath = fixtureFile();
    const dir = resolve(filePath, "..");
    if (known === "read") await recordRead(tools, handlers, filePath, "read-1");
    else await run(tools, handlers, "write", "write-1", { path: filePath, content: lines.join("\n") });
    if (known === "edit") {
      const first = await run(tools, handlers, "edit", "edit-1", { path: filePath, edits: [{ set_line: { anchor: `1:${computeLineHash(1, lines[0])}`, new_text: "const one = 11;" } }] });
      expect(first.details?.ptcValue).toMatchObject({ ok: true });
    }

    writeFileSync(filePath, ["x", ...lines].join("\n"), "utf-8");
    await handlers.tool_result({ type: "tool_result", toolName: "bash", toolCallId: "bash-change", input: { command: command(dir) }, content: [{ type: "text", text: "" }], isError, details: {} });
    const edit = await run(tools, handlers, "edit", "edit-after-bash", { path: filePath, edits: [{ set_line: { anchor: `3:${computeLineHash(3, lines[2])}`, new_text: "const three = 33;" } }] });
    expect(edit.details?.ptcValue).toMatchObject({ ok: false, error: { code: "file-not-read" } });
    expect(readFileSync(filePath, "utf-8")).not.toContain("33");
  });
});
