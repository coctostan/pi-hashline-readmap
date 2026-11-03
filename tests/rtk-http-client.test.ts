import { describe, it, expect } from "vitest";
import { isHttpCommand, compressHttpOutput } from "../src/rtk/http-client.js";

describe("isHttpCommand", () => {
  it("matches curl, wget, http (httpie)", () => {
    expect(isHttpCommand("curl https://example.com")).toBe(true);
    expect(isHttpCommand("curl -v https://api.example.com")).toBe(true);
    expect(isHttpCommand("wget https://example.com")).toBe(true);
    expect(isHttpCommand("wget -O file.html https://example.com")).toBe(true);
    expect(isHttpCommand("http GET https://api.example.com")).toBe(true);
    expect(isHttpCommand("http")).toBe(true);
  });

  it("does not match httpd, https-server, or unrelated", () => {
    expect(isHttpCommand("httpd -f config")).toBe(false);
    expect(isHttpCommand("https-server")).toBe(false);
    expect(isHttpCommand("echo http")).toBe(false);
    expect(isHttpCommand("npm install")).toBe(false);
  });
});

describe("compressHttpOutput", () => {
  it("returns input for short output (<10 lines)", () => {
    expect(compressHttpOutput("HTTP/1.1 200 OK\n{}\n")).toBe("HTTP/1.1 200 OK\n{}\n");
  });

  it("strips curl progress bar lines", () => {
    const lines = [
      "  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current",
      "                                 Dload  Upload   Total   Spent    Left  Speed",
      "  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0",
      "100  1234  100  1234    0     0   5678      0 --:--:-- --:--:-- --:--:--  5678",
      "HTTP/1.1 200 OK",
      "Content-Type: application/json",
      "Content-Length: 1234",
      "",
      '{"status": "ok"}',
      '{"data": [1,2,3]}',
      '{"more": "data"}',
    ];
    const result = compressHttpOutput(lines.join("\n"));
    expect(result).not.toBeNull();
    expect(result).toContain("HTTP/1.1 200 OK");
    expect(result).toContain('{"status": "ok"}');
    expect(result).not.toContain("% Total");
    expect(result).not.toContain("Dload");
  });

  it("strips wget progress dots", () => {
    const lines: string[] = [];
    lines.push("--2024-01-01 12:00:00--  https://example.com/");
    lines.push("Resolving example.com... 93.184.216.34");
    lines.push("Connecting to example.com... connected.");
    lines.push("HTTP request sent, awaiting response... 200 OK");
    lines.push("Length: 1234 (1.2K) [text/html]");
    for (let i = 0; i < 5; i++) lines.push("     0K .                                                     100% 1.23M=0s");
    lines.push("2024-01-01 12:00:01 (1.23 MB/s) - saved");
    const result = compressHttpOutput(lines.join("\n"));
    expect(result).not.toBeNull();
    expect(result).toContain("200 OK");
    expect(result).toContain("saved");
    expect(result).not.toMatch(/\d+K \./);
  });

  // Row shapes from wget's src/progress.c dot backend: "%6sK", clusters of '.' (',' for resumed bytes), then
  // "%3d%%" when the length is known, " %4.*f%c" rate, and an ETA, or "=" total time on the last row.
  it("strips wget dot-progress rows in each stats form", () => {
    const rows = [
      "     0K .......... .......... .......... .......... ..........  4% 1.23M 3s",
      "    50K .......... .......... .......... .......... ..........  9%  512K 1m5s",
      "   100K .......... .......... .......... .......... .......... 14%  123  2h3m",
      "   150K .......... .......... .......... .......... .......... 2.10M",
      "   350K ,,,,,,,,,, ,,,,,..... .......... .......... .......... 80% 1.20M 0s",
      "  3072K ........ ........ ........ ........ ........ ........ 50% 2.00M 2s",
      "   200K .......... ....                                       100% 3.45M=0.06s",
      "   200K ..                                                    100% 1.00M=1m5s",
      "   200K .                                                     100%  123 =0.06s",
      "   150K .......... ....                                        2.10M=0.5s",
    ];
    const raw = ["--2024-01-01 12:00:00--  https://example.com/", "HTTP request sent, awaiting response... 200 OK", ...rows, "saved"];
    const result = compressHttpOutput(raw.join("\n"));

    expect(result?.split("\n")).toEqual(["--2024-01-01 12:00:00--  https://example.com/", "HTTP request sent, awaiting response... 200 OK", "saved"]);
  });

  it("keeps body lines that only start like wget progress", () => {
    const body = ["12K\t./src", "4K ./docs", "0K .NET runtime missing", "10K ... and more", "  5K .", "1K . 2 files",
      // Stats wget never prints: a time touching the rate, a unitless rate, a known length without a time, a space
      // before "=".
      "     0K .......... 100% 1.23M3s", "     0K .......... 100% 123 3s", "     0K .......... 100% 1.23M", "     0K .......... 2.10M =0.5s"];
    const raw = ["HTTP/1.1 200 OK", "Content-Type: text/plain", "", ...body, "row a", "row b", "row c"];
    const result = compressHttpOutput(raw.join("\n"));

    expect(result?.split("\n")).toEqual(raw);
  });

  it("truncates body to 200 lines if larger", () => {
    const lines = ["HTTP/1.1 200 OK", "Content-Type: text/plain", ""];
    for (let i = 0; i < 250; i++) lines.push(`line ${i}`);
    const result = compressHttpOutput(lines.join("\n"));
    expect(result).not.toBeNull();
    expect(result).toContain("[... 50 more lines]");
    expect(result).not.toContain("line 249");
  });

  it("preserves response headers and body", () => {
    const lines = [
      "* Connected to example.com",
      "> GET / HTTP/1.1",
      "> Host: example.com",
      "< HTTP/1.1 200 OK",
      "< Content-Type: text/html",
      "<",
      "<html>",
      "<body>Hello</body>",
      "</html>",
      "* Connection closed",
      "extra line",
    ];
    const result = compressHttpOutput(lines.join("\n"));
    expect(result).not.toBeNull();
    expect(result).toContain("HTTP/1.1 200 OK");
    expect(result).toContain("<html>");
  });
});

  it("truncates pure body output (curl -s) to 200 lines when no headers present", () => {
    const lines: string[] = [];
    for (let i = 0; i < 250; i++) lines.push(`  "key${i}": ${i}`);
    const output = lines.join("\n");
    const result = compressHttpOutput(output);
    expect(result).not.toBeNull();
    expect(result).toContain("[... 50 more lines]");
    expect(result).not.toContain('"key249"');
  });
