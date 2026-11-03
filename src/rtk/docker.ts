const DOCKER_BUILD_PATTERNS = [
  "docker build",
  "docker compose build",
  "docker buildx build",
  "docker buildx bake",
];

export function isDockerCommand(cmd: string): boolean {
  const c = cmd.toLowerCase().trim();
  return DOCKER_BUILD_PATTERNS.some((p) => c.startsWith(p) || c.includes(` ${p}`));
}

// The legacy builder's intermediate containers and context upload, and blank lines, each a whole line: moby prints
// ids through stringid.TruncateID (12 hex digits), the CLI the context size through units.HumanSize ("%.4g%s").
// A step's own output is kept.
const NOISE_PATTERNS = [
  /^---> [0-9a-f]{12}$/,
  /^---> Running in [0-9a-f]{12}$/,
  /^Removing intermediate container [0-9a-f]{12}$/,
  /^Sending build context to Docker daemon\s+\d+(?:\.\d+)?[kMGTPEZY]?B$/,
  /^$/,
];

export function compressDockerOutput(output: string): string | null {
  const lines = output.split("\n");
  if (lines.length < 10) return output;

  const kept = lines.filter((line) => !NOISE_PATTERNS.some((pattern) => pattern.test(line.trim())));
  if (kept.length === 0) return null;
  return kept.join("\n");
}
