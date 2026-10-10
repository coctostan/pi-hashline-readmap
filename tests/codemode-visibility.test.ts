import { expect, it } from "vitest";
import init from "../index.js";
import { buildContextHygieneMetadata, buildFileResource, getContextHygieneTracker } from "../src/context-hygiene.js";

function harness() {
  const handlers: Record<string, Function> = {};
  init({ registerTool() {}, on(name: string, handler: Function) { handlers[name] = handler; }, events: { emit() {}, on() {} } } as any);
  const emit = async (toolName: string, id: string, nested: boolean, input: any, text: string, details: any = {}, isError = false) =>
    handlers.tool_result({ type: "tool_result", toolName, toolCallId: id, ...(nested ? { parentToolCallId: "script" } : {}),
      input, content: [{ type: "text", text }], details, isError }, { cwd: process.cwd() });
  const metadata = (tool: string, classification: "read-context" | "search-context" | "mutation", path: string) =>
    ({ contextHygiene: buildContextHygieneMetadata({ tool, classification, resources: [buildFileResource(path)] }) });
  const records = () => getContextHygieneTracker().generateReport().staleCandidates.flatMap(c => c.staleResults);
  return { emit, metadata, records };
}

it("excludes private Bash context from lifecycle records", async () => {
  const { emit, metadata, records } = harness();
  await emit("bash", "private-status", true, { command: "git status" }, "On branch main\nnothing to commit, working tree clean");
  await emit("write", "mutation", true, {}, "ok", metadata("write", "mutation", "/tmp/262-private"));
  expect(records().some(r => r.originalResultId === "private-status")).toBe(false);
});

it.each(["read", "grep", "ast_search"])("retains visible %s invalidation through a private reread", async name => {
  const { emit, metadata, records } = harness();
  const path = "/tmp/262-" + name;
  const classification = name === "read" ? "read-context" : "search-context";
  await emit(name, "visible", false, {}, "visible", metadata(name, classification, path));
  await emit(name, "private", true, {}, "private", metadata(name, classification, path));
  await emit("write", "mutation", true, {}, "ok", metadata("write", "mutation", path));
  expect(records().some(r => r.originalResultId === "visible")).toBe(true);
  expect(records().some(r => r.originalResultId === "private")).toBe(false);
  const candidate = getContextHygieneTracker().generateReport().staleCandidates.find(c => c.resourceKey === "file:" + path)!;
  expect(candidate.staleEventIds).toHaveLength(2);
});

it("retains visible repo state invalidation through private Bash rereads", async () => {
  const { emit, records } = harness();
  for (const nested of [false, true]) {
    await emit("bash", nested ? "private-status" : "visible-status", nested,
      { command: "git status" }, "On branch main\nnothing to commit, working tree clean");
  }
  await emit("bash", "private-reset", true, { command: "git reset --hard HEAD" }, "HEAD is now at 123 test");
  expect(records().some(r => r.originalResultId === "visible-status")).toBe(true);
  expect(records().some(r => r.originalResultId === "private-status")).toBe(false);
});

it("keeps nested shell-file mutations effective", async () => {
  const { emit, metadata, records } = harness();
  await emit("read", "visible-shell-target", false, {}, "old",
    metadata("read", "read-context", process.cwd() + "/shell-target.txt"));
  await emit("bash", "private-shell-mutation", true, { command: "rm shell-target.txt" }, "");
  expect(records().some(r => r.originalResultId === "visible-shell-target")).toBe(true);
});

it("supersedes visible failed verification with private success", async () => {
  const { emit, records } = harness();
  await emit("bash", "visible-failed", false, { command: "npm test" }, "Tests 1 failed", {}, true);
  await emit("bash", "private-failed", true, { command: "npm test" }, "Tests 1 failed", {}, true);
  await emit("bash", "private-success", true, { command: "npm test" }, "Tests 1 passed");
  expect(records().some(r => r.originalResultId === "visible-failed")).toBe(true);
  expect(records().some(r => r.originalResultId === "private-failed")).toBe(false);
});

it("retires only visible successful command results", async () => {
  const { emit } = harness();
  for (const [id, nested] of [["visible", false], ["private-1", true], ["private-2", true]] as const) {
    await emit("bash", id, nested, { command: "npm test" }, "Tests  1 passed (1)");
  }
  const retired = getContextHygieneTracker().generateReport().retirementCandidates.flatMap(c => c.retiredResults ?? []);
  expect(retired.some(r => r.originalResultId?.startsWith("private-"))).toBe(false);
  expect(retired.some(r => r.originalResultId === "visible")).toBe(true);
});

it("announces visible invalidation once on the outer result", async () => {
  const { emit, metadata } = harness();
  const path = "/tmp/262-dedup";
  await emit("read", "visible", false, {}, "old", metadata("read", "read-context", path));
  await emit("read", "private", true, {}, "old", metadata("read", "read-context", path));
  await emit("write", "mutation", true, {}, "ok", metadata("write", "mutation", path));
  const outer = await emit("codemode", "outer", false, {}, "true");
  const text = outer?.content.map((c: any) => c.text ?? "").join("\n") ?? "";
  expect(text).toContain("[Context hygiene] 1 earlier tool result");
  expect(text).toContain("[Stale read result");
  expect(await emit("codemode", "outer-2", false, {}, "true")).toBeUndefined();
});
