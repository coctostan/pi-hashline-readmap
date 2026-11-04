export interface LocateTask {
  id: string;
  prompt: string;
  /** Apply the reference solution to an extracted snapshot. */
  solve(root: string): void;
  /** The checker's failures for a workspace; empty means it passes. */
  check(root: string): Promise<string[]>;
}
export const SNAPSHOT: string;
export const TASKS: LocateTask[];
export function extractSnapshot(dir: string): void;
