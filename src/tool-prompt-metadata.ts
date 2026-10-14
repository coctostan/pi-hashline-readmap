import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";


const COMPACT_DESCRIPTIONS: Record<string, string> = {
  "read.md": "Read files/images; LINE:HASH text anchors, image attachments.",
  "edit.md": "Edit via fresh LINE:HASH; copy_lines/move_lines.",
  "grep.md": "Grep text; non-summary LINE:HASH anchors.",
  "find.md": "Find files by glob, respecting .gitignore; entries are relative to resolved search root.",
  "ls.md": "List one directory; entry names are basenames of the returned resolved path.",
  "write.md": "Write files; return anchors.",
  "sg.md": "ast-grep search; return anchors.",
  "nu.md": "Deprecated Nu; prefer file tools + codemode.",
};


const COMPACT_GUIDELINES: Record<string, string[]> = {
  "read.md": [
    "Read files/images, ranges, symbols, edit anchors.",
    "Read images as attachments; OCR only if needed.",
    "Project read fields; image() forwards images; never print base64.",
  ],
  "edit.md": [
    "Edit existing files with fresh LINE:HASH.",
    "Edit: copy_lines/move_lines; replace only if anchors fail.",
    "Serialize same-file edits; reacquire anchors after mutations.",
  ],
  "grep.md": [
    "Grep text for edit-ready anchors.",
    "Grep summary for file counts.",
    "Check grep completeness and omittedMatches before exhaustive claims.",
  ],
  "find.md": [
    "Find files recursively by glob.",
    "Join find entries to resolved path (default cwd) before read/edit; relative roots use cwd.",
  ],
  "ls.md": [
    "Ls one directory; optional glob.",
    "Join ls result.path with entries[].name before read/edit.",
  ],
  "write.md": [
    "Write new files or intentionally overwrite whole files.",
    "Use edit, not write, for small changes.",
  ],
  "sg.md": [
    "Use ast_search for AST patterns.",
  ],
  "nu.md": [
    "Deprecated nu: prefer read/grep/ast_search, find/ls, and codemode; use bash for CLIs.",
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
