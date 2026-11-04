import { beforeEach, describe, expect, it } from "vitest";
import init from "../index.js";
import { resetContextHygieneTracker } from "../src/context-hygiene.js";
import { resetContextHygieneNoticeLedger } from "../src/context-hygiene-notices.js";

function createHarness() {
  const handlers: Record<string, Function> = {};
  init({
    registerTool() {},
    on(event: string, handler: Function) {
      handlers[event] = handler;
    },
    events: { emit() {}, on() {} },
  } as any);
  return handlers;
}

function textOf(result: any): string {
  return result?.content?.find((item: any) => item.type === "text")?.text ?? "";
}

function bashEvent(toolCallId: string, command: string, text: string) {
  return {
    type: "tool_result",
    toolName: "bash",
    toolCallId,
    input: { command },
    content: [{ type: "text", text }],
    isError: false,
    details: {},
  };
}

beforeEach(() => {
  resetContextHygieneTracker();
  resetContextHygieneNoticeLedger();
});

describe("issue #225 — forward-only stale notice on bash tool results", () => {
  it("announces retirement of an earlier same-command success on the rerun result", async () => {
    const handlers = createHarness();

    await handlers.tool_result(bashEvent("log-old", "git log --oneline -5", "old history"), {});
    const rerun = await handlers.tool_result(
      bashEvent("log-new", "git log --oneline -5", "new history"),
      {},
    );

    const text = textOf(rerun);
    expect(text).toContain("[Context hygiene]");
    expect(text).toContain("[Retired bash context: same-command-success-rerun.");
    expect(text).toContain("new history");
  });

  it("announces bash repo-state staleness on the mutating command's own result", async () => {
    const handlers = createHarness();

    await handlers.tool_result(bashEvent("status-1", "git status --short", " M src/a.ts"), {});
    const mutation = await handlers.tool_result(
      bashEvent("write-1", "printf changed > tmp/repro-225-notice.txt", ""),
      {},
    );

    expect(textOf(mutation)).toContain(
      "- bash (command:vcs:git status --short): [Stale bash context: bash-repo-state-after-mutation. Re-run the Bash command to refresh. Command: git status --short]",
    );
  });

  it("announces bash verification staleness when a failed command later succeeds", async () => {
    const handlers = createHarness();
    const command = "npm test -- --repro-225-notice";

    await handlers.tool_result(
      { ...bashEvent("verify-fail", command, "FAIL tests/x.test.ts"), isError: true },
      {},
    );
    const success = await handlers.tool_result(
      bashEvent("verify-pass", command, "PASS tests/x.test.ts"),
      {},
    );

    expect(textOf(success)).toContain(
      `- bash (command:test:${command}): [Stale bash context: bash-verification-success-rerun. Re-run the Bash command to refresh. Command: ${command}]`,
    );
  });

  it("does not repeat the same bash notice on a later unrelated command", async () => {
    const handlers = createHarness();

    await handlers.tool_result(bashEvent("log-old", "git log --oneline -5", "old history"), {});
    await handlers.tool_result(bashEvent("log-new", "git log --oneline -5", "new history"), {});

    const later = await handlers.tool_result(bashEvent("who", "whoami", "someone"), {});
    expect(textOf(later)).not.toContain("[Context hygiene]");
  });
});
