// CSS imported with `{ type: "text" }` (see mainview/index.tsx) is inlined by
// the electrobun/bun bundler as a string. Tell TypeScript the default export is
// that string so the text imports type-check under verbatimModuleSyntax.
declare module "*.css" {
	const css: string;
	export default css;
}
