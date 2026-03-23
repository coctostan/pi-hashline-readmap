export interface GrepCallTextResult {
  pattern: string;
  suffix: string | undefined;
}

export function formatGrepCallText(
  args: Record<string, unknown> | undefined,
): GrepCallTextResult {
  const pattern = typeof args?.pattern === "string" ? args.pattern : "";

  const parts: string[] = [];
  if (typeof args?.path === "string" && args.path !== ".") {
    parts.push(args.path as string);
  }
  if (typeof args?.glob === "string") {
    parts.push(args.glob as string);
  }

  return {
    pattern,
    suffix: parts.length > 0 ? parts.join(" ") : undefined,
  };
}

const GREP_TRUNCATION_THRESHOLD = 50;

export interface GrepResultTextInput {
  totalMatches: number;
  summary: boolean;
  records: unknown[];
  fileCount: number;
  hasBinaryWarning?: boolean;
  isError?: boolean;
  errorText?: string;
}

export interface GrepResultTextOutput {
  summary: string;
  badges: string[];
  noMatches: boolean;
  truncated: boolean;
  errorText: string | undefined;
}

export function formatGrepResultText(input: GrepResultTextInput): GrepResultTextOutput {
  // Error case
  if (input.isError && input.errorText) {
    return {
      summary: "",
      badges: [],
      noMatches: false,
      truncated: false,
      errorText: input.errorText,
    };
  }

  const { totalMatches, summary, fileCount } = input;
  const noMatches = totalMatches === 0;
  const truncated = totalMatches >= GREP_TRUNCATION_THRESHOLD;

  const matchWord = totalMatches === 1 ? "match" : "matches";
  const fileWord = fileCount === 1 ? "file" : "files";
  const summaryText = noMatches ? "" : `\u2713 ${totalMatches} ${matchWord} in ${fileCount} ${fileWord}`;

  const badges: string[] = [];
  if (truncated) badges.push("10/file cap");
  if (summary) badges.push("summary");
  if (input.hasBinaryWarning) badges.push("\u26a0 binary");

  return {
    summary: summaryText,
    badges,
    noMatches,
    truncated,
    errorText: undefined,
  };
}