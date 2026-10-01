import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

/** Exact Pi release the independent current-host lane pins (see .github/workflows/pi-compatibility.yml). */
const PI_COMPAT_VERSION = "1.0.0";

it("rejects required nulls through the real selected host pipeline", () => {
  const lockedHost = resolve(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "..");
  const host = process.env.PI_COMPAT_HOST ? resolve(process.env.PI_COMPAT_HOST) : lockedHost;
  const source = String.raw`
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const host = process.env.PI_TEST_HOST;
const version = JSON.parse(readFileSync(join(host, "package.json"), "utf8")).version;
const lockedVersion = JSON.parse(readFileSync("package-lock.json", "utf8")).packages["node_modules/@earendil-works/pi-coding-agent"].version;
assert.equal(version, process.env.PI_COMPAT_HOST ? process.env.PI_COMPAT_EXPECTED_VERSION : lockedVersion, "selected host version must match the lane");

// Resolve agent-core through its declared "./package.json" export, not a bare specifier: 0.84.2,
// 0.99.x and 1.0.0 only expose "." under "types"/"import", so a bare require/resolve throws
// ERR_PACKAGE_PATH_NOT_EXPORTED. Root the lookup at the selected host (not repo-local resolution)
// so a hoisted or nested agent-core is found either way.
const hostRequire = createRequire(join(host, "package.json"));
const coreManifest = hostRequire.resolve("@earendil-works/pi-agent-core/package.json");
const coreRoot = dirname(coreManifest);
const coreVersion = JSON.parse(readFileSync(coreManifest, "utf8")).version;
assert.equal(coreVersion, version, "agent-core must come from the selected host installation");
const { discoverAndLoadExtensions, wrapRegisteredTool, ExtensionRunner, SessionManager } = await import(pathToFileURL(join(host, "dist/index.js")));
const coreLoop = await import(pathToFileURL(join(coreRoot, "dist/agent-loop.js")));

// The current-host agent-core (>= 0.99) exports runToolCall directly. 0.84.2's agent-core does not (it only has
// agentLoop/agentLoopContinue/runAgentLoop/runAgentLoopContinue), so the locked lane drives one
// real turn through runAgentLoop with an injected deterministic stream whose assistant message
// carries exactly the one tool call under test. shouldStopAfterTurn ends the loop after that
// turn so no second simulated model turn happens. Either path exercises the real
// prepareToolCallArguments -> validateToolArguments -> beforeToolCall -> execute -> afterToolCall
// sequence; this is glue around the real API, not a substitute validator.
async function runSelectedHostToolCall(call, options) {
  if (typeof coreLoop.runToolCall === "function") {
    return coreLoop.runToolCall(call, options);
  }
  assert.equal(version, lockedVersion, "only the locked lane needs the legacy loop adapter");
  assert.equal(typeof coreLoop.runAgentLoop, "function");
  const assistant = {
    role: "assistant",
    content: [call],
    stopReason: "toolUse",
  };
  const messages = await coreLoop.runAgentLoop(
    [],
    options.context,
    {
      model: { provider: "test" },
      convertToLlm: (messages) => messages,
      shouldStopAfterTurn: () => true,
      beforeToolCall: options.beforeToolCall,
      afterToolCall: options.afterToolCall,
    },
    async () => {},
    undefined,
    () => ({
      async *[Symbol.asyncIterator]() {},
      result: async () => assistant,
    }),
  );
  const message = messages.find((item) => item.role === "toolResult" && item.toolCallId === call.id);
  assert.ok(message, "real locked-host loop must produce a tool result");
  return {
    toolCall: call,
    result: { content: message.content, details: message.details },
    isError: message.isError,
  };
}

const root = mkdtempSync(join(tmpdir(), "pi-258-null-pipeline-"));
const cwd = join(root, "cwd");
const agentDir = join(root, "agent");
mkdirSync(cwd);
mkdirSync(agentDir);
try {
  const loaded = await discoverAndLoadExtensions([process.cwd()], cwd, agentDir);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  const extension = loaded.extensions[0];
  for (const name of ["read", "write", "edit", "grep", "ast_search", "find", "ls", "bash"]) {
    assert.ok(extension.tools.has(name), name + " must register");
  }
  if (process.env.PI_COMPAT_REQUIRE_NU === "1") assert.ok(extension.tools.has("nu"), "Nu must register in the current-host CI lane");
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
    return runSelectedHostToolCall(call, {
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

  // Codemode contract: hosts that support outputSchema keep structuredContent through the real
  // tool_result pipeline, so scripts receive { text, ...ptcValue } instead of rendered text.
  const registeredRead = extension.tools.get("read").definition;
  assert.equal(registeredRead.annotations?.readOnlyHint, true);
  assert.ok(registeredRead.outputSchema, "read must declare an outputSchema for codemode");
  if (typeof coreLoop.runToolCall === "function") {
    const structuredRead = await invoke("read", { path: "null" });
    assert.equal(structuredRead.isError, false);
    const structured = structuredRead.result.structuredContent;
    assert.ok(structured, "structuredContent must survive the host pipeline");
    assert.equal(structured.tool, "read");
    assert.equal(structured.lines[0].raw, "fresh");
    assert.equal(structured.text, structuredRead.result.content.find((item) => item.type === "text").text);
  }
  assert.deepEqual(handlerErrors, []);
  console.log("host-version=" + version + "; null-pipeline=PASS; nu=" + extension.tools.has("nu"));
} finally {
  rmSync(root, { recursive: true, force: true });
}
`;
  const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: process.cwd(),
    env: { ...process.env, PI_TEST_HOST: host, PI_COMPAT_EXPECTED_VERSION: PI_COMPAT_VERSION },
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  expect(stdout).toContain("null-pipeline=PASS");
  if (process.env.PI_COMPAT_HOST) expect(stdout).toContain(`host-version=${PI_COMPAT_VERSION};`);
}, 130_000);
