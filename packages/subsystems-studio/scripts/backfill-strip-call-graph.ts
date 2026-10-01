/**
 * One-shot backfill: delete the retired call-graph buckets from stored
 * subsystem models.
 *
 * `function` declarations carried `callers`/`callees`, `class` carried
 * `instantiations`/`references`, and `type` carried `usedBy`/`implementors`.
 * All six are gone from the document: nothing ever populated them (0 non-empty
 * across every local model), and a referenced-symbol click resolves against the
 * host's graphify cache at inspection time — `inspectSubsystemSymbol` in
 * `bun/inspect-symbol.ts` calls `getCachedGraphifyGraph` — rather than reading
 * stored edges.
 *
 * They were also `required` in the published schema, so a model had to pad
 * itself with empty arrays to validate. That is what forced
 * `normalizeDeclarationProvenance`'s array backfill to exist. With the fields
 * removed, a declaration is honest about what it knows and the backfill is
 * unnecessary.
 *
 * This is safe to run at any time: every affected array in every local model is
 * empty, so nothing is lost. The script refuses to touch a non-empty bucket
 * rather than deleting real data.
 *
 * Usage:
 *   bun scripts/backfill-strip-call-graph.ts          # dry run
 *   bun scripts/backfill-strip-call-graph.ts --apply  # write
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ROOT = join(homedir(), ".principal", "subsystem-models");
const APPLY = process.argv.includes("--apply");

/** declaration kind -> the retired buckets it carried. */
const RETIRED: Record<string, string[]> = {
	function: ["callers", "callees"],
	class: ["instantiations", "references"],
	type: ["usedBy", "implementors"],
};

interface StoredModel {
	id?: string;
	title?: string;
	components?: Array<{ declaration?: Record<string, unknown> }>;
}

async function main(): Promise<void> {
	let names: string[];
	try {
		names = (await fs.readdir(ROOT)).filter(
			(n) => n.endsWith(".json") && n !== "_index.json",
		);
	} catch (err) {
		console.error(`[backfill] cannot read ${ROOT}: ${(err as Error).message}`);
		process.exit(1);
	}

	let scanned = 0;
	let unreadable = 0;
	let modelsTouched = 0;
	let fieldsRemoved = 0;
	const nonEmpty: string[] = [];

	for (const name of names) {
		const path = join(ROOT, name);
		let model: StoredModel;
		try {
			model = JSON.parse(await fs.readFile(path, "utf8")) as StoredModel;
		} catch {
			unreadable++;
			continue;
		}
		scanned++;

		let touchedHere = 0;
		for (const component of model.components ?? []) {
			const declaration = component.declaration;
			if (!declaration || typeof declaration !== "object") continue;
			for (const field of RETIRED[String(declaration["kind"])] ?? []) {
				if (!(field in declaration)) continue;
				const value = declaration[field];
				// Never delete real data: a populated bucket means something wrote
				// edges the schema no longer accepts. Report and leave it.
				if (Array.isArray(value) ? value.length > 0 : value != null) {
					nonEmpty.push(`${name} (${component.declaration["kind"]}.${field})`);
					continue;
				}
				delete declaration[field];
				touchedHere++;
			}
		}
		if (touchedHere === 0) continue;

		modelsTouched++;
		fieldsRemoved += touchedHere;
		if (APPLY) await fs.writeFile(path, JSON.stringify(model, null, 2), "utf8");
	}

	console.log(
		`[backfill] ${APPLY ? "APPLIED" : "DRY RUN"} — scanned ${scanned}, ` +
			`removed ${fieldsRemoved} empty call-graph field(s) across ` +
			`${modelsTouched} model(s), unreadable ${unreadable}`,
	);

	if (nonEmpty.length > 0) {
		console.error(
			`[backfill] ${nonEmpty.length} non-empty bucket(s) left in place (not deleted):`,
		);
		for (const n of nonEmpty) console.error(`[backfill]   ${n}`);
		process.exit(1);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
