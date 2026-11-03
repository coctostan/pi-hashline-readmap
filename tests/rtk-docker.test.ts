import { describe, it, expect } from "vitest";
import { isDockerCommand, compressDockerOutput } from "../src/rtk/docker.js";

describe("isDockerCommand", () => {
  it("matches docker build variants", () => {
    expect(isDockerCommand("docker build .")).toBe(true);
    expect(isDockerCommand("docker build -t myapp .")).toBe(true);
    expect(isDockerCommand("docker compose build")).toBe(true);
    expect(isDockerCommand("docker buildx build .")).toBe(true);
  });

  it("does not match non-build docker commands", () => {
    expect(isDockerCommand("docker run myapp")).toBe(false);
    expect(isDockerCommand("docker ps")).toBe(false);
    expect(isDockerCommand("docker exec -it myapp bash")).toBe(false);
    expect(isDockerCommand("docker pull node")).toBe(false);
  });
});

describe("compressDockerOutput", () => {
  it("returns output unchanged if <10 lines", () => {
    const shortOutput = "Step 1/2 : FROM node\nDone";
    expect(compressDockerOutput(shortOutput)).toBe(shortOutput);
  });

  it("compresses verbose docker build output", () => {
    const input = [
      "Sending build context to Docker daemon  2.048kB",
      "Step 1/5 : FROM node:18-alpine",
      " ---> abc123def456",
      "Step 2/5 : WORKDIR /app",
      " ---> Running in 789abc012def",
      "Removing intermediate container 789abc012def",
      " ---> def456abc789",
      "Step 3/5 : COPY package*.json ./",
      " ---> abc111222333",
      "Step 4/5 : RUN npm install",
      " ---> Running in aaa111bbb222",
      "added 142 packages in 3.2s",
      "Removing intermediate container aaa111bbb222",
      " ---> ccc333ddd444",
      "Step 5/5 : COPY . .",
      " ---> eee555fff666",
      "Successfully built abc999888777",
      "Successfully tagged myapp:latest",
    ].join("\n");

    const result = compressDockerOutput(input);
    expect(result).not.toBeNull();
    expect(result).toContain("Step 1/5 : FROM node:18-alpine");
    expect(result).toContain("Step 3/5 : COPY package*.json ./");
    expect(result).toContain("Step 4/5 : RUN npm install");
    expect(result).toContain("Successfully built");
    expect(result).toContain("Successfully tagged myapp:latest");
    // Noise removed
    expect(result).not.toContain("Running in");
    expect(result).not.toContain("Removing intermediate container");
    expect(result).not.toMatch(/---> [0-9a-f]{8,}/);
  });

  // moby's legacy builder prints " ---> %s", " ---> Running in %s" and "Removing intermediate container %s" with
  // stringid.TruncateID's 12 hex digits, and the CLI the context size as units.HumanSize ("%.4g%s").
  it("drops the builder's noise only as whole lines", () => {
    const noise = [
      "Sending build context to Docker daemon  2.048kB",
      "Sending build context to Docker daemon  512B",
      " ---> 0123456789ab",
      " ---> Running in abc123def456",
      "Removing intermediate container abc123def456",
    ];
    const kept = [
      "Step 1/2 : RUN ./publish.sh",
      "---> 0123456789ab pushed to the registry",
      "---> Running in abc123def456 failed over to a retry",
      "Removing intermediate container abc123def456 took 40s",
      "Sending build context to Docker daemon  2.048kB of 9GB, then stalled",
      "Step 2/2 : CMD [\"node\"]",
    ];
    const input = [...noise, ...kept, "Successfully built 0123456789cd", "Successfully tagged app:latest"].join("\n");
    expect(compressDockerOutput(input)).toBe([...kept, "Successfully built 0123456789cd", "Successfully tagged app:latest"].join("\n"));
  });

  it("preserves error messages", () => {
    const input = Array(12)
      .fill("")
      .map((_, i) => {
        if (i === 0) return "Step 1/3 : FROM node";
        if (i === 5) return "ERROR: failed to solve";
        if (i === 6) return "error: could not build";
        return `---> ${i.toString(16).padStart(12, "0")}`;
      })
      .join("\n");

    const result = compressDockerOutput(input);
    expect(result).toContain("ERROR: failed to solve");
    expect(result).toContain("error: could not build");
  });

  it("preserves warning lines", () => {
    const lines = Array(12).fill("filler line");
    lines[0] = "Step 1/2 : FROM node";
    lines[5] = "WARNING: apt does not have a stable CLI interface";
    lines[10] = "Successfully built abc123";
    const result = compressDockerOutput(lines.join("\n"));
    expect(result).toContain("WARNING: apt does not have");
  });
});
