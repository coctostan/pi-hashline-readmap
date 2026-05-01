import { describe, expect, test } from "vitest";
import { deterministicMerge, normalizeMarkers } from "../src/symbol-merge.js";

// ─── Helper ──────────────────────────────────────────────────────────────

const JAVA_FUNC = `public User findUser(String email) {
    User user = userRepository.findByEmail(email);
    if (user == null) {
        throw new UserNotFoundException(email);
    }
    return user;
}
`;

const TS_FUNC = `function greet(name: string): string {
    const msg = \`Hello, \${name}!\`;
    console.log(msg);
    return msg;
}
`;

const PY_FUNC = `def process_data(items):
    results = []
    for item in items:
        if item.is_valid():
            results.append(item.transform())
    return results
`;

// ─── normalizeMarkers ─────────────────────────────────────────────────

describe("normalizeMarkers", () => {
	test("converts #... to canonical hash marker", () => {
		const input = `    #...`;
		const result = normalizeMarkers(input);
		expect(result).toBe("    # ... existing code ...");
	});

	test("converts //... to canonical slash marker", () => {
		const input = `    //...`;
		const result = normalizeMarkers(input);
		expect(result).toBe("    // ... existing code ...");
	});

	test("converts unicode ellipsis to canonical marker", () => {
		const input = `    …`;
		const result = normalizeMarkers(input);
		expect(result).toBe("    # ... existing code ...");
	});

	test("preserves canonical markers unchanged", () => {
		const input = `    # ... existing code ...`;
		const result = normalizeMarkers(input);
		expect(result).toBe(input);
	});

	test("preserves regular code lines unchanged", () => {
		const input = `const x = 1;`;
		const result = normalizeMarkers(input);
		expect(result).toBe(input);
	});
});

// ─── deterministicMerge ───────────────────────────────────────────────

