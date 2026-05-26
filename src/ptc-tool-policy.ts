export type HashlineToolName =
  | "read"
  | "grep"
  | "ast_search"
  | "edit"
  | "write"
  | "ls"
  | "find"
  | "nu";

export type HashlineToolMutability = "read-only" | "mutating";

export type HashlineToolDefaultExposure =
  | "safe-by-default"
  | "opt-in"
  | "not-safe-by-default";

export interface HashlineToolPtcPolicyEntry {
  toolName: HashlineToolName;
  helperName: string;
  overridesBuiltin: boolean;
  mutability: HashlineToolMutability;
  defaultExposure: HashlineToolDefaultExposure;
}

export interface HashlineToolPtcPolicy {
  version: 1;
  tools: Record<HashlineToolName, HashlineToolPtcPolicyEntry>;
}

export const HASHLINE_TOOL_PTC_POLICY: HashlineToolPtcPolicy = {
  version: 1,
  tools: {
    read: {
      toolName: "read",
      helperName: "read",
      overridesBuiltin: true,
      mutability: "read-only",
      defaultExposure: "safe-by-default",
    },
    grep: {
      toolName: "grep",
      helperName: "grep",
      overridesBuiltin: true,
      mutability: "read-only",
      defaultExposure: "safe-by-default",
    },
    ast_search: {
      toolName: "ast_search",
      helperName: "ast_search",
      overridesBuiltin: false,
      mutability: "read-only",
      defaultExposure: "opt-in",
    },
    edit: {
      toolName: "edit",
      helperName: "edit",
      overridesBuiltin: true,
      mutability: "mutating",
      defaultExposure: "not-safe-by-default",
    },
    write: {
      toolName: "write",
      helperName: "write",
      overridesBuiltin: true,
      mutability: "mutating",
      defaultExposure: "not-safe-by-default",
    },
    ls: {
      toolName: "ls",
      helperName: "ls",
      overridesBuiltin: true,
      mutability: "read-only",
      defaultExposure: "safe-by-default",
    },
    find: {
      toolName: "find",
      helperName: "find",
      overridesBuiltin: true,
      mutability: "read-only",
      defaultExposure: "safe-by-default",
    },
    nu: {
      toolName: "nu",
      helperName: "nu",
      overridesBuiltin: false,
      mutability: "read-only",
      defaultExposure: "opt-in",
    },
  },
};

export function getHashlineToolPtcPolicy(): HashlineToolPtcPolicy {
  return HASHLINE_TOOL_PTC_POLICY;
}
