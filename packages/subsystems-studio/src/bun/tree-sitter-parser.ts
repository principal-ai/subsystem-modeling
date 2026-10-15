import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Parser, Language } from "web-tree-sitter";
import { grammarFile } from "./tree-sitter-assets";

const require = createRequire(import.meta.url);

function wasmPath(wasm: string): string {
	// Bundled imports share app/bun/index.js's import.meta.dir. The package
	// resolver is only a fallback for unbundled source/scripts in a checkout.
	const bundled = join(import.meta.dir, "tree-sitter", wasm);
	if (existsSync(bundled)) return bundled;
	try {
		return require.resolve(wasm === "tree-sitter.wasm"
			? `web-tree-sitter/${wasm}`
			: `tree-sitter-wasms/out/${wasm}`);
	} catch {
		throw new Error(`Missing Tree-sitter WASM asset: ${wasm}. Rebuild Studio to include its parser assets.`);
	}
}

let parserInit: Promise<void> | null = null;
const grammars = new Map<string, Promise<Language>>();

async function loadLanguage(wasm: string): Promise<Language> {
	let pending = grammars.get(wasm);
	if (pending) return pending;
	pending = (async () => {
		if (!parserInit) {
			const runtimePath = wasmPath("tree-sitter.wasm");
			// Emscripten's default relative lookup points at the JS bundle, not
			// the installed dependency, after Electrobun bundles the host.
			parserInit = Parser.init({ locateFile: () => runtimePath });
		}
		await parserInit;
		return Language.load(wasmPath(wasm));
	})();
	grammars.set(wasm, pending);
	return pending;
}

export async function parserFor(file: string): Promise<Parser | null> {
	const wasm = grammarFile(file);
	if (!wasm) return null;
	const language = await loadLanguage(wasm);
	const parser = new Parser();
	parser.setLanguage(language);
	return parser;
}
