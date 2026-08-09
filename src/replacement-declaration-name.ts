import type { FileMap } from "./readmap/types.js";
import { detectLanguage } from "./readmap/language-detect.js";
import { typescriptMapperFromContent } from "./readmap/mappers/typescript.js";
import { rustMapperFromContent } from "./readmap/mappers/rust.js";
import { javaMapperFromContent } from "./readmap/mappers/java.js";

const WRAPPER_NAME = "__PiReplacementWrapper";
const NON_DECLARATION_HEADS = new Set(["if", "for", "while", "switch", "catch", "return", "new"]);

type ReplacementMapper = (filePath: string, content: string) => Promise<FileMap | null>;

const REPLACEMENT_MAPPERS: Record<string, ReplacementMapper> = {
	typescript: typescriptMapperFromContent,
	javascript: typescriptMapperFromContent,
	rust: rustMapperFromContent,
	java: javaMapperFromContent,
};

export interface ReplacementDeclarationNameInput {
	filePath: string;
	newBody: string;
	isMember: boolean;
}

function memberParseContent(languageId: string, newBody: string): string | undefined {
	if (languageId === "typescript" || languageId === "javascript" || languageId === "java") {
		return `class ${WRAPPER_NAME} {\n${newBody}\n}`;
	}
	if (languageId === "rust") {
		return `struct ${WRAPPER_NAME};\nimpl ${WRAPPER_NAME} {\n${newBody}\n}`;
	}
	return undefined;
}

function declarationNameFromMap(map: FileMap, isMember: boolean): string | undefined {
	if (!isMember) return map.symbols[0]?.name;
	const wrapper = map.symbols.find((symbol) => symbol.name === WRAPPER_NAME);
	return wrapper?.children?.[0]?.name;
}

function stripLeadingTrivia(text: string): string {
	let remaining = text.trimStart();
	while (remaining.length > 0) {
		const previous = remaining;
		remaining = remaining
			.replace(/^\/\*[\s\S]*?\*\/\s*/, "")
			.replace(/^\/\/[^\n]*(?:\n|$)\s*/, "")
			.replace(/^#\s*\[[^\]]*\]\s*/, "")
			.replace(/^@[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\s*\([^)]*\))?\s*/, "");
		if (remaining === previous) break;
	}
	return remaining;
}

function stripTrailingTypeParameters(header: string): string {
	const trimmed = header.trimEnd();
	if (!trimmed.endsWith(">")) return trimmed;

	let depth = 0;
	for (let index = trimmed.length - 1; index >= 0; index -= 1) {
		const char = trimmed[index];
		if (char === ">") depth += 1;
		else if (char === "<") {
			depth -= 1;
			if (depth === 0) return trimmed.slice(0, index).trimEnd();
		}
	}
	return trimmed;
}

export function fallbackDeclarationName(newBody: string): string | undefined {
	const declaration = stripLeadingTrivia(newBody);
	const keywordMatch =
		/^(?:(?:export|default|declare|abstract|public|private|protected|static|final|sealed|async|unsafe|extern|pub)(?:\s*\([^)]*\))?\s+)*(?:function|class|interface|enum|record|struct|trait|type|const|let|var|fn)\s+([A-Za-z_$][\w$]*)/.exec(
			declaration,
		);
	if (keywordMatch?.[1]) return keywordMatch[1];

	const openParen = declaration.indexOf("(");
	const openBrace = openParen >= 0 ? declaration.indexOf("{", openParen + 1) : -1;
	if (openParen < 0 || openBrace < 0) return undefined;

	const header = stripTrailingTypeParameters(declaration.slice(0, openParen));
	const callableMatch = /([A-Za-z_$][\w$]*)\s*$/.exec(header);
	const name = callableMatch?.[1];
	return name && !NON_DECLARATION_HEADS.has(name) ? name : undefined;
}

export async function extractReplacementDeclarationName(
	input: ReplacementDeclarationNameInput,
): Promise<string | undefined> {
	const language = detectLanguage(input.filePath);
	if (!language) return undefined;
	const mapper = REPLACEMENT_MAPPERS[language.id];
	if (!mapper) return undefined;

	const parseContent = input.isMember ? memberParseContent(language.id, input.newBody) : input.newBody;
	if (!parseContent) return fallbackDeclarationName(input.newBody);

	try {
		const map = await mapper(input.filePath, parseContent);
		const structuralName = map ? declarationNameFromMap(map, input.isMember) : undefined;
		if (structuralName) return structuralName;
	} catch {
		// A warning heuristic must not make an otherwise valid replacement fail.
	}

	return fallbackDeclarationName(input.newBody);
}
