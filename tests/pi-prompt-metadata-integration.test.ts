import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectHashlineSystemPromptMetadata } from "./helpers/pi-prompt-metadata-harness.js";
import { EXPECTED_TOOL_DESCRIPTIONS, EXPECTED_SCHEMA_SHAPES, EXPECTED_PARAMETER_DESCRIPTIONS } from "./helpers/tool-contract-pins.js";

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
    expect(Object.fromEntries(Object.entries(result.toolMetadata)
      .map(([name, value]) => [name, value.description])))
      .toEqual(EXPECTED_TOOL_DESCRIPTIONS);
    expect(Object.fromEntries(Object.entries(result.toolMetadata)
      .map(([name, value]) => [name, shapeHash(value.parameters)])))
      .toEqual(EXPECTED_SCHEMA_SHAPES);
    expect(Object.fromEntries(Object.entries(result.toolMetadata)
      .map(([name, value]) => [name, value.parameterDescriptions])))
      .toEqual(EXPECTED_PARAMETER_DESCRIPTIONS);
    for (const [name, value] of Object.entries(result.toolMetadata)) {
      expect(value.description).not.toContain("\n"); expect(value.description.length).toBeLessThanOrEqual(100);
      expect(result.snippets[name]).not.toContain("\n"); expect(result.snippets[name].length).toBeLessThanOrEqual(140);
      expect(result.guidelinesByTool[name].length).toBeLessThanOrEqual(
        ["read", "edit", "grep"].includes(name) ? 3 : 2,
      );
      for (const guideline of result.guidelinesByTool[name]) { expect(guideline).not.toContain("\n"); expect(guideline.length).toBeLessThanOrEqual(96); }
      for (const text of Object.values(value.parameterDescriptions)) expect(text.length).toBeLessThanOrEqual(58);
    }
    expect(result.guidelinesByTool.grep).toContain(
      "Check grep completeness and omittedMatches before exhaustive claims.",
    );
    const fullPromptOnly = "Very long single lines are truncated in the displayed output at 500 characters";
    expect(readFileSync("prompts/read.md", "utf8")).toContain(fullPromptOnly);
    expect(result.systemPrompt).not.toContain(fullPromptOnly);
    expect(JSON.stringify(result.toolMetadata)).not.toContain(fullPromptOnly);
  }, 20_000);
});
