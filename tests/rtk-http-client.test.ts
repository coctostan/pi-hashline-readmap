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
      "     0K .......... 100% 1.23M3s", "     0K .......... 100% 123 3s",
      "     0K .......... 100% 1.234567M 3s", "     0K .......... 100% 1.23M=0.123456s", "     0K .......... 100% 1.23M", "     0K .......... 2.10M =0.5s"];
    const raw = ["HTTP/1.1 200 OK", "Content-Type: text/plain", "", ...body, "row a", "row b", "row c"];
    const result = compressHttpOutput(raw.join("\n"));

    expect(result?.split("\n")).toEqual(raw);
  });

  // curl's lib/progress.c prints the meter's two header lines whole; older releases spaced them differently.
  it("strips curl's progress header only as a whole line", () => {
    const header = [
      "  % Total    % Received % Xferd  Average Speed  Time    Time    Time   Current",
      "                                 Dload  Upload  Total   Spent   Left   Speed",
    ];
    const body = ["% Total % Received % Xferd tax report", "  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current!"];
    const raw = [...header, "HTTP/1.1 200 OK", "Content-Type: text/plain", "", ...body, "row a", "row b", "row c"];
    const result = compressHttpOutput(raw.join("\n"));

    expect(result?.split("\n")).toEqual(raw.slice(2));
  });

  // Rows as lib/progress.c prints them, every field at its printf width: max5data and the 8-wide time2str with two-space
  // gaps up to curl-8_16_0; max6data, one-space gaps and two before the times at curl-8_17_0; max6out, the 7-wide
  // time2str (blank while unknown) and one-space gaps from curl-8_18_0 (unchanged at curl-8_23_0).
  const CLASSIC_ROWS = [
    "  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0",
    " 42  1234   42  292k    0     0  15.0M   500M  0:01:05  0:00:05  0:01:00 15.10",
    "  7 20.0G    7  500G    0     0  3072G    19P   8d 04h    1000d  0:00:01     0",
    // 900G at 1 byte/s: "%7dd" outgrows its buffer, which cuts the "d".
    "  0  900G    0     0    0     0      1      0 11184810  0:00:05 11184810     0",
  ];
  const CURL_8_17_ROWS = [
    "  0     0   0     0   0     0     0     0  --:--:-- --:--:-- --:--:--     0",
    " 42 999999  42 976.5k   0     0  1953k 999.10   0:01:05  0:00:05  0:01:00  3072M",
    "  7 20480M   7 500.0T 100  1234  3072T     0    8d 04h    1000d  0:00:01     0",
  ];
  const CURL_8_18_ROWS = [
    "  0      0   0      0   0      0      0      0                              0",
    "100  99999 100 97.65k   0      0  1.90M  5.00G   01:05 1:01:05 10h 00m  4.00E",
    "  7 20.00G   7 500.0T   0   1234  3.00P      0  5d 00h    100d     33m      0",
    "  7      1   7      2   0      3      4      5     82y >99999y              6",
  ];

  it("strips curl progress rows of each release, and in-place updates joined by '\\r'", () => {
    const rows = [...CLASSIC_ROWS, ...CURL_8_17_ROWS, ...CURL_8_18_ROWS];
    // curl 8.7.1, captured: each update starts with '\r', and the meter's last row ends the line.
    const joined = `\r${CLASSIC_ROWS[0]}\r100  292k  100  292k    0     0   238M      0 --:--:-- --:--:-- --:--:--  286M`;
    const raw = [...rows, joined, `\r${CURL_8_18_ROWS[0]}\r${CURL_8_18_ROWS[1]}`, "HTTP/1.1 200 OK", "Content-Type: text/plain", "", "row a"];
    const result = compressHttpOutput(raw.join("\n"));

    expect(result?.split("\n")).toEqual(["HTTP/1.1 200 OK", "Content-Type: text/plain", "", "row a"]);
  });

  it("keeps body lines unless every column has curl's printed shape", () => {
    const classic = CLASSIC_ROWS[0];
    const modern = CURL_8_18_ROWS[1];
    const body = [
      "100 users 100 active 0 banned n/a n/a --:--:-- --:--:-- --:--:-- n/a",
      // One column off per kind in a classic and an 8.18.0 row: a percent, a size, a time, a gap; a size wider than its
      // column; a row joined by '\r' to a line that is none.
      classic.replace("  0     0 ", "abc     0 "),
      classic.replace("    0      0 --", "    0  users --"),
      classic.replace("--:--:-- --:--:-- --:--:--", "--:--:-- tomorrow --:--:--"),
      classic.replace("  0     0    0", "  0     0   0"),
      modern.replace(" 99999", " users"),
      modern.replace("  99999", "  99999k"),
      modern.replace(" 99999 100", " 99999  100"),
      modern.replace("1:01:05", "1:01:5 "),
      `${modern}\rrow b`,
      // Rows curl never prints: two glued with no '\r' between them.
      `${classic}${classic}`,
    ];
    const raw = ["HTTP/1.1 200 OK", "Content-Type: text/plain", "", ...body, "row a", "row c"];
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
