import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { selectCompatHost } from "../scripts/pi-compat-host.mjs";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";

const scratch = mkdtempSync(join(tmpdir(), "pi-string-edit-cases-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

// A file for each recorded string whose anchored lines hash to its anchors, so the string applies as sent.
async function writeRecordedCases(): Promise<string> {
  await ensureHashInit();
  const recorded = JSON.parse(readFileSync(new URL("./fixtures/string-edits/recorded.json", import.meta.url), "utf8")) as Array<{
    edits: string;
    meant: string;
  }>;
  const cases = recorded.map(({ edits, meant }) => {
    const anchors = new Map<number, string>();
    for (const item of JSON.parse(meant) as Array<Record<string, Record<string, unknown>>>) {
      for (const op of Object.values(item)) {
        for (const ref of [op.anchor, op.start_anchor, op.end_anchor]) {
          if (typeof ref !== "string") continue;
          const [line, hash] = ref.split(":");
          anchors.set(Number(line), hash);
        }
      }
    }
    const lines = Array.from({ length: Math.max(...anchors.keys()) + 2 }, (_, index) => `line ${index + 1}`);
    for (const [line, hash] of anchors) {
      let k = 0;
      while (computeLineHash(line, `anchored ${line} #${k}`) !== hash) k++;
      lines[line - 1] = `anchored ${line} #${k}`;
    }
    return { edits, meant, content: lines.join("\n") + "\n" };
  });
  const path = join(scratch, "cases.json");
  writeFileSync(path, JSON.stringify(cases));
  return path;
}

it("applies an edit whose edits arrive as a JSON-array string through the real selected host pipeline", async () => {
  const { host, version } = selectCompatHost();
  const casesPath = await writeRecordedCases();
  const source = String.raw`
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const host = process.env.PI_TEST_HOST;
const version = JSON.parse(readFileSync(join(host, "package.json"), "utf8")).version;
// agent-core's "." export has only "types"/"import" conditions; resolve its package.json from the selected host.
const hostRequire = createRequire(join(host, "package.json"));
const coreManifest = hostRequire.resolve("@earendil-works/pi-agent-core/package.json");
assert.equal(JSON.parse(readFileSync(coreManifest, "utf8")).version, version, "agent-core must come from the selected host");
const { discoverAndLoadExtensions, wrapRegisteredTool, ExtensionRunner, SessionManager } = await import(pathToFileURL(join(host, "dist/index.js")));
// runToolCall is the real prepareToolCallArguments -> validateToolArguments -> hooks -> execute sequence.
const { runToolCall } = await import(pathToFileURL(join(dirname(coreManifest), "dist/agent-loop.js")));

const root = mkdtempSync(join(tmpdir(), "pi-string-edits-"));
const cwd = join(root, "cwd");
const agentDir = join(root, "agent");
mkdirSync(cwd);
mkdirSync(agentDir);
try {
  // Load the checkout's source explicitly: a repo dist/ must not be tested instead.
  const loaded = await discoverAndLoadExtensions([resolve(process.cwd(), "index.ts")], cwd, agentDir);
  assert.deepEqual(loaded.errors, []);
  const extension = loaded.extensions[0];
  const runner = new ExtensionRunner(loaded.extensions, loaded.runtime, cwd, SessionManager.inMemory(cwd), {});
  // wrapRegisteredTool's execute() reads runner.getActiveTools(), which needs bindCore; a minimal stand-in.
  runner.bindCore(
    {
      sendMessage: () => {}, sendUserMessage: () => {}, appendEntry: () => "", setSessionName: () => {},
      getSessionName: () => "", setLabel: () => {}, getActiveTools: () => [...extension.tools.keys()],
      getAllTools: () => [...extension.tools.keys()], setActiveTools: () => {}, refreshTools: () => {},
      getCommands: () => [], setModel: async () => true, getThinkingLevel: () => "off", setThinkingLevel: () => {},
    },
    {
      getModel: () => undefined, getScopedModels: () => [], isIdle: () => true, isProjectTrusted: () => true,
      getSignal: () => undefined, abort: () => {}, hasPendingMessages: () => false, shutdown: () => {},
      getContextUsage: () => undefined, compact: () => {}, getSystemPrompt: () => "",
    },
  );
  let editExecutions = 0;
  const tools = [...extension.tools.values()].map((registered) => {
    const wrapped = wrapRegisteredTool(registered, runner);
    return {
      ...wrapped,
      execute(...args) {
        if (wrapped.name === "edit") editExecutions++;
        return wrapped.execute(...args);
      },
    };
  });
  let nextId = 0;
  async function invoke(name, args) {
    const call = { type: "toolCall", id: "case-" + nextId++, name, arguments: args };
    return runToolCall(call, {
      tools,
      assistantMessage: { role: "assistant", content: [call] },
      context: { messages: [], tools },
      beforeToolCall: ({ args }) => runner.emitToolCall({ type: "tool_call", toolName: name, toolCallId: call.id, input: args }),
      afterToolCall: ({ args, result, isError }) =>
        runner.emitToolResult({ type: "tool_result", toolName: name, toolCallId: call.id, input: args, ...result, isError }),
    });
  }
  const textOf = (outcome) => outcome.result.content.filter((item) => item.type === "text").map((item) => item.text).join("\n");

  writeFileSync(join(cwd, "victim.txt"), "KEEP\nSTAY\n");
  const applied = await invoke("edit", {
    path: "victim.txt",
    edits: JSON.stringify([{ replace: { old_text: "KEEP", new_text: "GONE" } }]),
  });
  assert.equal(applied.isError, false, "a JSON-array string must apply: " + textOf(applied));
  assert.equal(readFileSync(join(cwd, "victim.txt"), "utf8"), "GONE\nSTAY\n");
  assert.equal(editExecutions, 1);

  const objectString = await invoke("edit", {
    path: "victim.txt",
    edits: JSON.stringify({ replace: { old_text: "GONE", new_text: "LOST" } }),
  });
  assert.equal(objectString.isError, true, "a JSON-object string must still fail validation: " + textOf(objectString));
  assert.match(textOf(objectString), /edits/);
  assert.equal(readFileSync(join(cwd, "victim.txt"), "utf8"), "GONE\nSTAY\n");
  assert.equal(editExecutions, 1, "a rejected string must not execute edit");

  const cases = JSON.parse(readFileSync(process.env.PI_TEST_CASES, "utf8"));
  for (const [index, { edits, meant, content }] of cases.entries()) {
    const recorded = "recorded-" + index + ".txt";
    const intendedPath = "meant-" + index + ".txt";
    writeFileSync(join(cwd, recorded), content);
    writeFileSync(join(cwd, intendedPath), content);
    assert.equal((await invoke("read", { path: recorded })).isError, false);
    assert.equal((await invoke("read", { path: intendedPath })).isError, false);
    const sent = await invoke("edit", { path: recorded, edits });
    assert.equal(sent.isError, false, "recorded string " + index + " must apply: " + textOf(sent));
    const intended = await invoke("edit", { path: intendedPath, edits: JSON.parse(meant) });
    assert.equal(intended.isError, false, "meant array " + index + " must apply: " + textOf(intended));
    const written = readFileSync(join(cwd, recorded), "utf8");
    assert.notEqual(written, content, "recorded string " + index + " must change the file");
    assert.equal(written, readFileSync(join(cwd, intendedPath), "utf8"), "recorded string " + index + " must write what its array writes");
  }
  assert.equal(editExecutions, 1 + 2 * cases.length);

  const missingBracket = await invoke("edit", {
    path: "victim.txt",
    edits: '[{"replace":{"old_text":"GONE","new_text":"LOST"}}',
  });
  assert.equal(missingBracket.isError, true, "a string missing its ] must still fail validation: " + textOf(missingBracket));
  assert.match(textOf(missingBracket), /edits/);
  assert.equal(readFileSync(join(cwd, "victim.txt"), "utf8"), "GONE\nSTAY\n");
  assert.equal(editExecutions, 1 + 2 * cases.length, "a rejected string must not execute edit");
  console.log("host-version=" + version + "; string-edits=PASS");
} finally {
  rmSync(root, { recursive: true, force: true });
}
`;
  const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: process.cwd(),
    env: { ...process.env, PI_TEST_HOST: host, PI_TEST_CASES: casesPath },
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  expect(stdout).toContain("string-edits=PASS");
  expect(stdout).toContain(`host-version=${version};`);
}, 130_000);
