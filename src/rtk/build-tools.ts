const NOISE_PATTERNS: RegExp[] = [
  /make\[\d+\]: (Entering|Leaving) directory/,
  /^\s*\[\s*\d+%\]/, // CMake: [ 10%] Building ...
  /^>\s+Task\s+:/, // Gradle: > Task :compileJava
  /^\[INFO\]\s+(Downloading|Compiling|Building|Unpacking)/, // Maven noise
  /^:\w+$/, // plain Gradle task: :compileJava
];

const SIGNAL_PATTERNS: RegExp[] = [
  /error:/i,
  /warning:/i,
  /\[ERROR\]/,
  /\[WARNING\]/,
  /make: \*\*\*/,
  /BUILD (SUCCESSFUL|FAILED|SUCCESS|FAILURE)/,
];

function isNoise(line: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(line));
}

function isSignal(line: string): boolean {
  return SIGNAL_PATTERNS.some((p) => p.test(line));
}

export function isBuildToolsCommand(cmd: string): boolean {
  const c = cmd.trim().toLowerCase();
  return (
    c === "make" ||
    c.startsWith("make ") ||
    c === "cmake" ||
    c.startsWith("cmake ") ||
    c === "gradle" ||
    c.startsWith("gradle ") ||
    c === "./gradlew" ||
    c.startsWith("./gradlew ") ||
    c === "mvn" ||
    c.startsWith("mvn ")
  );
}

export function compressBuildToolsOutput(output: string): string | null {
  if (output.length === 0) return null; // AC-6: null for empty (must be before short-circuit)
  const lines = output.split("\n");
  if (lines.length < 10) return output; // AC-3: short-circuit

  const kept: string[] = [];
  for (const line of lines) {
    if (isSignal(line)) {
      kept.push(line);
    } else if (!isNoise(line)) {
      kept.push(line);
    }
  }
  return kept.join("\n");
}
