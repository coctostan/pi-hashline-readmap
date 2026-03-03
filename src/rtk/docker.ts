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

export function compressDockerOutput(output: string): string | null {
  const lines = output.split("\n");
  if (lines.length < 10) return output;

  const kept: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip noise lines
    if (trimmed.startsWith("---> ") && /^---> [0-9a-f]{8,}/.test(trimmed)) continue;
    if (trimmed.startsWith("Removing intermediate container")) continue;
    if (trimmed.startsWith("---> Running in")) continue;
    if (trimmed.startsWith("Sending build context")) continue;
    if (trimmed === "") continue;

    // Keep step lines
    if (/^Step \d+\/\d+\s*:/i.test(trimmed)) {
      kept.push(trimmed);
      continue;
    }
    // Keep success lines
    if (/^(successfully built|successfully tagged|writing image|naming to)/i.test(trimmed)) {
      kept.push(trimmed);
      continue;
    }
    // Keep error lines
    if (/^(error|ERROR|ERRO|fatal|FATAL)/i.test(trimmed) || trimmed.includes("ERROR")) {
      kept.push(trimmed);
      continue;
    }
    // Keep warning lines
    if (/^(warning|WARN)/i.test(trimmed)) {
      kept.push(trimmed);
      continue;
    }
  }

  if (kept.length === 0) return null;
  return kept.join("\n");
}
