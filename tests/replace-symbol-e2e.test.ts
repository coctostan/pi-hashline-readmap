import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { registerEditTool } from "../src/edit.js";

function getTextContent(result: any): string {
  return result.content?.find((item: any) => item.type === "text")?.text ?? "";
}

describe("replace_symbol end-to-end", () => {
  it("edits a Java function via replace_symbol", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-replace-symbol-"));
    const filePath = resolve(dir, "UserService.java");
    writeFileSync(
      filePath,
      `package com.example;

public class UserService {
    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public User findUser(String email) {
        User user = userRepository.findByEmail(email);
        if (user == null) {
            throw new UserNotFoundException(email);
        }
        return user;
    }

    public void deleteUser(Long id) {
        userRepository.deleteById(id);
    }
}
`,
      "utf-8",
    );

    let capturedTool: any;
    registerEditTool(
      {
        registerTool(def: any) {
          capturedTool = def;
        },
      } as any,
      {
        wasReadInSession: () => true,
      },
    );

    const replacement = `public User findUser(String email) {
    User user = userRepository.findByEmail(email);
    if (user == null) {
        throw new UserNotFoundException(email);
    }
    log.debug("User found via email: {}", email);
    # ... existing code ...
}
`;
    const result = await capturedTool.execute(
      "test-call",
      {
        path: filePath,
        edits: [{ replace_symbol: { symbol: "findUser", replacement } }],
      },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).toBeFalsy();
    const text = getTextContent(result);
    expect(text).not.toContain("could not confidently merge");
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('log.debug("User found via email: {}", email)');
    expect(content).toContain("throw new UserNotFoundException(email)");
    expect(content).toContain("return user;");
    expect(content).toContain("public class UserService");
    expect(content).toContain("public void deleteUser(Long id)");
  });

  it("returns error for symbol not found", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-replace-symbol-"));
    const filePath = resolve(dir, "NotFound.java");
    writeFileSync(
      filePath,
      "public class Foo {\n    void bar() {}\n}\n",
      "utf-8",
    );

    let capturedTool: any;
    registerEditTool(
      {
        registerTool(def: any) {
          capturedTool = def;
        },
      } as any,
      {
        wasReadInSession: () => true,
      },
    );

    const result = await capturedTool.execute(
      "test-call",
      {
        path: filePath,
        edits: [{ replace_symbol: { symbol: "nonexistent", replacement: "x" } }],
      },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).toBe(true);
    const text = getTextContent(result);
    expect(text).toContain('Symbol "nonexistent" not found');
  });

  it("handles TypeScript function with short markers", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-replace-symbol-"));
    const filePath = resolve(dir, "greeter.ts");
    writeFileSync(
      filePath,
      `export function greet(name: string): string {
    const msg = \`Hello, \${name}!\`;
    console.log(msg);
    return msg;
}

export function farewell(name: string): string {
    return \`Goodbye, \${name}!\`;
}
`,
      "utf-8",
    );

    let capturedTool: any;
    registerEditTool(
      {
        registerTool(def: any) {
          capturedTool = def;
        },
      } as any,
      {
        wasReadInSession: () => true,
      },
    );

    const replacement = `export function greet(name: string): string {
    const msg = \`Hello, \${name}!\`;
    console.log(msg);
    console.debug("greeting generated for", name);
    #...
}
`;
    const result = await capturedTool.execute(
      "test-call",
      {
        path: filePath,
        edits: [{ replace_symbol: { symbol: "greet", replacement } }],
      },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).toBeFalsy();
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('console.debug("greeting generated for", name);');
    expect(content).toContain("return msg;");
    expect(content).toContain("Goodbye");
  });

  it("inserts code at top of empty body via marker semantics", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-replace-symbol-"));
    const filePath = resolve(dir, "empty.ts");
    writeFileSync(filePath, "function empty() {\n    // nothing\n}\n", "utf-8");

    let capturedTool: any;
    registerEditTool(
      {
        registerTool(def: any) {
          capturedTool = def;
        },
      } as any,
      {
        wasReadInSession: () => true,
      },
    );

    const replacement = `function empty() {
    console.log("starting");
    #... existing code ...
}
`;
    const result = await capturedTool.execute(
      "test-call",
      {
        path: filePath,
        edits: [{ replace_symbol: { symbol: "empty", replacement } }],
      },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).toBeFalsy();
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('console.log("starting")');
    expect(content).toContain("// nothing");
  });

	it("auto-fallback for single-line symbol (interface method)", async () => {
		const dir = mkdtempSync(resolve(tmpdir(), "pi-replace-symbol-"));
		const filePath = resolve(dir, "TokenCache.java");
		writeFileSync(filePath, `package com.example;

public interface TokenCache {
    Token get(String id);
    List<Token> list();
    void put(String id, String token, Integer ttl);
    String remove(String id);
}
`, "utf-8");

		let capturedTool: any;
		registerEditTool(
			{
				registerTool(def: any) {
					capturedTool = def;
				},
			} as any,
			{
				wasReadInSession: () => true,
			},
		);

		// Single-line symbol — should auto-fallback to set_line
		const result = await capturedTool.execute(
			"test-call",
			{
				path: filePath,
				edits: [{ replace_symbol: { symbol: "put", replacement: "void put(String id, Token token);" } }],
			},
			new AbortController().signal,
			() => {},
			{ cwd: process.cwd() },
		);

		expect(result.isError).toBeFalsy();
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("void put(String id, Token token);");
		expect(content).not.toContain("Integer ttl");
		expect(content).toContain("String remove(String id);"); // other lines unchanged
	});
});
