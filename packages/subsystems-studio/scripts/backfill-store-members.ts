/**
 * One-shot backfill: rename `declaration.members` to `declaration.properties` on
 * stored subsystem models.
 *
 * `storeDeclaration` requires `properties`; early models wrote `members` for
 * the same thing. The shapes are identical (`{ name, type? }` — a table column
 * is a named member), so this rename is lossless. Until now
 * `foldLegacyStoreDeclarationFields` did it in memory on every read, which is
 * why the records validated on load but never on disk.
 *
 * Narrow on purpose: only `kind: "store"` declarations are touched, and a
 * declaration that already has `properties` is left alone rather than having
 * them overwritten. `external` declarations' `attributes` are NOT handled here
 * — those carry prose with no schema home, so what to do with them is a
 * per-component judgement, not a rewrite.
 *
 * Usage:
 *   bun scripts/backfill-store-members.ts          # dry run
 *   bun scripts/backfill-store-members.ts --apply  # write
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ROOT = join(homedir(), ".principal", "subsystem-models");
const APPLY = process.argv.includes("--apply");

const OLD_FIELD = "members";
const NEW_FIELD = "properties";

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
	let fieldsRenamed = 0;
	let entries = 0;
	const conflicts: string[] = [];

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
			if (declaration["kind"] !== "store") continue;
			if (!Array.isArray(declaration[OLD_FIELD])) continue;

			// A declaration carrying both is ambiguous — never guess which wins.
			if (Array.isArray(declaration[NEW_FIELD])) {
				conflicts.push(`${name} (has both ${OLD_FIELD} and ${NEW_FIELD})`);
				continue;
			}

			const value = declaration[OLD_FIELD] as unknown[];
			declaration[NEW_FIELD] = value;
			delete declaration[OLD_FIELD];
			touchedHere++;
			entries += value.length;
		}
		if (touchedHere === 0) continue;

		modelsTouched++;
		fieldsRenamed += touchedHere;
		if (APPLY) await fs.writeFile(path, JSON.stringify(model, null, 2), "utf8");
	}

	console.log(
		`[backfill] ${APPLY ? "APPLIED" : "DRY RUN"} — scanned ${scanned}, ` +
			`renamed ${OLD_FIELD} → ${NEW_FIELD} on ${fieldsRenamed} store ` +
			`declaration(s) carrying ${entries} entr(ies) across ${modelsTouched} ` +
			`model(s), unreadable ${unreadable}`,
	);

	if (conflicts.length > 0) {
		console.error(
			`[backfill] ${conflicts.length} declaration(s) carry BOTH \`${OLD_FIELD}\` and ` +
				`\`${NEW_FIELD}\` — refusing to guess:`,
		);
		for (const c of conflicts) console.error(`[backfill]   ${c}`);
		process.exit(1);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
