import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Parser, Language, type Tree } from "web-tree-sitter";
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

/** Drop the cached runtime so the next parse re-initializes from scratch. */
function resetParserRuntime(): void {
	parserInit = null;
	grammars.clear();
	parsers.clear();
}

/**
 * One long-lived Parser per grammar, reused. Creating a Parser per file churns
 * the WASM heap and aborts under a large run; a shared parser is safe because
 * `parseWith` serializes every call.
 */
const parsers = new Map<string, Promise<Parser>>();
export async function sharedParserFor(file: string): Promise<Parser | null> {
	const wasm = grammarFile(file);
	if (!wasm) return null;
	let pending = parsers.get(wasm);
	if (!pending) {
		pending = (async () => {
			const language = await loadLanguage(wasm);
			const parser = new Parser();
			parser.setLanguage(language);
			return parser;
		})();
		parsers.set(wasm, pending);
	}
	return pending;
}

let parseQueue: Promise<unknown> = Promise.resolve();

/**
 * Parse one file, serialized. web-tree-sitter's WASM runtime aborts if a parser
 * is used concurrently, and an abort poisons the cached runtime — so calls are
 * chained, and a throw drops the runtime so the next file re-initializes rather
 * than failing forever.
 */
export function parseWith(parser: Parser, content: string): Promise<Tree> {
	const task = async (): Promise<Tree> => {
		try {
			const tree = parser.parse(content);
			if (!tree) throw new Error("Tree-sitter returned no syntax tree.");
			return tree;
		} catch (error) {
			resetParserRuntime();
			throw error;
		}
	};
	const result = parseQueue.then(task, task);
	parseQueue = result.then(() => undefined, () => undefined);
	return result;
}
