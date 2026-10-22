/** Shared by parser loading, asset packaging and file-map support labels. */
export const CONSTRUCT_GRAMMARS: Readonly<Record<string, string>> = {
	".ts": "tree-sitter-typescript.wasm",
	".tsx": "tree-sitter-tsx.wasm",
	".js": "tree-sitter-javascript.wasm",
	".jsx": "tree-sitter-javascript.wasm",
	".mjs": "tree-sitter-javascript.wasm",
	".cjs": "tree-sitter-javascript.wasm",
	".py": "tree-sitter-python.wasm",
	".go": "tree-sitter-go.wasm",
	".rs": "tree-sitter-rust.wasm",
	".java": "tree-sitter-java.wasm",
	".rb": "tree-sitter-ruby.wasm",
	".php": "tree-sitter-php.wasm",
};

function extension(file: string): string {
	const name = file.slice(file.lastIndexOf("/") + 1);
	const dot = name.lastIndexOf(".");
	return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

export function grammarFile(file: string): string | null {
	return CONSTRUCT_GRAMMARS[extension(file)] ?? null;
}

// Only known non-code formats are exempt. Unknown extensions remain unsupported.
const NON_CODE_EXTENSIONS = new Set([
	".md", ".mdx", ".txt", ".rst", ".adoc",
	".json", ".jsonc", ".yaml", ".yml", ".toml", ".xml", ".ini", ".cfg",
	".lock", ".csv", ".tsv",
	".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp",
	".ttf", ".otf", ".woff", ".woff2", ".eot",
	".mp3", ".wav", ".ogg", ".mp4", ".webm", ".pdf",
]);
const NON_CODE_NAMES = new Set([
	"readme", "license", "licence", "copying", "notice", "authors", "changelog",
	".gitignore", ".gitattributes", ".gitmodules", ".editorconfig",
]);

export function constructFileSupport(file: string): "supported" | "unsupported" | "non-code" {
	if (grammarFile(file)) return "supported";
	const name = file.slice(file.lastIndexOf("/") + 1).toLowerCase();
	return NON_CODE_EXTENSIONS.has(extension(file)) || NON_CODE_NAMES.has(name) ? "non-code" : "unsupported";
}
