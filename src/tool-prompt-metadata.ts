import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";


const COMPACT_DESCRIPTIONS: Record<string, string> = {
  "read.md": "Read text files/images by path; text has LINE:HASH anchors, images return attachments.",
  "edit.md": "Edit existing text files using fresh LINE:HASH anchors from read, grep, ast_search, or write.",
  "grep.md": "Search file contents; non-summary results include LINE:HASH anchors for edits.",
  "find.md": "Find files by glob, respecting .gitignore.",
  "ls.md": "List one directory.",
  "write.md": "Create or overwrite a file and return anchors.",
  "sg.md": "Search code by AST pattern and return anchored matches.",
  "nu.md": "Run Nushell for structured data, filesystem metadata, and system inspection.",
};


const COMPACT_GUIDELINES: Record<string, string[]> = {
  "read.md": [
    "Use read for file contents, images/screenshots, ranges, symbols, and edit anchors.",
    "Use read for images; it returns attachments, so avoid OCR tools unless explicitly needed.",
  ],
  "edit.md": [
    "Use edit with fresh LINE:HASH anchors for existing files.",
    "Use edit replace only when anchored edits are impractical.",
  ],
  "grep.md": [
    "Use grep for text search and edit-ready matching anchors.",
    "Use grep summary mode when only file counts are needed.",
  ],
  "find.md": [
    "Use find for recursive file discovery by glob.",
  ],
  "ls.md": [
    "Use ls to list one directory, optionally with a glob filter.",
  ],
  "write.md": [
    "Use write to create files or intentionally overwrite whole files.",
    "Use edit rather than write for small changes to existing files.",
  ],
  "sg.md": [
    "Use ast_search for AST-shaped code patterns.",
  ],
  "nu.md": [
    "Use nu for structured data, filesystem metadata, and system inspection.",
  ],
};

export interface ToolPromptMetadata {
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
}

export function loadPrompt(promptUrl: URL): string {
  return readFileSync(promptUrl, "utf-8")
    .replaceAll("{{DEFAULT_MAX_LINES}}", String(DEFAULT_MAX_LINES))
    .replaceAll("{{DEFAULT_MAX_BYTES}}", formatSize(DEFAULT_MAX_BYTES))
    .trim();
}

export function firstPromptParagraph(prompt: string): string {
  return prompt.split(/\n\s*\n/, 1)[0]?.trim() ?? prompt;
}


function promptFileName(promptUrl: URL): string {
  return promptUrl.pathname.split("/").pop() ?? "";
}

export function defineToolPromptMetadata(options: {
  promptUrl: URL;
  promptSnippet: string;
  promptGuidelines: string[];
}): ToolPromptMetadata {
  const prompt = loadPrompt(options.promptUrl);
  const fileName = promptFileName(options.promptUrl);
  const compactDescription = COMPACT_DESCRIPTIONS[fileName];
  return {
    description: compactDescription ?? firstPromptParagraph(prompt),
    promptSnippet: options.promptSnippet,
    promptGuidelines: COMPACT_GUIDELINES[fileName] ?? options.promptGuidelines,
  };
}
