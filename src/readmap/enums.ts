/**
 * Symbol kinds supported by mappers.
 */
export enum SymbolKind {
  Class = "class",
  Function = "function",
  Method = "method",
  Variable = "variable",
  Constant = "constant",
  Interface = "interface",
  Type = "type",
  Enum = "enum",
  Struct = "struct",
  Import = "import",
  Module = "module",
  Namespace = "namespace",
  Property = "property",
  Heading = "heading",
  Table = "table",
  View = "view",
  Procedure = "procedure",
  Trigger = "trigger",
  Index = "index",
  Schema = "schema",
  Unknown = "unknown",
}

/**
 * Detail levels for map generation.
 */
export enum DetailLevel {
  Full = "full",
  Compact = "compact",
  Minimal = "minimal",
  Outline = "outline",
  Truncated = "truncated",
}
