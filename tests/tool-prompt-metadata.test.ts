import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@earendil-works/pi-coding-agent";
import assert from "node:assert/strict";
import { defineToolPromptMetadata } from "../src/tool-prompt-metadata.js";

type ToolDefinition = {
  name: string;
  description?: unknown;
  promptSnippet?: unknown;
  promptGuidelines?: unknown;
};

function createMockPi() {
  return {
    registerTool: vi.fn(),
    events: { emit: vi.fn(), on: vi.fn() },
    on: vi.fn(),
  };
}

function firstParagraph(promptPath: string): string {
  return readFileSync(resolve(promptPath), "utf8")
    .replaceAll("{{DEFAULT_MAX_LINES}}", String(DEFAULT_MAX_LINES))
    .replaceAll("{{DEFAULT_MAX_BYTES}}", formatSize(DEFAULT_MAX_BYTES))
    .trim()
    .split(/\n\s*\n/, 1)[0]
    ?.trim() ?? "";
}

function assertPromptMetadata(tool: ToolDefinition, promptPath: string, toolName: string) {
  expect(typeof tool.description).toBe("string");
  expect((tool.description as string).length).toBeGreaterThan(0);
  expect(tool.description).not.toContain("\n\n");
  expect(firstParagraph(promptPath).length).toBeGreaterThan(0);

  expect(typeof tool.promptSnippet).toBe("string");
  expect((tool.promptSnippet as string).length).toBeGreaterThan(0);

  expect(Array.isArray(tool.promptGuidelines)).toBe(true);
  const guidelines = tool.promptGuidelines as string[];
  expect(guidelines.length).toBeGreaterThan(0);
  for (const guideline of guidelines) {
    expect(typeof guideline).toBe("string");
    expect(guideline.length).toBeGreaterThan(0);
    expect(guideline.toLowerCase()).toContain(toolName.toLowerCase());
    expect(guideline).not.toMatch(/\bthis tool\b/i);
  }
}

describe("stock pi prompt metadata", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("node:child_process");
  });

  it("exposes snippets, flat guidelines, and first-paragraph descriptions for hashline tools", async () => {
    const pi = createMockPi();

    const { registerReadTool } = await import("../src/read.js");
    const { registerEditTool } = await import("../src/edit.js");
    const { registerGrepTool } = await import("../src/grep.js");
    const { registerFindTool } = await import("../src/find.js");
    const { registerLsTool } = await import("../src/ls.js");
    const { registerWriteTool } = await import("../src/write.js");
    const { registerSgTool } = await import("../src/sg.js");

    const tools = [
      { tool: registerReadTool(pi as any), promptPath: "prompts/read.md", toolName: "read" },
      { tool: registerEditTool(pi as any), promptPath: "prompts/edit.md", toolName: "edit" },
      { tool: registerGrepTool(pi as any), promptPath: "prompts/grep.md", toolName: "grep" },
      { tool: registerFindTool(pi as any), promptPath: "prompts/find.md", toolName: "find" },
      { tool: registerLsTool(pi as any), promptPath: "prompts/ls.md", toolName: "ls" },
      { tool: registerWriteTool(pi as any), promptPath: "prompts/write.md", toolName: "write" },
      { tool: registerSgTool(pi as any), promptPath: "prompts/sg.md", toolName: "ast_search" },
    ];

    for (const { tool, promptPath, toolName } of tools) {
      assertPromptMetadata(tool, promptPath, toolName);
    }
  });

  it("keeps nu metadata consistent with stock pi's flat prompt surface", async () => {
    vi.doMock("node:child_process", async () => ({
      ...(await vi.importActual<any>("node:child_process")),
      execFileSync: vi.fn(() => Buffer.from("0.111.0\n")),
    }));
    const { registerNuTool } = await import("../src/nu.js");
    const pi = { registerTool: vi.fn() };
    const tool = registerNuTool(pi as any);
    assert.ok(tool);
    assert.match(tool.description, /Deprecated/);
    expect(tool.promptGuidelines).toEqual([
      "Deprecated nu: prefer read/grep/ast_search, find/ls, and codemode; use bash for CLIs.",
    ]);
    assertPromptMetadata(tool as ToolDefinition, "prompts/nu.md", "nu");
  });
});


