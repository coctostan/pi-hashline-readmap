import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("README.md (AC-1, AC-2)", () => {
  it("README.md exists at project root", () => {
    expect(existsSync(resolve(root, "README.md"))).toBe(true);
  });

  it("contains project name", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    expect(readme).toContain("pi-hashline-readmap");
  });

  it("contains install instructions", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    expect(readme).toMatch(/^## Install(?:ation)?$/m);
    expect(readme).toContain("pi install");
  });

  it("contains output format example with LINE:HASH pattern", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    expect(readme).toContain("LINE:HASH");
  });

  it("keeps structural-map and mapper documentation in configuration.md", () => {
    const configuration = readFileSync(resolve(root, "docs/configuration.md"), "utf8");
    expect(configuration).toContain("Dedicated readmap mappers");
    expect(configuration).toContain("TypeScript, JavaScript, Python");
    expect(configuration).toContain("opt-in GDScript");
  });

  it("credits upstream projects", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    expect(readme).toContain("hashline-edit");
    expect(readme).toContain("read-map");
    expect(readme).toContain("rtk");
  });

  it("contains Development section", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    expect(readme).toContain("npm test");
  });

  it("references MIT license", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    expect(readme).toContain("MIT");
  });
});

describe("LICENSE (AC-3)", () => {
  it("LICENSE file exists at project root", () => {
    expect(existsSync(resolve(root, "LICENSE"))).toBe(true);
  });

  it("contains MIT License text", () => {
    const license = readFileSync(resolve(root, "LICENSE"), "utf8");
    expect(license).toContain("MIT License");
  });

  it("contains copyright year", () => {
    const license = readFileSync(resolve(root, "LICENSE"), "utf8");
    expect(license).toContain("2026");
  });
});
