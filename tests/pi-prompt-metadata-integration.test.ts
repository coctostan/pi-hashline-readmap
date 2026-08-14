import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectHashlineSystemPromptMetadata } from "./helpers/pi-prompt-metadata-harness.js";

const EXPECTED_TOOLS = ["read", "edit", "grep", "find", "ls", "write", "ast_search", "nu"] as const;

function schemaShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(schemaShape);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== "description")
    .map(([key, child]) => [key, schemaShape(child)]));
}
const shapeHash = (value: unknown) => createHash("sha256").update(JSON.stringify(schemaShape(value))).digest("hex");

describe("Pi system prompt metadata integration", () => {
  afterEach(() => {
    vi.doUnmock("node:child_process");
    vi.resetModules();
  });

  it("renders hashline override snippets and flat tool-named guidelines through Pi registration", async () => {
    vi.doMock("node:child_process", async () => {
      const actual = await vi.importActual<any>("node:child_process");
      return { ...actual, execFileSync: vi.fn(() => Buffer.from("0.111.0\n")) };
    });

    const { systemPrompt, snippets, guidelinesByTool, activeToolNames } = await collectHashlineSystemPromptMetadata([...EXPECTED_TOOLS]);
    expect(activeToolNames).toEqual([...EXPECTED_TOOLS]);

    for (const toolName of EXPECTED_TOOLS) {
      const snippet = snippets[toolName];
      expect(snippet, `${toolName} promptSnippet`).toBeTruthy();
      expect(snippet).not.toContain("\n");
      expect(snippet.length, `${toolName} promptSnippet should stay concise`).toBeLessThanOrEqual(140);
      expect(systemPrompt).toContain(`- ${toolName}: ${snippet}`);

      const guidelines = guidelinesByTool[toolName];
      expect(guidelines.length, `${toolName} promptGuidelines`).toBeGreaterThan(0);
      for (const guideline of guidelines) {
        expect(guideline.toLowerCase(), `${toolName} guideline should name its tool`).toContain(toolName.toLowerCase());
        expect(guideline, `${toolName} guideline should avoid ambiguous phrasing`).not.toMatch(/\bthis tool\b/i);
        expect(systemPrompt).toContain(`- ${guideline}`);
      }
    }
  }, 20_000);

  it("pins exact descriptions and recursive schema shape at createAgentSession", async () => {
    vi.doMock("node:child_process", async () => ({
      ...(await vi.importActual<any>("node:child_process")),
      execFileSync: vi.fn(() => Buffer.from("0.111.0\n")),
    }));
    const result = await collectHashlineSystemPromptMetadata([...EXPECTED_TOOLS]);
    expect(Object.fromEntries(Object.entries(result.toolMetadata).map(([name, value]) => [name, value.description]))).toEqual({
      read: "Read text files/images by path; text has LINE:HASH anchors, images return attachments.",
      edit: "Edit existing text files using fresh LINE:HASH anchors from read, grep, ast_search, or write.",
      grep: "Search file contents; non-summary results include LINE:HASH anchors for edits.",
      find: "Find files by glob, respecting .gitignore.",
      ls: "List one directory.",
      write: "Create or overwrite a file and return anchors.",
      ast_search: "Search code by AST pattern and return anchored matches.",
      nu: "Run Nushell for structured data, filesystem metadata, and system inspection.",
    });
    expect(Object.fromEntries(Object.entries(result.toolMetadata).map(([name, value]) => [name, shapeHash(value.parameters)]))).toEqual({
      read: "a9d8541a597d253c1f70b7b64131ba6026736a51ac53d2d8f18f6d99cd0260e1",
      edit: "36073166c66d6472e6a3ae6f69f37e3eb9c6fe4f63ae36cf772d22a7f3f3a722",
      grep: "faedaf6195927d2d913ceb59810d482eac2e115222c15efe146af1f8ad05a628",
      find: "247632b32900649e12b678f0c3f779fc5ceeb690e19b8debbc58ce735638066e",
      ls: "89a12ee46fb16c17afc09daa8fabe30fb8b9fc5775cd2c3eb51c94b0e8aa5155",
      write: "8f384a7a9aa8f7500557000862e272ca3bcb4a46186e51fd315df48d9524cabb",
      ast_search: "fd80e4f7aba79c5defd94f20193a90298420d1b19065e06f66c9e2eed3ca513c",
      nu: "ddd52ebf838431dbfc0b01ca206d1ecd618207b0a5958e64f7f6d73f9349140a",
    });
    expect(Object.fromEntries(Object.entries(result.toolMetadata).map(([name, value]) => [name, value.parameterDescriptions]))).toEqual({
      read: {
        "$.properties.path": "File path",
        "$.properties.offset.anyOf[0]": "Positive 1-indexed int or base-10 string; not with symbol",
        "$.properties.offset.anyOf[1]": "Positive 1-indexed int or base-10 string; not with symbol",
        "$.properties.limit.anyOf[0]": "Positive int or obvious base-10 numeric string",
        "$.properties.limit.anyOf[1]": "Positive int or obvious base-10 numeric string",
        "$.properties.symbol": "Non-empty; may combine with limit, map, or local bundle",
        "$.properties.map": "Append map; valid with symbol, limit, and local bundle",
        "$.properties.bundle": "local; requires symbol; valid with limit and map",
      },
      edit: {
        "$.properties.path": "Existing file path; requires fresh session anchors",
        "$.properties.edits": "Non-empty; each item has exactly one supported variant",
        "$.properties.edits.items": "Overlaps reject; set_line last wins; safe insert_after ok",
        "$.properties.edits.items.anyOf[0].properties.set_line.properties.anchor": "Fresh LINE:HASH anchor",
        "$.properties.edits.items.anyOf[1].properties.replace_lines.properties.start_anchor": "Fresh LINE:HASH start anchor",
        "$.properties.edits.items.anyOf[1].properties.replace_lines.properties.end_anchor": "Fresh LINE:HASH end anchor",
        "$.properties.edits.items.anyOf[2].properties.insert_after.properties.anchor": "Fresh LINE:HASH anchor",
        "$.properties.edits.items.anyOf[3].properties.replace.properties.old_text": "Non-empty exact target text",
        "$.properties.edits.items.anyOf[4].properties.replace_symbol.properties.new_body": "Non-blank complete symbol body",
        "$.properties.edits.items.anyOf[5]": "Do not use — Wrap as { replace: {old_text, new_text} }.",
        "$.properties.postEditVerify": "Verify persisted content after write",
      },
      grep: {
        "$.properties.pattern": "Pattern to search", "$.properties.path": "Search path", "$.properties.glob": "Glob filter",
        "$.properties.ignoreCase": "Ignore case", "$.properties.literal": "Treat pattern literally",
        "$.properties.context.anyOf[0]": "Non-negative int or obvious base-10 numeric string",
        "$.properties.context.anyOf[1]": "Non-negative int or obvious base-10 numeric string",
        "$.properties.limit.anyOf[0]": "Positive int or obvious base-10 numeric string",
        "$.properties.limit.anyOf[1]": "Positive int or obvious base-10 numeric string",
        "$.properties.summary": "Per-file counts only; no edit anchors", "$.properties.scope": "symbol only; enables scopeContext",
        "$.properties.scopeContext.anyOf[0]": "Non-negative int/base-10 string; requires scope: symbol",
        "$.properties.scopeContext.anyOf[1]": "Non-negative int/base-10 string; requires scope: symbol",
      },
      find: {
        "$.properties.pattern": "Glob/basename; JavaScript regex when regex is true", "$.properties.path": "Directory search root",
        "$.properties.limit": "Positive int or obvious base-10 numeric string", "$.properties.type": "Entry type filter",
        "$.properties.maxDepth": "Non-negative int; runtime also accepts base-10 strings", "$.properties.regex": "If true, pattern must be a valid JavaScript regex",
        "$.properties.sortBy": "Sort key", "$.properties.reverse": "Reverse sort order", "$.properties.modifiedSince": "ISO date/time or Nm, Nh, Nd relative age",
        "$.properties.minSize": "Non-negative bytes or B/K/KB/M/MB/G/GB size", "$.properties.maxSize": "Non-negative bytes or B/K/KB/M/MB/G/GB size",
      },
      ls: { "$.properties.path": "One directory path", "$.properties.limit": "Positive int or obvious base-10 numeric string", "$.properties.glob": "Entry glob with balanced brackets and braces" },
      write: { "$.properties.path": "New or existing file path; fully overwrites target", "$.properties.content": "Complete content; bare CR refused; binary gets no anchors", "$.properties.map": "Request a structural map after writing" },
      ast_search: {
        "$.properties.pattern": "ast-grep structural pattern", "$.properties.lang": "Language hint", "$.properties.path": "Search path",
        "$.properties.limit.anyOf[0]": "Positive int or obvious base-10 numeric string", "$.properties.limit.anyOf[1]": "Positive int or obvious base-10 numeric string",
      },
      nu: { "$.properties.command": "Nushell script", "$.properties.timeout": "Seconds; default 30" },
    });
    for (const [name, value] of Object.entries(result.toolMetadata)) {
      expect(value.description).not.toContain("\n"); expect(value.description.length).toBeLessThanOrEqual(100);
      expect(result.snippets[name]).not.toContain("\n"); expect(result.snippets[name].length).toBeLessThanOrEqual(140);
      expect(result.guidelinesByTool[name].length).toBeLessThanOrEqual(2);
      for (const guideline of result.guidelinesByTool[name]) { expect(guideline).not.toContain("\n"); expect(guideline.length).toBeLessThanOrEqual(96); }
      for (const text of Object.values(value.parameterDescriptions)) expect(text.length).toBeLessThanOrEqual(58);
    }
    const fullPromptOnly = "Very long single lines are truncated in the displayed output at 500 characters";
    expect(readFileSync("prompts/read.md", "utf8")).toContain(fullPromptOnly);
    expect(result.systemPrompt).not.toContain(fullPromptOnly);
    expect(JSON.stringify(result.toolMetadata)).not.toContain(fullPromptOnly);
  }, 20_000);
});