describe("compact provider-visible descriptions", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("node:child_process");
  });

  it("uses compact registered descriptions for scoped hashline tools", async () => {
    vi.doMock("node:child_process", async () => {
      const actual = await vi.importActual<any>("node:child_process");
      return {
        ...actual,
        execFileSync: vi.fn(() => Buffer.from("0.111.0\n")),
      };
    });

    const pi = createMockPi();
    const { registerReadTool } = await import("../src/read.js");
    const { registerEditTool } = await import("../src/edit.js");
    const { registerGrepTool } = await import("../src/grep.js");
    const { registerFindTool } = await import("../src/find.js");
    const { registerLsTool } = await import("../src/ls.js");
    const { registerWriteTool } = await import("../src/write.js");
    const { registerSgTool } = await import("../src/sg.js");
    const { registerNuTool } = await import("../src/nu.js");

    const tools = {
      read: registerReadTool(pi as any),
      edit: registerEditTool(pi as any),
      grep: registerGrepTool(pi as any),
      find: registerFindTool(pi as any),
      ls: registerLsTool(pi as any),
      write: registerWriteTool(pi as any),
      ast_search: registerSgTool(pi as any),
      nu: registerNuTool(pi as any),
    };

    expect(tools.read.description).toBe("Read text files/images by path; text has LINE:HASH anchors, images return attachments.");
    expect(tools.edit.description).toBe("Edit files with fresh LINE:HASH anchors; copy or move existing lines with copy_lines/move_lines.");
    expect(tools.grep.description).toBe("Search file contents; non-summary results include LINE:HASH anchors for edits.");
    expect(tools.find.description).toBe("Find files by glob, respecting .gitignore.");
    expect(tools.ls.description).toBe("List one directory.");
    expect(tools.write.description).toBe("Create or overwrite a file and return anchors.");
    expect(tools.ast_search.description).toBe("Search code by AST pattern and return anchored matches.");
    expect((tools.nu as ToolDefinition).description).toBe("Deprecated bundled Nushell tool; prefer file tools plus codemode for general exploration.");

    for (const [name, tool] of Object.entries(tools)) {
      expect(typeof (tool as ToolDefinition).description, name).toBe("string");
      expect(((tool as ToolDefinition).description as string).length, name).toBeLessThanOrEqual(100);
    }
  });
});


function collectSchemaDescriptions(schema: any): string[] {
  if (!schema || typeof schema !== "object") return [];
  const descriptions: string[] = [];
  if (typeof schema.description === "string") descriptions.push(schema.description);
  for (const value of Object.values(schema)) {
    if (Array.isArray(value)) {
      for (const item of value) descriptions.push(...collectSchemaDescriptions(item));
    } else if (value && typeof value === "object") {
      descriptions.push(...collectSchemaDescriptions(value));
    }
  }
  return descriptions;
}

describe("compact read and mutation parameter metadata", () => {
  it("uses short provider-visible parameter descriptions for read, edit, and write", async () => {
    const pi = createMockPi();
    const { registerReadTool } = await import("../src/read.js");
    const { registerEditTool } = await import("../src/edit.js");
    const { registerWriteTool } = await import("../src/write.js");

    const tools = [
      registerReadTool(pi as any),
      registerEditTool(pi as any),
      registerWriteTool(pi as any),
    ];

    for (const tool of tools) {
      const descriptions = collectSchemaDescriptions((tool as any).parameters);
      expect(descriptions.length, tool.name).toBeGreaterThan(0);
      for (const description of descriptions) {
        expect(description.length, `${tool.name}: ${description}`).toBeLessThanOrEqual(58);
        expect(description, `${tool.name}: ${description}`).not.toMatch(/e\.g\.|example|Default false|relative or absolute/i);
      }
    }
  });
});


describe("compact discovery and search parameter metadata", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("node:child_process");
  });

  it("uses short provider-visible parameter descriptions for grep, find, ls, ast_search, and nu", async () => {
    vi.doMock("node:child_process", async () => {
      const actual = await vi.importActual<any>("node:child_process");
      return {
        ...actual,
        execFileSync: vi.fn(() => Buffer.from("0.111.0\n")),
      };
    });

    const pi = createMockPi();
    const { registerGrepTool } = await import("../src/grep.js");
    const { registerFindTool } = await import("../src/find.js");
    const { registerLsTool } = await import("../src/ls.js");
    const { registerSgTool } = await import("../src/sg.js");
    const { registerNuTool } = await import("../src/nu.js");

    const tools = [
      registerGrepTool(pi as any),
      registerFindTool(pi as any),
      registerLsTool(pi as any),
      registerSgTool(pi as any),
      registerNuTool(pi as any),
    ];

    for (const tool of tools) {
      const toolDefinition = tool as ToolDefinition;
      const descriptions = collectSchemaDescriptions((toolDefinition as any).parameters);
      expect(descriptions.length, toolDefinition.name).toBeGreaterThan(0);
      for (const description of descriptions) {
        expect(description.length, `${toolDefinition.name}: ${description}`).toBeLessThanOrEqual(58);
        expect(description, `${toolDefinition.name}: ${description}`).not.toMatch(/e\.g\.|example|Combined with|JavaScript regular expression|Defaults to/i);
      }
    }
  });
});