describe("deterministicMerge", () => {
	// ── Basic cases ──

	test("replaces function body with new content using marker", () => {
		const snippet = `public User findUser(String email) {
    User user = userRepository.findByEmail(email);
    if (user == null) {
        throw new UserNotFoundException(email);
    }
    # ... existing code ...
}
`;
		const result = deterministicMerge(JAVA_FUNC, snippet);
		expect(result.result).not.toBeNull();
		expect(result.result).toContain("throw new UserNotFoundException(email)");
		expect(result.result).toContain("return user;");
	});

	test("inserts code before marker (top insertion)", () => {
		const snippet = `function greet(name: string): string {
    if (!name) {
        return "Hello, World!";
    }
    # ... existing code ...
}
`;
		const result = deterministicMerge(TS_FUNC, snippet);
		expect(result.result).not.toBeNull();
		expect(result.result).toContain("if (!name)");
		expect(result.result).toContain('return "Hello, World!";');
		expect(result.result).toContain("return msg;");
	});

	test("inserts code after marker (bottom insertion)", () => {
		const snippet = `function greet(name: string): string {
    # ... existing code ...
    console.log("Greeted:", name);
}
`;
		const result = deterministicMerge(TS_FUNC, snippet);
		expect(result.result).not.toBeNull();
		expect(result.result).toContain('console.log("Greeted:", name);');
		expect(result.result).toContain("return msg;");
	});

	test("signature modification with new params", () => {
		const snippet = `public User findUser(String email, boolean includeInactive) {
    User user = userRepository.findByEmail(email);
    if (user == null) {
        throw new UserNotFoundException(email);
    }
    # ... existing code ...
}
`;
		const result = deterministicMerge(JAVA_FUNC, snippet);
		expect(result.result).not.toBeNull();
		expect(result.result).toContain(
			"findUser(String email, boolean includeInactive)",
		);
	});

	test("replaces body without marker (no-marker drop)", () => {
		const snippet = `public User findUser(String email) {
    log.debug("Finding user: {}", email);
    return userRepository.findByEmail(email);
}
`;
		const result = deterministicMerge(JAVA_FUNC, snippet);
		expect(result.result).not.toBeNull();
		expect(result.result).toContain('log.debug("Finding user: {}"');
		expect(result).not.toContain("throw new UserNotFoundException");
	});

	// ── Short-form markers ──

	test("handles #... short form", () => {
		const snippet = `public User findUser(String email) {
    #...
    return userRepository.findByEmail(email);
}
`;
		const result = deterministicMerge(JAVA_FUNC, snippet);
		expect(result.result).not.toBeNull();
		expect(result.result).toContain("return userRepository.findByEmail(email)");
	});

	// ── Edge cases ──

	test("returns null when fewer than 2 context anchors", () => {
		const snippet = `function completelyNew() {
    return 42;
}
`;
		const result = deterministicMerge(TS_FUNC, snippet);
		expect(result.result).toBeNull();
	});

	test("handles blank lines correctly", () => {
		const snippet = `def process_data(items):

    results = []

    for item in items:
        if item.is_valid():
            results.append(item.transform())

    return results
`;
		const result = deterministicMerge(PY_FUNC, snippet);
		expect(result.result).not.toBeNull();
		expect(result.result).toContain("results = []");
		expect(result.result).toContain("return results");
	});

	test("preserves trailing newline from original", () => {
		const snippet = `public User findUser(String email) {
    User user = userRepository.findByEmail(email);
    #... existing code ...
}
`;
		const result = deterministicMerge(JAVA_FUNC, snippet);
		expect(result.result).not.toBeNull();
		expect(result.result!).toMatch(/\n$/);
	});

	test("works with short snippet using only 2 context anchors", () => {
		const snippet = `public User findUser(String email) {
    User user = userRepository.findByEmail(email);
    if (user == null) {
        throw new UserNotFoundException(email);
    }
    log.debug("User found");
    return user;
}
`;
		const result = deterministicMerge(JAVA_FUNC, snippet);
		expect(result.result).not.toBeNull();
		// Should preserve the existing context lines and add the new debug line
		expect(result.result).toContain('log.debug("User found")');
	});

	// ── Wrapper blocks ──

	test("wraps body in try/catch (marker inside wrapper)", () => {
		const snippet = `def process_data(items):
    try:
        # ... existing code ...
    except ValueError as e:
        log.error(f"Invalid data: {e}")
        return []
    return results
`;
		const result = deterministicMerge(PY_FUNC, snippet);
		expect(result.result).not.toBeNull();
		expect(result.result).toContain("try:");
		expect(result.result).toContain("except ValueError as e:");
		expect(result.result).toContain("results = []");
		expect(result.result).toContain("item.transform()");
	});

	// ── No trailing newline in original ──

	test("handles original without trailing newline", () => {
		const func = "function foo() {\n  return 1;\n}";
		const snippet = `function foo() {
    #... existing code ...
    console.log("done");
}
`;
		const result = deterministicMerge(func, snippet);
		expect(result.result).not.toBeNull();
		expect(result.result).toContain("return 1;");
		expect(result.result).toContain('console.log("done")');
	});

	// ── Multi-language: Go ──

	test("works with Go function", () => {
		const goFunc = `func (s *Service) GetUser(id string) (*User, error) {
    user, err := s.repo.FindByID(id)
    if err != nil {
        return nil, fmt.Errorf("get user: %w", err)
    }
    return user, nil
}
`;
		const snippet = `func (s *Service) GetUser(id string) (*User, error) {
    user, err := s.repo.FindByID(id)
    if err != nil {
        return nil, fmt.Errorf("get user: %w", err)
    }
    #... existing code ...
    log.Debug("user fetched")
}
`;
		const result = deterministicMerge(goFunc, snippet);
		expect(result.result).not.toBeNull();
		expect(result.result).toContain("return user, nil");
		expect(result.result).toContain('log.Debug("user fetched")');
	});

	// ── Nested-block regression (ambiguous `}` inside snippet) ──

	test("inserts code after nested if-block with marker", () => {
		const orig = `void foo() {
    bar();
    if (x) {
        throw ex;
    }
    return baz;
}
`;
		const snippet = `void foo() {
    bar();
    if (x) {
        throw ex;
    }
    qux();
    # ... existing code ...
}
`;
		const result = deterministicMerge(orig, snippet);
		expect(result.result).not.toBeNull();
		const lines = result.result!.split("\n");
		// `}` closing the if-block must appear BEFORE qux();
		const closingBraceIdx = lines.findIndex(
			(l: string) => l.trim() === "}" && l.startsWith("    "),
		);
		const quxIdx = lines.findIndex((l: string) => l.includes("qux"));
		expect(closingBraceIdx).toBeLessThan(quxIdx);
		// No duplicate `}` lines (was the bug)
		const braceLines = lines.filter((l: string) => l.trim() === "}");
		expect(braceLines.length).toBe(2); // one for if, one for method
		expect(result.result).toContain("qux();");
		expect(result.result).toContain("return baz;");
	});
});
