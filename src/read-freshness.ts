import { normalizePathForContextHygiene } from "./context-hygiene.js";

export interface ReadFreshness {
  note(absolutePath: string): void;
  has(absolutePath: string): boolean;
  /** A change whose result is not the model's view of the file: its live anchors are gone. */
  expirePath(absolutePath: string): void;
}

// Tracks which files carry live anchors the model may still edit with: those a read / grep /
// ast_search / write / edit result showed. Each change states its effect at its own call: an own
// change marks the file (ServedLines remaps its shifts), and any other change expires it, so no
// ordering between parallel results decides freshness.
export function createReadFreshness(): ReadFreshness {
  const fresh = new Set<string>();
  const key = (absolutePath: string) => normalizePathForContextHygiene(absolutePath);
  return {
    note(absolutePath) {
      fresh.add(key(absolutePath));
    },
    has(absolutePath) {
      return fresh.has(key(absolutePath));
    },
    expirePath(absolutePath) {
      fresh.delete(key(absolutePath));
    },
  };
}
