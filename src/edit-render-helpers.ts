export interface EditCallTextResult {
  path: string | null;
  suffix: string | undefined;
}

export function formatEditCallText(
  args: Record<string, unknown> | undefined,
  argsComplete: boolean,
): EditCallTextResult {
  const rawPath = typeof args?.path === "string" ? args.path : null;

  if (!argsComplete) {
    return { path: rawPath, suffix: undefined };
  }

  // Hashline edits[] mode
  if (Array.isArray(args?.edits) && (args!.edits as unknown[]).length > 0) {
    const editsList = args!.edits as Record<string, unknown>[];
    const counts: Record<string, number> = {};
    let total = 0;
    for (const e of editsList) {
      if ("set_line" in e) counts["set_line"] = (counts["set_line"] ?? 0) + 1;
      else if ("replace_lines" in e) counts["replace_lines"] = (counts["replace_lines"] ?? 0) + 1;
      else if ("insert_after" in e) counts["insert_after"] = (counts["insert_after"] ?? 0) + 1;
      else if ("replace" in e) counts["replace"] = (counts["replace"] ?? 0) + 1;
      total++;
    }
    const parts: string[] = [];
    for (const key of ["set_line", "replace_lines", "insert_after", "replace"] as const) {
      if ((counts[key] ?? 0) > 0) {
        parts.push(`${counts[key]} ${key}`);
      }
    }
    const word = total === 1 ? "edit" : "edits";
    const suffix = `${total} ${word} (${parts.join(", ")})`;
    return { path: rawPath, suffix };
  }

  // Legacy oldText/newText or old_text/new_text
  if (
    args?.oldText !== undefined || args?.old_text !== undefined ||
    args?.newText !== undefined || args?.new_text !== undefined
  ) {
    return { path: rawPath, suffix: "replace" };
  }

  return { path: rawPath, suffix: undefined };
}

export interface EditResultTextInput {
  isError: boolean;
  diff: string;
  warnings: string[];
  noopEdits: unknown[];
  errorText: string;
}

export interface EditResultTextOutput {
  diffStats: string | undefined;
  noOp: boolean;
  warningsBadge: string | undefined;
  errorText: string | undefined;
}

function parseDiffStats(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  if (!diff) return { added, removed };
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }
  return { added, removed };
}

export function formatEditResultText(input: EditResultTextInput): EditResultTextOutput {
  const { isError, diff, warnings, noopEdits, errorText } = input;

  // No-op detection: error + noopEdits present OR error text contains "No changes made"
  const isNoOp = isError && (
    (Array.isArray(noopEdits) && noopEdits.length > 0) ||
    errorText.includes("No changes made")
  );

  // Diff stats
  const stats = parseDiffStats(diff);
  const hasDiffStats = stats.added > 0 || stats.removed > 0;
  const diffStats = hasDiffStats ? `+${stats.added} / -${stats.removed}` : undefined;

  // Warnings badge
  let warningsBadge: string | undefined;
  if (warnings.length === 1) {
    warningsBadge = "\u26a0 1 warning";
  } else if (warnings.length > 1) {
    warningsBadge = `\u26a0 ${warnings.length} warnings`;
  }

  // Error text only for error results
  const showErrorText = isError ? errorText : undefined;

  return {
    diffStats,
    noOp: isNoOp,
    warningsBadge,
    errorText: showErrorText,
  };
}