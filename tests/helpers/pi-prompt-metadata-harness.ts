import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { registerFauxProvider } from "@earendil-works/pi-ai/compat";

type RegisteredToolMetadata = {
  description: string;
  parameterDescriptions: Record<string, string>;
  parameters: unknown;
};

type PromptMetadataResult = {
  systemPrompt: string;
  snippets: Record<string, string>;
  guidelinesByTool: Record<string, string[]>;
  activeToolNames: string[];
  toolMetadata: Record<string, RegisteredToolMetadata>;
};

function normalizePromptSnippet(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizePromptGuidelines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function collectParameterDescriptions(
  value: unknown,
  path = "$",
  output: Record<string, string> = {},
): Record<string, string> {
  if (!value || typeof value !== "object") return output;
  const node = value as Record<string, unknown>;
  if (typeof node.description === "string") output[path] = node.description;
  for (const [key, child] of Object.entries(node)) {
    if (key === "description") continue;
    if (Array.isArray(child)) {
      child.forEach((item, index) => collectParameterDescriptions(item, `${path}.${key}[${index}]`, output));
    } else if (child && typeof child === "object") {
      collectParameterDescriptions(child, `${path}.${key}`, output);
    }
  }
  return output;
}

export async function collectHashlineSystemPromptMetadata(activeTools: string[]): Promise<PromptMetadataResult> {
  const cwd = process.cwd();
  const agentDir = mkdtempSync(join(tmpdir(), "pi-hashline-prompt-metadata-"));
  const faux = registerFauxProvider({ models: [{ id: "prompt-metadata-test" }] });
  let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;

  try {
    const { default: extensionFactory } = await import("../../index.js");
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      extensionFactories: [extensionFactory],
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await resourceLoader.reload();

    const created = await createAgentSession({
      cwd,
      agentDir,
      model: faux.getModel(),
      resourceLoader,
      sessionManager: SessionManager.inMemory(cwd),
      tools: activeTools,
    });
    session = created.session;
    session.setActiveToolsByName(activeTools);

    const snippets: Record<string, string> = {};
    const guidelinesByTool: Record<string, string[]> = {};
    const toolMetadata: Record<string, RegisteredToolMetadata> = {};

    for (const toolName of activeTools) {
      const definition = session.getToolDefinition(toolName) as (ToolDefinition & {
        promptSnippet?: unknown;
        promptGuidelines?: unknown;
      }) | undefined;
      if (!definition) throw new Error(`Expected active Pi session to expose tool ${toolName}`);

      const description = typeof definition.description === "string" ? definition.description : "";
      if (!description) throw new Error(`Expected ${toolName} to expose a non-empty description`);
      toolMetadata[toolName] = {
        description,
        parameterDescriptions: collectParameterDescriptions(definition.parameters),
        parameters: definition.parameters,
      };

      const snippet = normalizePromptSnippet(definition.promptSnippet);
      if (!snippet) throw new Error(`Expected ${toolName} to expose a non-empty promptSnippet`);
      snippets[toolName] = snippet;

      const guidelines = normalizePromptGuidelines(definition.promptGuidelines);
      if (guidelines.length === 0) throw new Error(`Expected ${toolName} to expose non-empty promptGuidelines`);
      guidelinesByTool[toolName] = guidelines;
    }

    return {
      systemPrompt: session.systemPrompt,
      snippets,
      guidelinesByTool,
      toolMetadata,
      activeToolNames: session.getActiveToolNames(),
    };
  } finally {
    session?.dispose();
    faux.unregister();
    rmSync(agentDir, { recursive: true, force: true });
  }
}