describe("compact provider-visible prompt guidelines", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("node:child_process");
  });

  it("exposes only short tool-specific provider-visible guidelines", async () => {
    vi.doMock("node:child_process", async () => {
      const actual = await vi.importActual<any>("node:child_process");
      return {
        ...actual,
        execFileSync: vi.fn(() => Buffer.from("0.111.0\n")),
      };
    });

    const pi = createMockPi();
    const { registerReadTool } = await import("../src/read.js");
    const { registerEditTool } = await import("../src/edit.js");
    const { registerGrepTool } = await import("../src/grep.js");
    const { registerFindTool } = await import("../src/find.js");
    const { registerLsTool } = await import("../src/ls.js");
    const { registerWriteTool } = await import("../src/write.js");
    const { registerSgTool } = await import("../src/sg.js");
    const { registerNuTool } = await import("../src/nu.js");

    const tools = [
      registerReadTool(pi as any),
      registerEditTool(pi as any),
      registerGrepTool(pi as any),
      registerFindTool(pi as any),
      registerLsTool(pi as any),
      registerWriteTool(pi as any),
      registerSgTool(pi as any),
      registerNuTool(pi as any),
    ];

    for (const tool of tools) {
      const toolDefinition = tool as ToolDefinition;
      const guidelines = toolDefinition.promptGuidelines as string[];
      expect(guidelines.length, toolDefinition.name).toBeGreaterThan(0);
      expect(guidelines.length, toolDefinition.name).toBeLessThanOrEqual(
        ["read", "edit", "grep"].includes(toolDefinition.name) ? 3 : 2,
      );
      for (const guideline of guidelines) {
        expect(guideline.length, `${toolDefinition.name}: ${guideline}`).toBeLessThanOrEqual(96);
        expect(guideline.toLowerCase(), `${toolDefinition.name}: ${guideline}`).toContain(toolDefinition.name.toLowerCase());
        expect(guideline, `${toolDefinition.name}: ${guideline}`).not.toMatch(/\| Task \| Tool \||graph tools|NOT this|Do NOT|examples?|instead of bash grep or rg/i);
      }
    }
  });


  it("keeps dynamic grep AST guidance compact", async () => {
    const pi = createMockPi();
    const { registerGrepTool } = await import("../src/grep.js");

    const tool = registerGrepTool(pi as any, {
      astSearchGuideline: "Use grep summary for counts; use ast_search for structural code patterns.",
    }) as ToolDefinition;
    const guidelines = tool.promptGuidelines as string[];
    assert.ok(
      guidelines.includes("In codemode, check grep completeness and omittedMatches before claiming exhaustive results."),
      "Registered grep lost codemode completeness guidance",
    );
    expect(guidelines).toEqual([
      "Use grep for text search and edit-ready matching anchors.",
      "Use grep summary for counts; use ast_search for structural code patterns.",
      "In codemode, check grep completeness and omittedMatches before claiming exhaustive results.",
    ]);

    expect(guidelines.join("\n").toLowerCase()).toContain("summary");
    expect(guidelines.length).toBeLessThanOrEqual(3);
    for (const guideline of guidelines) {
      expect(guideline.length, guideline).toBeLessThanOrEqual(96);
      expect(guideline.toLowerCase(), guideline).toContain("grep");
    }
  });
});

it("adds only compact codemode reminders without removing safety rules", () => {
  const expected: Record<string, string[]> = {
    read: [
      "Use read for file contents, images/screenshots, ranges, symbols, and edit anchors.",
      "Use read for images; it returns attachments, so avoid OCR tools unless explicitly needed.",
      "In codemode, project read fields; forward images with image(), never print base64.",
    ],
    edit: [
      "Use edit with fresh LINE:HASH anchors for existing files.",
      "Copy/move lines with edit copy_lines/move_lines; use edit replace only if anchors fail.",
      "Serialize dependent same-file edit calls; reacquire fresh anchors after mutations.",
    ],
    grep: [
      "Use grep for text search and edit-ready matching anchors.",
      "Use grep summary mode when only file counts are needed.",
      "In codemode, check grep completeness and omittedMatches before claiming exhaustive results.",
    ],
  };
  for (const [name, guidelines] of Object.entries(expected)) {
    const metadata = defineToolPromptMetadata({
      promptUrl: new URL("../prompts/" + name + ".md", import.meta.url),
      promptSnippet: name, promptGuidelines: [],
    });
    assert.ok(metadata.promptGuidelines.includes(guidelines[2]), "Compact codemode guideline missing");
    assert.deepEqual(metadata.promptGuidelines, guidelines);
    for (const guideline of guidelines) assert.ok(guideline.length <= 96);
  }
});
