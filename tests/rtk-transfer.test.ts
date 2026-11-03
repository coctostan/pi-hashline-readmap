import { describe, it, expect } from "vitest";
import type { Drop } from "../src/rtk/drops.js";
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

  it("returns null for scp progress-only output with a trailing newline", () => {
    const progress = "file.txt                    100%  1234   1.2KB/s   00:00";
    const input = Array.from({ length: 10 }, () => progress).join("\n") + "\n";

    expect(compressTransferOutput(input)).toBeNull();
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

  it("keeps a filename holding an xfr-like substring, dropping only whole xfr progress lines", () => {
    const progress = "      1,234 100%    1.00MB/s    0:00:00 (xfr#1, to-chk=5/7)";
    const input = ["deleting report(xfr#1).txt", ...Array.from({ length: 10 }, () => progress), "sent 1 bytes  received 2 bytes"].join("\n");
    expect(compressTransferOutput(input)).toBe(["deleting report(xfr#1).txt", "sent 1 bytes  received 2 bytes"].join("\n"));
  });

  // Rows as rsync's progress.c prints them (3.2.7: "%15s %3d%% %7.2f%s %s%s"; master: "%15sB %3d%% %7sB/s %s%s"),
  // openrsync's (macOS, measured), several updates joined by '\r', and OpenSSH progressmeter.c's scp rows.
  it("strips each progress row shape whole", () => {
    const rows = [
      "      1,234 100%    1.00MB/s    0:00:00 (xfr#1, to-chk=5/7)",
      "     32,768  50%   31.25kB/s    0:00:01  ",
      "     32,768  50%   31.25kB/s  ??:??:??",
      "      1,234B 100%    1.00MB/s    0:00:00 (xfr#2, ir-chk=1/9)",
      "          1.23K  12%  512.00kB/s    0:00:09",
      "              3 100%  267.13KB/s   00:00:00 (xfer#1, to-check=1/3)",
      "\r     32,768  50%   31.25kB/s    0:00:01\r     65,536 100%   62.50kB/s    0:00:00 (xfr#3, to-chk=0/1)",
      "file.txt                    100%  1234   1.2KB/s   00:00",
      " big.iso                                45%  450MB  10.2MB/s   00:53 ETA",
      " big.iso                                45%  450MB   0.0KB/s  --:-- ETA",
      " big.iso                                45%  450MB   0.0KB/s - stalled -",
      " big.iso                               100% 1000MB  10.2MB/s 1:02:03    ",
    ];
    const input = [...rows, "sent 1 bytes  received 2 bytes"].join("\n");
    expect(compressTransferOutput(input)).toBe("sent 1 bytes  received 2 bytes");
  });

  it("keeps lines that only start or end like a progress row", () => {
    const kept = [
      "deleting report(xfr#1, to-chk=5/7)",
      "notes (xfer#1, to-check=1/3)",
      "    1,234 100% of the files were checked",
      "     32,768  50%   31.25kB/s    0:00:01 then stalled",
      "report 100%  1234   1.2KB/s   00:00 measured upstream",
    ];
    const progress = "      1,234 100%    1.00MB/s    0:00:00 (xfr#1, to-chk=5/7)";
    const input = [...kept, ...Array.from({ length: 10 }, () => progress), "sent 1 bytes  received 2 bytes"].join("\n");
    expect(compressTransferOutput(input)).toBe([...kept, "sent 1 bytes  received 2 bytes"].join("\n"));
  });

  it("returns null for empty string", () => {
    expect(compressTransferOutput("")).toBeNull();
  });

  it("counts only entries of rsync's file list, keeping path-shaped lines outside it", () => {
    // `--out-format='%l'` sizes or a banner print no file list header: they are kept, not counted as files.
    const outside = Array.from({ length: 12 }, (_, i) => `${1000 + i}`);
    const drops: Drop[] = [];
    expect(compressTransferOutput([...outside, "sent 1 bytes  received 2 bytes"].join("\n"), drops)).toBe(
      [...outside, "sent 1 bytes  received 2 bytes"].join("\n"),
    );
    expect(drops).toEqual([]);

    const list = Array.from({ length: 11 }, (_, i) => `f${i}.txt`);
    const result = compressTransferOutput(["Transfer starting: 11 files", ...list, "", ...outside].join("\n"), drops);
    expect(result).toBe(["Transfer starting: 11 files", ...list.slice(0, 10), "... and 1 more files", "", ...outside].join("\n"));
    expect(drops).toEqual([{ count: 1, unit: "files" }]);
  });
});
