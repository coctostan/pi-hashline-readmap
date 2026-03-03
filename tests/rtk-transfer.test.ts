import { describe, it, expect } from "vitest";
import { isTransferCommand, compressTransferOutput } from "../src/rtk/transfer.js";

describe("isTransferCommand", () => {
  it("returns true for scp", () => expect(isTransferCommand("scp file host:/path")).toBe(true));
  it("returns true for rsync", () => expect(isTransferCommand("rsync -av src/ dst/")).toBe(true));
  it("returns false for cp", () => expect(isTransferCommand("cp file dest")).toBe(false));
  it("returns false for mv", () => expect(isTransferCommand("mv file dest")).toBe(false));
  it("returns false for curl", () => expect(isTransferCommand("curl https://example.com")).toBe(false));
  it("returns false for git", () => expect(isTransferCommand("git push")).toBe(false));
  it("returns false for docker cp", () => expect(isTransferCommand("docker cp file container:/path")).toBe(false));
  it("returns false for npm", () => expect(isTransferCommand("npm install")).toBe(false));
});

describe("compressTransferOutput", () => {
  it("returns input unchanged for <10 lines", () => {
    const short = "sent 1234 bytes  received 85 bytes  876.00 bytes/sec\n";
    expect(compressTransferOutput(short)).toBe(short);
  });

  it("strips rsync per-file progress lines", () => {
    // rsync progress: "      1,234 100%    1.00MB/s    0:00:00 (xfr#1, to-chk=5/7)"
    const progressLine = "      1,234 100%    1.00MB/s    0:00:00 (xfr#1, to-chk=5/7)\n";
    const lines = Array(15).fill(progressLine).join("") + "sent 50000 bytes  received 100 bytes\n";
    const result = compressTransferOutput(lines)!;
    expect(result).not.toContain("xfr#");
    expect(result).toContain("sent 50000 bytes");
  });

  it("strips scp progress bar lines", () => {
    // scp progress: "file.txt                    100%  1234   1.2KB/s   00:00"
    const progressLine = "file.txt                    100%  1234   1.2KB/s   00:00\n";
    const lines = Array(15).fill(progressLine).join("") + "total: 15000 bytes\n";
    const result = compressTransferOutput(lines)!;
    expect(result).not.toContain("1.2KB/s");
  });

  it("preserves final summary line with 'sent ... bytes'", () => {
    const lines = Array(14).fill("noise progress\n").join("") + "sent 1,234 bytes  received 85 bytes  876.00 bytes/sec\n";
    const result = compressTransferOutput(lines)!;
    expect(result).toContain("sent 1,234 bytes");
  });

  it("preserves Permission denied lines", () => {
    const lines = Array(10).fill("progress\n").join("") + "Permission denied (publickey).\n";
    const result = compressTransferOutput(lines)!;
    expect(result).toContain("Permission denied");
  });

  it("preserves Connection refused lines", () => {
    const lines = Array(10).fill("progress\n").join("") + "ssh: connect to host example.com: Connection refused\n";
    const result = compressTransferOutput(lines)!;
    expect(result).toContain("Connection refused");
  });

  it("preserves No such file lines", () => {
    const lines = Array(10).fill("progress\n").join("") + "scp: /remote/path: No such file or directory\n";
    const result = compressTransferOutput(lines)!;
    expect(result).toContain("No such file");
  });

  it("returns null for empty string", () => {
    expect(compressTransferOutput("")).toBeNull();
  });
});
