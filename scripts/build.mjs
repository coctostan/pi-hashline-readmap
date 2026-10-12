// Bundles index.ts into dist/index.js (see AGENTS.md "Build contract").
//   node scripts/build.mjs             strict: exit 1 on failure (npm run build, prepublishOnly)
//   node scripts/build.mjs --optional  warn, remove any stale dist/, exit 0 (prepare: installs must not break)
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INLINED_PEER = [/node_modules\/@earendil-works\//, /node_modules\/typebox\//];

export function verifyBundle({ code, metafile }) {
  const problems = [];
  if (!/^\s*(?:import|export)\s/m.test(code)) {
    problems.push("bundle lost ESM syntax (no top-level import/export statement)");
  }
  for (const input of Object.keys(metafile?.inputs ?? {})) {
    if (INLINED_PEER.some((pattern) => pattern.test(input))) {
      problems.push(`Pi peer inlined into bundle: ${input}`);
    }
  }
  if (/(?:\bfrom\s*|\bimport\s*\(\s*)["']\.{1,2}\//.test(code)) {
    problems.push("bundle contains relative import specifiers (./… or ../…)");
  }
  if (problems.length > 0) throw new Error(`Bundle verification failed:\n- ${problems.join("\n- ")}`);
}

export async function buildBundle({ rootDir = ROOT, outDir = join(rootDir, "dist"), verify = verifyBundle } = {}) {
  // Import esbuild first: if it is missing nothing has been created yet.
  const { build } = await import("esbuild");
  const parent = dirname(outDir);
  mkdirSync(parent, { recursive: true });
  const stage = mkdtempSync(join(parent, ".dist-stage-"));
  try {
    const result = await build({
      entryPoints: [join(rootDir, "index.ts")],
      outfile: join(stage, "index.js"),
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node22",
      packages: "external",
      metafile: true,
      logLevel: "silent",
      legalComments: "none",
    });
    verify({ code: readFileSync(join(stage, "index.js"), "utf8"), metafile: result.metafile });
    writeFileSync(join(stage, "package.json"), '{"type":"commonjs"}\n');
    rmSync(outDir, { recursive: true, force: true });
    renameSync(stage, outDir);
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
  return outDir;
}

export async function runBuildCli(argv, { build = buildBundle, log = console, distDir = join(ROOT, "dist") } = {}) {
  const optional = argv.includes("--optional");
  try {
    await build();
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (optional) {
      // A dist/ from an earlier build would still win over index.ts in the manifest and run stale code.
      rmSync(distDir, { recursive: true, force: true });
      log.warn(`[pi-hashline-readmap] skipped dist build: ${message}\nPi will load index.ts instead.`);
      return 0;
    }
    log.error(`[pi-hashline-readmap] build failed: ${message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runBuildCli(process.argv.slice(2));
}
