/** Keep the runtime's supported grammars and every build's copied assets aligned. */
const GRAMMARS: Record<string, string> = {
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

export const TREE_SITTER_ASSET_COPIES: Record<string, string> = Object.fromEntries(
	["tree-sitter.wasm", ...new Set(Object.values(GRAMMARS))].map((wasm) => [
		wasm === "tree-sitter.wasm"
			? `node_modules/web-tree-sitter/${wasm}`
			: `node_modules/tree-sitter-wasms/out/${wasm}`,
		`bun/tree-sitter/${wasm}`,
	]),
);

export function grammarFile(file: string): string | null {
	const dot = file.lastIndexOf(".");
	return dot < 0 ? null : GRAMMARS[file.slice(dot).toLowerCase()] ?? null;
}
