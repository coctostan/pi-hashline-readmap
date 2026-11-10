import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { selectCompatHost } from "../scripts/pi-compat-host.mjs";

it("rejects required nulls through the real selected host pipeline", () => {
  const { host, version } = selectCompatHost();
  const source = String.raw`
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const host = process.env.PI_TEST_HOST;
const version = JSON.parse(readFileSync(join(host, "package.json"), "utf8")).version;
const lockedVersion = JSON.parse(readFileSync("package-lock.json", "utf8")).packages["node_modules/@earendil-works/pi-coding-agent"].version;
if (!process.env.PI_COMPAT_HOST) assert.equal(version, lockedVersion, "the locked host must match package-lock.json");

// Resolve agent-core through its declared "./package.json" export, not a bare specifier: its "."
// export has only "types"/"import" conditions, so a bare require/resolve throws
// ERR_PACKAGE_PATH_NOT_EXPORTED. Root the lookup at the selected host (not repo-local resolution)
// so a hoisted or nested agent-core is found either way.
const hostRequire = createRequire(join(host, "package.json"));
const coreManifest = hostRequire.resolve("@earendil-works/pi-agent-core/package.json");
const coreRoot = dirname(coreManifest);
const coreVersion = JSON.parse(readFileSync(coreManifest, "utf8")).version;
assert.equal(coreVersion, version, "agent-core must come from the selected host installation");
const { discoverAndLoadExtensions, wrapRegisteredTool, ExtensionRunner, SessionManager } = await import(pathToFileURL(join(host, "dist/index.js")));
// runToolCall is the real prepareToolCallArguments -> validateToolArguments -> beforeToolCall ->
// execute -> afterToolCall sequence; no substitute validator.
const { runToolCall } = await import(pathToFileURL(join(coreRoot, "dist/agent-loop.js")));

const root = mkdtempSync(join(tmpdir(), "pi-258-null-pipeline-"));
const cwd = join(root, "cwd");
const agentDir = join(root, "agent");
mkdirSync(cwd);
mkdirSync(agentDir);
try {
  // Load the checkout's source explicitly: a repo dist/ (npm ci runs prepare) must not be tested instead.
  const loaded = await discoverAndLoadExtensions([resolve(process.cwd(), "index.ts")], cwd, agentDir);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  const extension = loaded.extensions[0];
  for (const name of ["read", "write", "edit", "grep", "ast_search", "find", "ls", "bash"]) {
    assert.ok(extension.tools.has(name), name + " must register");
  }
  if (process.env.PI_COMPAT_REQUIRE_NU === "1") assert.ok(extension.tools.has("nu"), "Nu must register when PI_COMPAT_REQUIRE_NU=1");
  for (const event of ["tool_call", "tool_result", "context"]) assert.ok(extension.handlers.get(event)?.length, event + " must register");
  const runner = new ExtensionRunner(loaded.extensions, loaded.runtime, cwd, SessionManager.inMemory(cwd), {});
  const handlerErrors = [];
  runner.onError((error) => handlerErrors.push(error));
  // wrapRegisteredTool's execute() diffs runner.getActiveTools() before/after every call (to
  // surface tools an execution newly registers), and that accessor throws "Extension runtime not
  // initialized" until bindCore supplies it. Production wires this from AgentSession
  // (agent-session.js: runner.bindCore({ getActiveTools: () => this.getActiveToolNames(), ... },
  // { getModel: () => this.model, ... })); this is the minimal stand-in with no model/provider/UI.
  runner.bindCore(
    {
      sendMessage: () => {},
      sendUserMessage: () => {},
      appendEntry: () => "",
      setSessionName: () => {},
      getSessionName: () => "",
      setLabel: () => {},
      getActiveTools: () => [...extension.tools.keys()],
      getAllTools: () => [...extension.tools.keys()],
      setActiveTools: () => {},
      refreshTools: () => {},
      getCommands: () => [],
      setModel: async () => true,
      getThinkingLevel: () => "off",
      setThinkingLevel: () => {},
    },
    {
      getModel: () => undefined,
      getScopedModels: () => [],
      isIdle: () => true,
      isProjectTrusted: () => true,
      getSignal: () => undefined,
      abort: () => {},
      hasPendingMessages: () => false,
      shutdown: () => {},
      getContextUsage: () => undefined,
      compact: () => {},
      getSystemPrompt: () => "",
    },
  );
  const executions = new Map();
  const tools = [...extension.tools.values()].map((registered) => {
    const wrapped = wrapRegisteredTool(registered, runner);
    return {
      ...wrapped,
      execute(...args) {
        executions.set(wrapped.name, (executions.get(wrapped.name) ?? 0) + 1);
        return wrapped.execute(...args);
      },
    };
  });
  let nextId = 0;
  let beforeCount = 0;
  let afterCount = 0;
  let beforeArgs;
  let afterArgs;
  async function invoke(name, args) {
    const call = { type: "toolCall", id: "case-" + nextId++, name, arguments: args };
    return runToolCall(call, {
      tools,
      assistantMessage: { role: "assistant", content: [call] },
      context: { messages: [], tools },
      beforeToolCall: ({ args }) => {
        beforeCount++;
        beforeArgs = args;
        return runner.emitToolCall({ type: "tool_call", toolName: name, toolCallId: call.id, input: args });
      },
      afterToolCall: ({ args, result, isError }) => {
        afterCount++;
        afterArgs = args;
        return runner.emitToolResult({ type: "tool_result", toolName: name, toolCallId: call.id, input: args, ...result, isError });
      },
    });
  }
  function assertRejected(outcome, parameter, expectedType = "string") {
    assert.equal(outcome.isError, true, "host pipeline must reject required null " + parameter);
    assert.deepEqual(outcome.result.content, [{ type: "text", text: "Invalid " + parameter + ": expected " + expectedType + ", received null." }]);
  }
  const read = tools.find((tool) => tool.name === "read");
  const direct = await read.execute("direct-null", { path: null });
  assert.equal(direct.isError, true);
  assert.equal(direct.details.ptcValue.error.code, "invalid-null");
  executions.clear();

  writeFileSync(join(cwd, "null"), "sentinel\n");
  const rawRead = { path: null };
  const readOutcome = await invoke("read", rawRead);
  writeFileSync(join(cwd, "victim.txt"), "KEEP\n");
  const contentOutcome = await invoke("write", { path: "victim.txt", content: null });
  rmSync(join(cwd, "null"));
  const pathOutcome = await invoke("write", { path: null, content: "unintended\n" });
  assert.equal(readOutcome.isError, true, "host pipeline must reject required null path before reading a file named null");
  assertRejected(readOutcome, "path");
  assertRejected(contentOutcome, "content");
  assertRejected(pathOutcome, "path");
  assert.deepEqual(rawRead, { path: null });
  assert.equal(readFileSync(join(cwd, "victim.txt"), "utf8"), "KEEP\n", "invalid write must leave existing data unchanged");
  assert.equal(existsSync(join(cwd, "null")), false, "invalid write must not create a file named null");
  assert.equal(executions.get("read") ?? 0, 0);
  assert.equal(executions.get("write") ?? 0, 0);

  for (const [name, registered] of extension.tools) {
    for (const parameter of registered.definition.parameters.required ?? []) {
      assertRejected(await invoke(name, { [parameter]: null }), parameter, registered.definition.parameters.properties[parameter].type ?? "value");
      assert.equal(executions.get(name) ?? 0, 0, name + " must not execute required nulls");
    }
  }
  assertRejected(await invoke("edit", { path: "victim.txt", edits: [{ replace: { old_text: "KEEP", new_text: null } }] }), "edits[0].replace.new_text");
  assert.equal(readFileSync(join(cwd, "victim.txt"), "utf8"), "KEEP\n");
  assert.equal(beforeCount, 0, "invalid arguments must stop before host hooks");
  assert.equal(afterCount, 0);
  assert.throws(() => read.prepareArguments({ path: null }), (error) => error.code === "invalid-null" && error.message === "Invalid path: expected string, received null.");

  writeFileSync(join(cwd, "null"), "sentinel\n");
  const validRead = await invoke("read", { path: "null", offset: "1", limit: "2", map: null, symbol: null });
  assert.equal(validRead.isError, false, "literal string null and numeric strings must remain valid");
  assert.ok(validRead.result.content.some((item) => item.type === "text" && item.text.includes("sentinel")));
  assert.deepEqual(beforeArgs, { path: "null", offset: "1", limit: "2" });
  assert.deepEqual(afterArgs, beforeArgs);
  const lsOutcome = await invoke("ls", { path: null, glob: null, limit: "1" });
  assert.equal(lsOutcome.isError, false);
  assert.deepEqual(beforeArgs, { limit: "1" });
  assert.deepEqual(extension.tools.get("ls").definition.parameters.required ?? [], []);
  const validWrite = await invoke("write", { path: "null", content: "fresh\n", map: null });
  assert.equal(validWrite.isError, false);
  assert.equal(readFileSync(join(cwd, "null"), "utf8"), "fresh\n");
  // Strict constrained sampling makes every field required, so the provider sends null for each optional one.
  const strictCalls = { read: { path: "null" }, write: { path: "null", content: "fresh\n" }, bash: { command: "printf strict" } };
  for (const [name, omitted] of Object.entries(strictCalls)) {
    const parameters = extension.tools.get(name).definition.parameters;
    assert.deepEqual(parameters.required, Object.keys(omitted), name + " required fields");
    const nulled = Object.fromEntries(Object.keys(parameters.properties).map((key) => [key, omitted[key] ?? null]));
    const outcome = await invoke(name, nulled);
    assert.equal(outcome.isError, false, name + " must run with every optional field null");
    assert.deepEqual(beforeArgs, omitted, name + " must receive the omitted call's arguments");
  }
  assert.equal(readFileSync(join(cwd, "null"), "utf8"), "fresh\n");

  // #290: zai/GLM fills strict-sampled optional fields with the string "null", which must act as omitted.
  const view = "Sources/View.swift";
  mkdirSync(join(cwd, "Sources"));
  writeFileSync(join(cwd, view), "struct DaytimeSectionCard {\n  let shown = 1\n}\n\nstruct OtherCard {\n  let hidden = 2\n}\n");
  const glmRead = await invoke("read", {
    bundle: "null", charLimit: "null", charOffset: "null",
    errorMode: "throw", limit: "null", map: true, offset: "null",
    path: view, strictSymbol: false,
    symbol: "DaytimeSectionCard",
  });
  assert.equal(glmRead.isError, false, "#290's call must succeed: " + JSON.stringify(glmRead.result.content));
  const glmText = glmRead.result.content.filter((item) => item.type === "text").map((item) => item.text).join("\n");
  assert.ok(glmText.includes("let shown = 1"), "#290's call must return the symbol: " + glmText);
  assert.ok(!glmText.includes("let hidden = 2"), "#290's call must return only the symbol's lines: " + glmText);
  assert.deepEqual(beforeArgs, { errorMode: "throw", map: true, path: view, strictSymbol: false, symbol: "DaytimeSectionCard" });
  for (const field of ["symbol", "errorMode"]) {
    const outcome = await invoke("read", { path: view, [field]: "null" });
    assert.equal(outcome.isError, false, "read with " + field + ' "null" must succeed');
    assert.deepEqual(beforeArgs, { path: view }, field + ' "null" must arrive omitted');
  }
  // #290's captured call verbatim: offset "1" and limit "260" beside symbol; the symbol wins over the offset.
  const capturedRead = await invoke("read", {
    bundle: "null", charLimit: "null", charOffset: "null",
    errorMode: "throw", limit: "260", map: true, offset: "1",
    path: view, strictSymbol: false,
    symbol: "DaytimeSectionCard",
  });
  assert.equal(capturedRead.isError, false, "#290's verbatim call must succeed: " + JSON.stringify(capturedRead.result.content));
  const capturedText = capturedRead.result.content.filter((item) => item.type === "text").map((item) => item.text).join("\n");
  assert.ok(capturedText.startsWith("[Read params adjusted: ignored offset 1 with symbol]"), "#290's verbatim call must lead with the ignored offset: " + capturedText);
  assert.ok(capturedText.includes("let shown = 1") && !capturedText.includes("let hidden = 2"), "#290's verbatim call must return only the symbol: " + capturedText);
  for (const offset of [5, "2", 99]) {
    const outcome = await invoke("read", { path: view, symbol: "OtherCard", offset });
    const text = outcome.result.content.filter((item) => item.type === "text").map((item) => item.text).join("\n");
    assert.equal(outcome.isError, false, "symbol with offset " + offset + " must succeed: " + text);
    assert.ok(text.startsWith("[Read params adjusted: ignored offset " + offset + " with symbol]") && text.includes("let hidden = 2"), "symbol must win over offset " + offset + ": " + text);
  }
  // Every registered tool, every optional top-level field "null": the call arrives as if they were omitted.
  const requiredArgs = {
    read: { path: view },
    write: { path: "null-fill.txt", content: "x\n" },
    edit: { path: "missing.txt" },
    grep: { pattern: "DaytimeSectionCard" },
    ast_search: { pattern: "DaytimeSectionCard" },
    find: { pattern: "*.swift" },
    ls: {},
    bash: { command: "printf ok" },
    nu: { command: "1" },
  };
  for (const [name, registered] of extension.tools) {
    const omitted = requiredArgs[name];
    assert.ok(omitted, name + " needs required arguments in this test");
    const parameters = registered.definition.parameters;
    assert.deepEqual([...(parameters.required ?? [])].sort(), Object.keys(omitted).sort(), name + " required fields");
    beforeArgs = undefined;
    await invoke(name, Object.fromEntries(Object.keys(parameters.properties).map((key) => [key, omitted[key] ?? "null"])));
    assert.deepEqual(beforeArgs, omitted, name + ' must receive every optional "null" omitted');
  }

  // Codemode contract: structuredContent survives the real tool_result pipeline, so scripts
  // receive { text, ...ptcValue } instead of rendered text.
  const registeredRead = extension.tools.get("read").definition;
  assert.equal(registeredRead.annotations?.readOnlyHint, true);
  assert.ok(registeredRead.outputSchema, "read must declare an outputSchema for codemode");
  const structuredRead = await invoke("read", { path: "null" });
  assert.equal(structuredRead.isError, false);
  const structured = structuredRead.result.structuredContent;
  assert.ok(structured, "structuredContent must survive the host pipeline");
  assert.equal(structured.tool, "read");
  assert.equal(structured.lines[0].raw, "fresh");
  assert.equal(structured.text, structuredRead.result.content.find((item) => item.type === "text").text);
  assert.deepEqual(handlerErrors, []);
  console.log("host-version=" + version + "; null-pipeline=PASS; nu=" + extension.tools.has("nu"));
} finally {
  rmSync(root, { recursive: true, force: true });
}
`;
  const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: process.cwd(),
    env: { ...process.env, PI_TEST_HOST: host },
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  expect(stdout).toContain("null-pipeline=PASS");
  expect(stdout).toContain(`host-version=${version};`);
}, 130_000);
