/**
 * Headless span-classification spike.
 *
 * Runs the graphify + tree-sitter derivation classifier across stored subsystem
 * models and prints the class distribution. Read-only.
 *
 *   bun scripts/classify-spans.ts                 # all models, use caches as-is
 *   bun scripts/classify-spans.ts --ensure        # build/refresh graphify first
 *   bun scripts/classify-spans.ts <modelId>       # one model
 *   bun scripts/classify-spans.ts <modelId> --ensure
 */

import {
	classifyAllSpans,
	classifyModelSpans,
	GATE_LABELS,
} from "../src/bun/span-derivation";

const args = process.argv.slice(2);
const ensure = args.includes("--ensure");
const modelId = args.find((a) => !a.startsWith("--"));

const opts = {
	ensure,
	onModel: (id: string, i: number) =>
		process.stderr.write(`  [${i + 1}] ${id}${ensure ? " (ensuring graphify…)" : ""}\n`),
};

const report = modelId
	? await classifyModelSpans(modelId, opts)
	: await classifyAllSpans(opts);

if (!report) {
	console.error(`unknown model: ${modelId}`);
	process.exit(1);
}

const s = report.summary;
console.log(`\nmodels: ${report.models}  components: ${s.total}\n`);

console.log("by class:");
for (const [cls, n] of Object.entries(s.byClass).sort((a, b) => b[1] - a[1])) {
	console.log(`  ${cls.padEnd(14)} ${n}`);
}

console.log("\nby language:");
for (const [lang, n] of Object.entries(s.byLanguage).sort((a, b) => b[1] - a[1])) {
	console.log(`  ${lang.padEnd(14)} ${n}`);
}

console.log("\nclass × language:");
for (const [cls, langs] of Object.entries(s.byClassLanguage)) {
	const parts = Object.entries(langs)
		.sort((a, b) => b[1] - a[1])
		.map(([l, n]) => `${l}=${n}`)
		.join(" ");
	console.log(`  ${cls.padEnd(14)} ${parts}`);
}

console.log("\ncoverage:", JSON.stringify(s.coverage));

console.log("\nfailed gates:");
for (const [gate, n] of Object.entries(s.failedGates).sort((a, b) => b[1] - a[1])) {
	console.log(`  ${gate.padEnd(20)} ${n}  ${GATE_LABELS[gate] ?? ""}`);
}

// Of the components that were *classifiable* (had an anchor + grammar),
// what fraction landed trivial vs ambiguous? This is the headline number.
const classifiable = report.components.filter(
	(c) =>
		c.result.graphifyStart != null &&
		!c.result.failedGates.includes("no-grammar"),
);
const cTrivial = classifiable.filter((c) => c.result.class === "trivial").length;
const cDet = classifiable.filter((c) => c.result.class === "deterministic").length;
const cAmb = classifiable.filter((c) => c.result.class === "ambiguous").length;
const cUnknown = classifiable.filter((c) => c.result.class === "unknown").length;
console.log(
	`\nclassifiable (anchored + grammar): ${classifiable.length}` +
		`  trivial=${cTrivial} deterministic=${cDet} ambiguous=${cAmb} unknown=${cUnknown}`,
);

const interesting = report.components.filter(
	(c) => c.result.class === "ambiguous" || c.result.class === "unknown",
);
console.log(`\nsample non-trivial (${interesting.length} of ${s.total}):`);
for (const c of interesting.slice(0, 25)) {
	console.log(
		`  [${c.result.class}] ${c.file} · ${c.symbol} (${c.construct}) — ` +
			`${c.result.failedGates.join(",") || "clean"}` +
			(c.result.derivedEnd ? ` end=L${c.result.derivedEnd}` : ""),
	);
}
