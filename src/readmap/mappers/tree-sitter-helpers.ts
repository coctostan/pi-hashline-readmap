import type { Node as SyntaxNode } from "web-tree-sitter";

/**
 * Shared low-level helpers for tree-sitter-based structural mappers
 * (rust.ts, cpp.ts, java.ts, and future C/Swift mappers in #194).
 */

export function normalizeWhitespace(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

export function getNodeText(node: SyntaxNode, source: string): string {
  return source.slice(node.startIndex, node.endIndex);
}

export function getLineRange(node: SyntaxNode): {
  startLine: number;
  endLine: number;
} {
  return {
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
  };
}

export function findFirstDescendant(
  node: SyntaxNode,
  types: string[]
): SyntaxNode | null {
  const stack = [...node.namedChildren];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    if (types.includes(current.type)) {
      return current;
    }
    for (const child of current.namedChildren) {
      stack.push(child);
    }
  }
  return null;
}

/**
 * Shared signature kernel: strip a single trailing semicolon (with trailing
 * whitespace) then collapse/trim whitespace. Matches the tail of the current
 * Rust and C++ formatSignature implementations exactly.
 */
export function finalizeSignature(text: string): string {
  return normalizeWhitespace(text.replace(/;\s*$/, ""));
}
