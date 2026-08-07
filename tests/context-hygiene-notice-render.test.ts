import { describe, expect, it } from "vitest";
import {
  renderContextHygieneNotice,
  staleNoticeKey,
  retiredNoticeKey,
  type ContextHygieneNoticeEntry,
} from "../src/context-hygiene-notices.js";
import {
  buildRetiredContextRecord,
  buildStaleContextRecord,
} from "../src/context-hygiene.js";

const STALE_READ_TEXT =
  "[Stale read result — this earlier read was superseded by a later file change; nothing is wrong with read. Edits still validate against current on-disk content via content-derived LINE:HASH anchors, so a matching hash still applies. Re-run read for fresh anchors.]";

function staleEntry(): ContextHygieneNoticeEntry {
  const record = buildStaleContextRecord({
    originalTool: "read",
    originalEventId: 1,
    originalResultId: "read-a",
    staleResourceKeys: ["file:src/a.ts"],
    invalidatingMutationEventId: 2,
    invalidatingMutationResultId: "edit-a",
    reason: "mutation-after-read",
  });
  return { kind: "stale", key: staleNoticeKey(record), record };
}

function retiredEntry(): ContextHygieneNoticeEntry {
  const record = buildRetiredContextRecord({
    originalTool: "bash",
    originalEventId: 3,
    originalResultId: "log-old",
    retiredResourceKeys: ["command:vcs:git log --oneline -5"],
    supersededByEventId: 4,
    supersededByResultId: "log-new",
    reason: "same-command-success-rerun",
    command: "git log --oneline -5",
  });
  return { kind: "retired", key: retiredNoticeKey(record), record };
}

describe("context hygiene notice rendering", () => {
  it("returns an empty string for no entries", () => {
    expect(renderContextHygieneNotice([])).toBe("");
  });

  it("renders a single stale entry with singular wording and the issue-218 placeholder text", () => {
    expect(renderContextHygieneNotice([staleEntry()])).toBe(
      [
        "[Context hygiene] 1 earlier tool result no longer reflects current state. Do not treat it as current:",
        `- read (file:src/a.ts): ${STALE_READ_TEXT}`,
      ].join("\n"),
    );
  });

  it("renders multiple entries with plural wording, stale before retired", () => {
    const rendered = renderContextHygieneNotice([staleEntry(), retiredEntry()]);
    expect(rendered).toBe(
      [
        "[Context hygiene] 2 earlier tool results no longer reflect current state. Do not treat them as current:",
        `- read (file:src/a.ts): ${STALE_READ_TEXT}`,
        "- bash (command:vcs:git log --oneline -5): [Retired bash context: same-command-success-rerun. Superseded by a later successful Bash command. Command: git log --oneline -5]",
      ].join("\n"),
    );
  });
});
