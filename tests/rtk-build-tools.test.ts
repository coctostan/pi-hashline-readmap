import { describe, it, expect } from "vitest";
import { isBuildToolsCommand, compressBuildToolsOutput } from "../src/rtk/build-tools.js";

describe("isBuildToolsCommand", () => {
  it("returns true for make", () => expect(isBuildToolsCommand("make")).toBe(true));
  it("returns true for make with args", () => expect(isBuildToolsCommand("make all")).toBe(true));
  it("returns true for cmake", () => expect(isBuildToolsCommand("cmake --build .")).toBe(true));
  it("returns true for gradle", () => expect(isBuildToolsCommand("gradle build")).toBe(true));
  it("returns true for ./gradlew", () => expect(isBuildToolsCommand("./gradlew build")).toBe(true));
  it("returns true for mvn", () => expect(isBuildToolsCommand("mvn package")).toBe(true));
  it("returns false for tsc", () => expect(isBuildToolsCommand("tsc")).toBe(false));
  it("returns false for npm run build", () => expect(isBuildToolsCommand("npm run build")).toBe(false));
  it("returns false for cargo build", () => expect(isBuildToolsCommand("cargo build")).toBe(false));
  it("returns false for git", () => expect(isBuildToolsCommand("git status")).toBe(false));
  it("returns false for docker", () => expect(isBuildToolsCommand("docker build")).toBe(false));
  it("returns false for rsync", () => expect(isBuildToolsCommand("rsync -av src/ dst/")).toBe(false));
});

describe("compressBuildToolsOutput", () => {
  it("returns input unchanged for <10 lines", () => {
    const short = "make: Nothing to be done.\n";
    expect(compressBuildToolsOutput(short)).toBe(short);
  });

  it("strips make enter/leave directory lines", () => {
    const lines = Array(15).fill("make[1]: Entering directory '/src'\n").join("") + "build output\n";
    const result = compressBuildToolsOutput(lines)!;
    expect(result).not.toContain("Entering directory");
  });

  it("strips CMake progress percentage lines", () => {
    const lines = Array(15).fill("[ 10%] Building CXX object CMakeFiles/foo.dir/main.cpp.o\n").join("") + "done\n";
    const result = compressBuildToolsOutput(lines)!;
    expect(result).not.toContain("[ 10%]");
  });

  it("strips Gradle task progress lines", () => {
    const lines = Array(15).fill("> Task :compileJava\n").join("") + "BUILD SUCCESSFUL\n";
    const result = compressBuildToolsOutput(lines)!;
    expect(result).not.toContain("> Task :compileJava");
    expect(result).toContain("BUILD SUCCESSFUL");
  });

  // GNU make's output.c prints "%s[%u]: Entering directory '%s'" (3.81 quoted `%s'); Gradle's task outcomes are
  // UP-TO-DATE, NO-SOURCE, FROM-CACHE, SKIPPED (FAILED is kept as a signal).
  it("strips make's and Gradle's lines only whole, CMake's and Maven's only with the separator after their prefix", () => {
    const noise = [
      "make[1]: Entering directory '/src/sub'",
      "make[2]: Leaving directory `/src/sub'",
      "gmake[1]: Entering directory '/src'",
      "> Task :app:compileJava",
      "> Task :app:processResources NO-SOURCE",
      "> Task :app:jar UP-TO-DATE",
      "> Task :app:compileTestJava FROM-CACHE",
      "> Task :app:test SKIPPED",
      "[ 10%] Building CXX object CMakeFiles/foo.dir/main.cpp.o",
      "[INFO] Downloading from central: https://repo.maven.apache.org/foo.pom",
      "[INFO] Building jar: /src/target/foo.jar",
    ];
    const kept = [
      "make[1]: Entering directory '/src' was printed twice",
      "log: make[1]: Entering directory '/src'",
      "> Task :app:test took 3m longer than budgeted",
      "[ 10%]coverage regressed",
      "[INFO] BuildingBlocks unavailable",
    ];
    const input = [...noise, ...kept, "BUILD SUCCESSFUL in 3s"].join("\n");
    expect(compressBuildToolsOutput(input)).toBe([...kept, "BUILD SUCCESSFUL in 3s"].join("\n"));
  });

  it("strips Maven [INFO] Downloading lines", () => {
    const lines = Array(15).fill("[INFO] Downloading: https://repo.maven.apache.org/foo\n").join("") + "[INFO] BUILD SUCCESS\n";
    const result = compressBuildToolsOutput(lines)!;
    expect(result).not.toContain("Downloading:");
    expect(result).toContain("BUILD SUCCESS");
  });

  it("preserves error: lines", () => {
    const lines = Array(10).fill("noise\n").join("") + "src/main.cpp:10:5: error: use of undeclared identifier\n";
    const result = compressBuildToolsOutput(lines)!;
    expect(result).toContain("error:");
  });

  it("preserves warning: lines", () => {
    const lines = Array(10).fill("noise\n").join("") + "src/main.cpp:5:3: warning: unused variable\n";
    const result = compressBuildToolsOutput(lines)!;
    expect(result).toContain("warning:");
  });

  it("preserves [ERROR] Maven lines", () => {
    const lines = Array(10).fill("[INFO] noise\n").join("") + "[ERROR] Failed to execute goal\n";
    const result = compressBuildToolsOutput(lines)!;
    expect(result).toContain("[ERROR]");
  });

  it("preserves make: *** error lines", () => {
    const lines = Array(10).fill("recipe\n").join("") + "make: *** [all] Error 1\n";
    const result = compressBuildToolsOutput(lines)!;
    expect(result).toContain("make: ***");
  });

  it("preserves BUILD SUCCESSFUL", () => {
    const lines = Array(10).fill("> Task :compileJava\n").join("") + "BUILD SUCCESSFUL in 3s\n";
    const result = compressBuildToolsOutput(lines)!;
    expect(result).toContain("BUILD SUCCESSFUL");
  });

  it("returns null for empty string", () => {
    expect(compressBuildToolsOutput("")).toBeNull();
  });
});
