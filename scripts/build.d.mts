export function verifyBundle(input: { code: string; metafile?: { inputs?: Record<string, unknown> } }): void;
export function buildBundle(options?: {
  rootDir?: string;
  outDir?: string;
  verify?: (input: { code: string; metafile: any }) => void;
}): Promise<string>;
export function runBuildCli(
  argv: string[],
  deps?: {
    build?: () => Promise<unknown>;
    /** dist/ directory removed when an --optional build fails (default: <package root>/dist). */
    distDir?: string;
    log?: { warn(message: string): void; error(message: string): void };
  },
): Promise<number>;
