import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
const host = resolve(process.argv[2]);
const version = JSON.parse(readFileSync(join(host, "package.json"), "utf8")).version;
assert.equal(version, "1.0.0", "selected codemode boundary host must be exactly 1.0.0");
const hostRequire = createRequire(join(host, "package.json"));
const coreManifest = hostRequire.resolve("@earendil-works/pi-agent-core/package.json");
assert.equal(JSON.parse(readFileSync(coreManifest, "utf8")).version, version);
const { runToolCall } = await import(pathToFileURL(join(dirname(coreManifest), "dist/agent-loop.js")));
const { discoverAndLoadExtensions, wrapRegisteredTool, ExtensionRunner, SessionManager } =
  await import(pathToFileURL(join(host, "dist/index.js")));
const { executeCodemode } = await import(pathToFileURL(join(host, "dist/extensions/codemode/execute.js")));
const { createCodemodeDescription } = await import(pathToFileURL(join(host, "dist/extensions/codemode/tool.js")));
const root = mkdtempSync(join(tmpdir(), "pi-262-host-boundary-"));
const cwd = join(root, "cwd");
const agentDir = join(root, "agent");
mkdirSync(cwd);
mkdirSync(agentDir);
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(1, 0);
header.writeUInt32BE(1, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0, 255]))), chunk("IEND", Buffer.alloc(0)),
]);
try {
  writeFileSync(join(cwd, "fixture.png"), png);
  writeFileSync(join(cwd, "magic.dat"), png);
  if (process.env.PI_CODEMODE_BASH === "1") {
    execFileSync("git", ["init", "-q", cwd]);
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(cwd, "seed.txt"), String(i));
      execFileSync("git", ["add", "seed.txt"], { cwd });
      execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.test",
        "commit", "-qm", "subject " + i, "-m", "detail ".repeat(80)], { cwd });
    }
  }
  const loaded = await discoverAndLoadExtensions([process.cwd()], cwd, agentDir);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  const extension = loaded.extensions[0];
  if (process.env.PI_COMPAT_REQUIRE_NU === "1") assert.ok(extension.tools.has("nu"));
  const sessionManager = SessionManager.inMemory(cwd);
  const runner = new ExtensionRunner(loaded.extensions, loaded.runtime, cwd, sessionManager, {});
  const handlerErrors = [];
  runner.onError((error) => handlerErrors.push(error));
  runner.bindCore({
    sendMessage() {}, sendUserMessage() {}, appendEntry() { return ""; }, setSessionName() {},
    getSessionName() { return ""; }, setLabel() {},
    getActiveTools: () => [...extension.tools.keys()], getAllTools: () => [...extension.tools.keys()],
    setActiveTools() {}, refreshTools() {}, getCommands: () => [], setModel: async () => true,
    getThinkingLevel: () => "off", setThinkingLevel() {},
  }, {
    getModel: () => undefined, getScopedModels: () => [], isIdle: () => true,
    isProjectTrusted: () => true, getSignal: () => undefined, abort() {},
    hasPendingMessages: () => false, shutdown() {}, getContextUsage: () => undefined,
    compact() {}, getSystemPrompt: () => "",
  });
  const tools = [...extension.tools.values()].map((registered) => wrapRegisteredTool(registered, runner));
  const declared = [...extension.tools.values()].map((registered) => registered.definition);
  if (process.env.PI_CODEMODE_DISCOVERY === "1") {
    const inline = createCodemodeDescription(declared, { inlineBudget: 3000 });
    const tick = String.fromCharCode(96);
    for (const name of ["read", "edit", "grep", "ast_search", "write", "find", "ls", "bash", ...(extension.tools.has("nu") ? ["nu"] : [])]) {
      assert.ok(inline.includes("### " + tick + name + tick), name + " must fit the default inline budget");
    }
  }
  let serial = 0;
  let compressed = false;
  async function invoke(name, args, nested = true, signal) {
    const id = "call-" + serial++;
    const call = { type: "toolCall", id, name, arguments: args };
    const parent = nested ? { parentToolCallId: "script" } : {};
    return runToolCall(call, {
      tools, signal, assistantMessage: { role: "assistant", content: [call] }, context: { messages: [], tools },
      beforeToolCall: ({ args }) => runner.emitToolCall({ type: "tool_call", toolName: name, toolCallId: id, input: args, ...parent }),
      afterToolCall: async ({ args, result, isError }) => {
        const override = await runner.emitToolResult({ type: "tool_result", toolName: name, toolCallId: id, input: args, ...result, isError, ...parent });
        if (name === "bash" && args.command === "git log -5") {
          assert.equal(override.structuredContent, result.structuredContent, "Bash raw object must survive hook by identity");
          assert.ok(override.content.some((c) => c.type === "text" && c.text.includes("[RTK:")));
          compressed = true;
        }
        return override;
      },
    });
  }
  if (process.env.PI_CODEMODE_DIRECT_IMAGE === "1") {
    const directImage = await invoke("read", { path: "fixture.png" }, false);
    assert.equal(directImage.isError, false);
    assert.ok(directImage.result.content.some(c => c.type === "image"));
    assert.equal(directImage.result.structuredContent.type, "image");
    assert.ok(!JSON.stringify(directImage.result.details ?? {}).includes(directImage.result.structuredContent.data));
  }
  if (process.env.PI_CODEMODE_VISIBLE === "1") {
    writeFileSync(join(cwd, "visible.ts"), "export const visible = 1;\n");
    const visible = await invoke("read", { path: "visible.ts" }, false);
    assert.equal(visible.isError, false);
  }
  const ctx = { cwd, tools: declared, sessionManager,
    executeTool: (name, args, options = {}) => invoke(name, args, true, options.signal) };
  const result = await executeCodemode("script", { code: process.env.PI_CODEMODE_CASE }, undefined, undefined, ctx, {});
  const textOf = value => value.content.filter(c => c.type === "text").map(c => c.text).join("\n");
  const scriptText = textOf(result);
  assert.ok(scriptText.includes("Script completed") && scriptText.includes("case=PASS"), scriptText);
  const outer = await runner.emitToolResult({ type: "tool_result", toolName: "codemode", toolCallId: "script",
    input: {}, ...result, isError: false });
  const staleNotice = textOf(outer ?? result).includes("[Stale read result");
  const duplicate = await runner.emitToolResult({ type: "tool_result", toolName: "codemode", toolCallId: "last",
    input: {}, content: [{ type: "text", text: "done" }], details: {}, isError: false });
  const duplicateNotice = !!duplicate && textOf(duplicate).includes("[Stale read result");
  assert.deepEqual(handlerErrors, []);
  console.log(JSON.stringify({
    version, host, completed: true,
    images: result.content.filter(c => c.type === "image").length,
    staleNotice, duplicateNotice, compressed,
  }));
} finally {
  rmSync(root, { recursive: true, force: true });
}
