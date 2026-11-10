/**
 * Tree-sitter parser runtime — shared implementation in the core audit layer.
 *
 * Studio keeps this module as the host-side import path; the parser itself
 * (WASM lookup, shared parsers, serialized parse queue) lives in
 * `@principal-ai/subsystems-core/audit`.
 */
export {
	parserFor,
	parseWith,
	sharedParserFor,
} from "../../../subsystems-core/src/audit/verify/parser";
