/**
 * One-shot backfill: strip the retired `component.capture` field from stored
 * subsystem models.
 *
 * `capture` was a 3-value editorial enum recording how the authoring session
 * occupied a component:
 *
 *   "edited"     the author wrote or edited it
 *   "analyzed"   it was read/analyzed but not edited
 *   "referenced" merely referenced
 *
 * It was removed from the model schema in 55d0a8e (2026-09-11, "Split topology
 * relations from walkthroughs and ship model maintenance") and nothing in the
 * codebase reads it. Because the schema is `additionalProperties: false`, every
 * component still carrying it fails validation on load.
 *
 * This is a LOSSY removal. The surviving `declarationProvenance`
 * ("verified" | "authored") is a different and richer signal — it records
 * whether verification confirmed a claim, not how the author reached the
 * component — so it does not fully replace `capture`. The dry run prints the
 * full per-value inventory before anything is written, so the editorial fact is
 * never dropped without being seen.
 *
 * Deliberately does NOT touch:
 *   - `declaration.attributes` on `kind: "external"` declarations. The store's
 *     `foldLegacyStoreDeclarationFields` is `kind`-scoped to "store" and never
 *     folds those, but migrating them means moving real prose into
 *     `purpose` and supplying a `label` — a per-component judgement call, not a
 *     mechanical rewrite. Left for a separate pass.
 *   - the retired top-level `relations` key. Inert already: the store's
 *     document body omits it and it never reaches validation.
 *
 * Usage:
 *   bun scripts/backfill-strip-capture.ts          # dry run
 *   bun scripts/backfill-strip-capture.ts --apply  # write
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ROOT = join(homedir(), ".principal", "subsystem-models");
const APPLY = process.argv.includes("--apply");

/** The retired field this script removes. */
const FIELD = "capture";

/**
 * Re-declared rather than imported so this script keeps compiling after the
 * schema moves on, and so it stays readable on its own.
 */
interface StoredComponent {
	[FIELD]?: unknown;
}

interface StoredModel {
	id?: string;
	title?: string;
	components?: StoredComponent[];
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
	let componentsTouched = 0;
	/** value -> component count, for the lossy-removal inventory. */
	const byValue = new Map<string, number>();

	for (const name of names) {
		const path = join(ROOT, name);
		let model: StoredModel;
		try {
			model = JSON.parse(await fs.readFile(path, "utf8")) as StoredModel;
		} catch {
			// Not JSON, or unreadable. Leave it alone and let the store's own
			// read path report it — a migration script must not guess here.
			unreadable++;
			continue;
		}
		scanned++;

		let touchedHere = 0;
		for (const component of model.components ?? []) {
			if (!(FIELD in component)) continue;
			const value = component[FIELD];
			const label =
				typeof value === "string" ? `"${value}"` : `<${typeof value}>`;
			byValue.set(label, (byValue.get(label) ?? 0) + 1);
			delete component[FIELD];
			touchedHere++;
		}
		if (touchedHere === 0) continue;

		modelsTouched++;
		componentsTouched += touchedHere;
		if (APPLY) {
			await fs.writeFile(path, JSON.stringify(model, null, 2), "utf8");
		}
	}

	console.log(
		`[backfill] ${APPLY ? "APPLIED" : "DRY RUN"} — scanned ${scanned}, ` +
			`stripped \`${FIELD}\` from ${componentsTouched} component(s) across ` +
			`${modelsTouched} model(s), unreadable ${unreadable}`,
	);

	if (byValue.size > 0) {
		const inventory = [...byValue]
			.sort((a, b) => b[1] - a[1])
			.map(([v, n]) => `${v} x${n}`)
			.join(", ");
		console.log(`[backfill] values removed (not recoverable): ${inventory}`);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
