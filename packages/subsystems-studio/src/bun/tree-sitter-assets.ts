/** Keep the runtime's supported grammars and every build's copied assets aligned. */
import { CONSTRUCT_GRAMMARS } from "../shared/construct-support";
export { grammarFile } from "../shared/construct-support";

export const TREE_SITTER_ASSET_COPIES: Record<string, string> = Object.fromEntries(
	["tree-sitter.wasm", ...new Set(Object.values(CONSTRUCT_GRAMMARS))].map((wasm) => [
		wasm === "tree-sitter.wasm"
			? `node_modules/web-tree-sitter/${wasm}`
			: `node_modules/tree-sitter-wasms/out/${wasm}`,
		`bun/tree-sitter/${wasm}`,
	]),
);
