import { describe, expect, it } from "vitest";
import { applyContextHygieneStaleContext } from "../src/context-application.js";
import {
  buildContextHygieneMetadata,
  buildFileResource,
  createContextHygieneTracker,
} from "../src/context-hygiene.js";

function toolResult(toolCallId: string, toolName: string, text: string, details: Record<string, unknown> = {}) {
  return {
    role: "toolResult" as const,
    toolCallId,
    toolName,
    content: [{ type: "text" as const, text }],
    details,
    isError: false,
    timestamp: 1,
  };
}

describe("context hygiene context application", () => {
  it("masks stale read provider context after same-file edit", () => {
    const tracker = createContextHygieneTracker();
    const file = buildFileResource("src/read.ts");
    tracker.record(
      buildContextHygieneMetadata({ tool: "read", classification: "read-context", resources: [file] }),
      { resultId: "read-before-edit" },
    );
    tracker.record(
      buildContextHygieneMetadata({ tool: "edit", classification: "mutation", resources: [file] }),
      { resultId: "edit-file" },
    );

    const staleRead = toolResult("read-before-edit", "read", "old read output", { ptcValue: { tool: "read" } });
    const liveEdit = toolResult("edit-file", "edit", "edit succeeded", { ptcValue: { tool: "edit" } });
    const messages = [staleRead, liveEdit];

    const applied = applyContextHygieneStaleContext(messages, tracker.generateReport());

    expect(applied).not.toBe(messages);
    expect(applied[0]).not.toBe(staleRead);
    expect(applied[0].content).toEqual([
      { type: "text", text: "[Stale read result — this earlier read was superseded by a later file change; nothing is wrong with read. Edits still validate against current on-disk content via content-derived LINE:HASH anchors, so a matching hash still applies. Re-run read for fresh anchors.]" },
    ]);
    expect(applied[0].details).toMatchObject({
      ptcValue: { tool: "read" },
      contextHygieneStale: {
        status: "stale",
        originalTool: "read",
        originalResultId: "read-before-edit",
        invalidatingMutationResultId: "edit-file",
        reason: "mutation-after-read",
      },
    });
    expect(applied[1]).toBe(liveEdit);
    expect(staleRead.content).toEqual([{ type: "text", text: "old read output" }]);
  });


  it("keeps the historical read byte-identical and appends its stale notice after the edit in append-only mode", () => {
    const tracker = createContextHygieneTracker();
    const file = buildFileResource("src/read.ts");
    tracker.record(
      buildContextHygieneMetadata({ tool: "read", classification: "read-context", resources: [file] }),
      { resultId: "read-before-edit" },
    );
    tracker.record(
      buildContextHygieneMetadata({ tool: "edit", classification: "mutation", resources: [file] }),
      { resultId: "edit-file" },
    );

    const historicalRead = toolResult("read-before-edit", "read", "old read output");
    const editResult = toolResult("edit-file", "edit", "edit succeeded");
    const messages = [historicalRead, editResult];

    const applied = applyContextHygieneStaleContext(messages, tracker.generateReport(), "append-only");

    expect(applied[0]).toBe(historicalRead);
    expect(applied[0].content).toEqual([{ type: "text", text: "old read output" }]);
    expect(applied[1]).not.toBe(editResult);
    expect(applied[1].content).toEqual([
      { type: "text", text: "edit succeeded" },
      { type: "text", text: "[Stale read result — this earlier read was superseded by a later file change; nothing is wrong with read. Edits still validate against current on-disk content via content-derived LINE:HASH anchors, so a matching hash still applies. Re-run read for fresh anchors.]" },
    ]);
    expect(messages[1]).toBe(editResult);
  });


  it("leaves stale history and mutation output unchanged in disabled mode", () => {
    const tracker = createContextHygieneTracker();
    const file = buildFileResource("src/read.ts");
    tracker.record(
      buildContextHygieneMetadata({ tool: "read", classification: "read-context", resources: [file] }),
      { resultId: "disabled-read" },
    );
    tracker.record(
      buildContextHygieneMetadata({ tool: "edit", classification: "mutation", resources: [file] }),
      { resultId: "disabled-edit" },
    );
    const messages = [
      toolResult("disabled-read", "read", "old read output"),
      toolResult("disabled-edit", "edit", "edit succeeded"),
    ];

    const applied = applyContextHygieneStaleContext(messages, tracker.generateReport(), "disabled");

    expect(applied).toBe(messages);
    expect(applied.map((message) => message.content)).toEqual([
      [{ type: "text", text: "old read output" }],
      [{ type: "text", text: "edit succeeded" }],
    ]);
  });


  it("renders append-only notices from frozen mutation effects without live tracker history", () => {
    const file = buildFileResource("src/read.ts");
    const historicalRead = toolResult("frozen-read", "read", "old read output");
    const editResult = {
      ...toolResult("frozen-edit", "edit", "edit succeeded"),
      details: {
        contextHygiene: {
          ...buildContextHygieneMetadata({ tool: "edit", classification: "mutation", resources: [file] }),
          appliedEffects: {
            retired: { count: 0, resultIds: [], reasons: [] },
            stale: { count: 1, resultIds: ["frozen-read"], reasons: ["mutation-after-read"] },
            notices: [{
              resultId: "frozen-read",
              text: "[Stale read result — this earlier read was superseded by a later file change; nothing is wrong with read. Edits still validate against current on-disk content via content-derived LINE:HASH anchors, so a matching hash still applies. Re-run read for fresh anchors.]",
            }],
          },
        },
      },
    };

    const applied = applyContextHygieneStaleContext(
      [historicalRead, editResult],
      createContextHygieneTracker().generateReport(),
      "append-only",
    );

    expect(applied[0]).toBe(historicalRead);
    expect(applied[1].content).toEqual([
      { type: "text", text: "edit succeeded" },
      { type: "text", text: "[Stale read result — this earlier read was superseded by a later file change; nothing is wrong with read. Edits still validate against current on-disk content via content-derived LINE:HASH anchors, so a matching hash still applies. Re-run read for fresh anchors.]" },
    ]);
  });

  it("masks only pre-write read context and preserves a fresh read after the mutation", () => {
    const tracker = createContextHygieneTracker();
    const file = buildFileResource("src/write.ts");
    tracker.record(
      buildContextHygieneMetadata({ tool: "read", classification: "read-context", resources: [file] }),
      { resultId: "read-before-write" },
    );
    tracker.record(
      buildContextHygieneMetadata({ tool: "write", classification: "mutation", resources: [file] }),
      { resultId: "write-file" },
    );
    tracker.record(
      buildContextHygieneMetadata({ tool: "read", classification: "read-context", resources: [file] }),
      { resultId: "read-after-write" },
    );

    const staleBeforeWrite = toolResult("read-before-write", "read", "old write-target read");
    const liveWrite = toolResult("write-file", "write", "write succeeded");
    const freshRead = toolResult("read-after-write", "read", "fresh read output");

    const applied = applyContextHygieneStaleContext(
      [staleBeforeWrite, liveWrite, freshRead],
      tracker.generateReport(),
    );

    expect(applied[0].content).toEqual([
      { type: "text", text: "[Stale read result — this earlier read was superseded by a later file change; nothing is wrong with read. Edits still validate against current on-disk content via content-derived LINE:HASH anchors, so a matching hash still applies. Re-run read for fresh anchors.]" },
    ]);
    expect(applied[1]).toBe(liveWrite);
    expect(applied[2]).toBe(freshRead);
  });

  it("masks stale grep provider context after same-file edit", () => {
    const tracker = createContextHygieneTracker();
    const file = buildFileResource("src/grep.ts");
    tracker.record(
      buildContextHygieneMetadata({ tool: "grep", classification: "search-context", resources: [file] }),
      { resultId: "grep-before-edit" },
    );
    tracker.record(
      buildContextHygieneMetadata({ tool: "edit", classification: "mutation", resources: [file] }),
      { resultId: "edit-grep-file" },
    );

    const staleGrep = toolResult("grep-before-edit", "grep", "old grep output");
    const liveEdit = toolResult("edit-grep-file", "edit", "edit succeeded");
    const applied = applyContextHygieneStaleContext([staleGrep, liveEdit], tracker.generateReport());

    expect(applied[0].content).toEqual([
      { type: "text", text: "[Stale grep result — this earlier grep was superseded by a later file change; nothing is wrong with grep. Edits still validate against current on-disk content via content-derived LINE:HASH anchors, so a matching hash still applies. Re-run grep for current matches.]" },
    ]);
    expect(applied[0].details).toMatchObject({
      contextHygieneStale: {
        status: "stale",
        originalTool: "grep",
        originalResultId: "grep-before-edit",
        invalidatingMutationResultId: "edit-grep-file",
        reason: "mutation-after-read",
      },
    });
    expect(applied[1]).toBe(liveEdit);
  });

  it("masks stale grep provider context after same-file write", () => {
    const tracker = createContextHygieneTracker();
    const file = buildFileResource("src/grep-write.ts");
    tracker.record(
      buildContextHygieneMetadata({ tool: "grep", classification: "search-context", resources: [file] }),
      { resultId: "grep-before-write" },
    );
    tracker.record(
      buildContextHygieneMetadata({ tool: "write", classification: "mutation", resources: [file] }),
      { resultId: "write-grep-file" },
    );

    const staleGrep = toolResult("grep-before-write", "grep", "old grep write output");
    const liveWrite = toolResult("write-grep-file", "write", "write succeeded");
    const applied = applyContextHygieneStaleContext([staleGrep, liveWrite], tracker.generateReport());

    expect(applied[0].content).toEqual([
      { type: "text", text: "[Stale grep result — this earlier grep was superseded by a later file change; nothing is wrong with grep. Edits still validate against current on-disk content via content-derived LINE:HASH anchors, so a matching hash still applies. Re-run grep for current matches.]" },
    ]);
    expect(applied[1]).toBe(liveWrite);
  });

  it("masks both prior grep and read context in a grep read edit workflow", () => {
    const tracker = createContextHygieneTracker();
    const file = buildFileResource("src/chain.ts");
    tracker.record(
      buildContextHygieneMetadata({ tool: "grep", classification: "search-context", resources: [file] }),
      { resultId: "grep-chain" },
    );
    tracker.record(
      buildContextHygieneMetadata({ tool: "read", classification: "read-context", resources: [file] }),
      { resultId: "read-chain" },
    );
    tracker.record(
      buildContextHygieneMetadata({ tool: "edit", classification: "mutation", resources: [file] }),
      { resultId: "edit-chain" },
    );

    const applied = applyContextHygieneStaleContext([
      toolResult("grep-chain", "grep", "chain grep output"),
      toolResult("read-chain", "read", "chain read output"),
      toolResult("edit-chain", "edit", "chain edit output"),
    ], tracker.generateReport());

    expect(applied[0].content).toEqual([
      { type: "text", text: "[Stale grep result — this earlier grep was superseded by a later file change; nothing is wrong with grep. Edits still validate against current on-disk content via content-derived LINE:HASH anchors, so a matching hash still applies. Re-run grep for current matches.]" },
    ]);
    expect(applied[1].content).toEqual([
      { type: "text", text: "[Stale read result — this earlier read was superseded by a later file change; nothing is wrong with read. Edits still validate against current on-disk content via content-derived LINE:HASH anchors, so a matching hash still applies. Re-run read for fresh anchors.]" },
    ]);
    expect(applied[2].content).toEqual([{ type: "text", text: "chain edit output" }]);
  });

  it("masks stale ast_search provider context after same-file edit", () => {
    const tracker = createContextHygieneTracker();
    const file = buildFileResource("src/sg.ts");
    tracker.record(
      buildContextHygieneMetadata({ tool: "ast_search", classification: "search-context", resources: [file] }),
      { resultId: "ast-before-edit" },
    );
    tracker.record(
      buildContextHygieneMetadata({ tool: "edit", classification: "mutation", resources: [file] }),
      { resultId: "edit-ast-file" },
    );

    const staleAst = toolResult("ast-before-edit", "ast_search", "old ast_search output");
    const liveEdit = toolResult("edit-ast-file", "edit", "edit succeeded");
    const applied = applyContextHygieneStaleContext([staleAst, liveEdit], tracker.generateReport());

    expect(applied[0].content).toEqual([
      { type: "text", text: "[Stale ast_search result — this earlier ast_search was superseded by a later file change; nothing is wrong with ast_search. Edits still validate against current on-disk content via content-derived LINE:HASH anchors, so a matching hash still applies. Re-run ast_search for current matches.]" },
    ]);
    expect(applied[0].details).toMatchObject({
      contextHygieneStale: {
        status: "stale",
        originalTool: "ast_search",
        originalResultId: "ast-before-edit",
        invalidatingMutationResultId: "edit-ast-file",
        reason: "mutation-after-read",
      },
    });
    expect(applied[1]).toBe(liveEdit);
  });

  it("masks stale ast_search provider context after same-file write", () => {
    const tracker = createContextHygieneTracker();
    const file = buildFileResource("src/sg-write.ts");
    tracker.record(
      buildContextHygieneMetadata({ tool: "ast_search", classification: "search-context", resources: [file] }),
      { resultId: "ast-before-write" },
    );
    tracker.record(
      buildContextHygieneMetadata({ tool: "write", classification: "mutation", resources: [file] }),
      { resultId: "write-ast-file" },
    );

    const staleAst = toolResult("ast-before-write", "ast_search", "old ast_search write output");
    const liveWrite = toolResult("write-ast-file", "write", "write succeeded");
    const applied = applyContextHygieneStaleContext([staleAst, liveWrite], tracker.generateReport());

    expect(applied[0].content).toEqual([
      { type: "text", text: "[Stale ast_search result — this earlier ast_search was superseded by a later file change; nothing is wrong with ast_search. Edits still validate against current on-disk content via content-derived LINE:HASH anchors, so a matching hash still applies. Re-run ast_search for current matches.]" },
    ]);
    expect(applied[1]).toBe(liveWrite);
  });

  it("does not mask a non-matching bash tool result even if its id matches a stale read", () => {
    const tracker = createContextHygieneTracker();
    const file = buildFileResource("src/read.ts");
    tracker.record(
      buildContextHygieneMetadata({ tool: "read", classification: "read-context", resources: [file] }),
      { resultId: "read-before-edit" },
    );
    tracker.record(
      buildContextHygieneMetadata({ tool: "edit", classification: "mutation", resources: [file] }),
      { resultId: "edit-file" },
    );

    const bashWithSameId = toolResult("read-before-edit", "bash", "bash output must stay live");
    const bashMessages = [bashWithSameId];
    const bashApplied = applyContextHygieneStaleContext(bashMessages, tracker.generateReport());

    expect(bashApplied[0].content).toEqual([{ type: "text", text: "bash output must stay live" }]);
    expect(bashApplied).toBe(bashMessages);
    expect(bashApplied[0]).toBe(bashWithSameId);

    const staleRead = toolResult("read-before-edit", "read", "old read output");
    const staleApplied = applyContextHygieneStaleContext([staleRead], tracker.generateReport());
    expect(staleApplied[0].content).toEqual([
      { type: "text", text: "[Stale read result — this earlier read was superseded by a later file change; nothing is wrong with read. Edits still validate against current on-disk content via content-derived LINE:HASH anchors, so a matching hash still applies. Re-run read for fresh anchors.]" },
    ]);
    expect(staleApplied[0].content[0].text.toLowerCase()).toContain("stale");
    expect(staleApplied[0].content[0].text.toLowerCase()).not.toContain("retired");
  });


  it("leaves read grep and ast_search context unchanged before any same-file mutation", () => {
    const tracker = createContextHygieneTracker();
    const file = buildFileResource("src/no-mutation.ts");
    tracker.record(
      buildContextHygieneMetadata({ tool: "read", classification: "read-context", resources: [file] }),
      { resultId: "read-live" },
    );
    tracker.record(
      buildContextHygieneMetadata({ tool: "grep", classification: "search-context", resources: [file] }),
      { resultId: "grep-live" },
    );
    tracker.record(
      buildContextHygieneMetadata({ tool: "ast_search", classification: "search-context", resources: [file] }),
      { resultId: "ast-live" },
    );

    const messages = [
      toolResult("read-live", "read", "live read output"),
      toolResult("grep-live", "grep", "live grep output"),
      toolResult("ast-live", "ast_search", "live ast output"),
    ];

    const applied = applyContextHygieneStaleContext(messages, tracker.generateReport());

    expect(applied).toBe(messages);
    expect(applied.map((message) => message.content[0].text)).toEqual([
      "live read output",
      "live grep output",
      "live ast output",
    ]);
  });


  it("does not mask prior tool results for unrelated files", () => {
    const tracker = createContextHygieneTracker();
    const mutatedFile = buildFileResource("src/read.ts");
    const otherFile = buildFileResource("src/other.ts");
    tracker.record(
      buildContextHygieneMetadata({ tool: "read", classification: "read-context", resources: [mutatedFile] }),
      { resultId: "read-before-edit" },
    );
    tracker.record(
      buildContextHygieneMetadata({ tool: "read", classification: "read-context", resources: [otherFile] }),
      { resultId: "read-other" },
    );
    tracker.record(
      buildContextHygieneMetadata({ tool: "edit", classification: "mutation", resources: [mutatedFile] }),
      { resultId: "edit-file" },
    );

    const unrelatedRead = toolResult("read-other", "read", "other read output");
    const unrelatedMessages = [unrelatedRead];
    const applied = applyContextHygieneStaleContext(unrelatedMessages, tracker.generateReport());

    expect(applied).toBe(unrelatedMessages);
    expect(applied[0]).toBe(unrelatedRead);
    expect(applied[0].content).toEqual([{ type: "text", text: "other read output" }]);
  });
});
