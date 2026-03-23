const VARIANT_KEYS = ["set_line", "replace_lines", "insert_after", "replace"] as const;

export type EditTypeCounts = {
  set_line: number;
  replace_lines: number;
  insert_after: number;
  replace: number;
  total: number;
};

export function countEditTypes(edits: unknown[] | undefined): EditTypeCounts {
  const counts: EditTypeCounts = {
    set_line: 0,
    replace_lines: 0,
    insert_after: 0,
    replace: 0,
    total: 0,
  };
  if (!edits) return counts;
  for (const edit of edits) {
    counts.total++;
    if (edit && typeof edit === "object") {
      for (const key of VARIANT_KEYS) {
        if (key in edit) {
          counts[key]++;
          break;
        }
      }
    }
  }
  return counts;
}

export interface DiffStats {
  added: number;
  removed: number;
}

export function parseDiffStats(diff: string | undefined): DiffStats {
  if (!diff) return { added: 0, removed: 0 };
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { added, removed };
}

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
  if (Array.isArray(args?.edits) && args!.edits.length > 0) {
    const counts = countEditTypes(args!.edits as unknown[]);
    const parts: string[] = [];
    for (const key of ["set_line", "replace_lines", "insert_after", "replace"] as const) {
      if (counts[key] > 0) {
        parts.push(`${counts[key]} ${key}`);
      }
    }
    const word = counts.total === 1 ? "edit" : "edits";
    const suffix = `${counts.total} ${word} (${parts.join(", ")})`;
    return { path: rawPath, suffix };
  }

  // Legacy oldText/newText or old_text/new_text
  const hasLegacy =
    (typeof args?.oldText === "string" && typeof args?.newText === "string") ||
    (typeof args?.old_text === "string" && typeof args?.new_text === "string");
  if (hasLegacy) {
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

  // Error text (only for errors)
  const showErrorText = isError ? errorText : undefined;

  return {
    diffStats,
    noOp: isNoOp,
    warningsBadge,
    errorText: showErrorText,
  };
}