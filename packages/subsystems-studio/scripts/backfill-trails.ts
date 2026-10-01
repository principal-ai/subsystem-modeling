/**
 * One-shot backfill: rename the `walkthroughs` document field to `trails` on
 * stored subsystem models, ahead of the hard rename in `@principal-ai/subsystems-core`.
 *
 * This is a plain key rename. The array shape is untouched — a trail is a
 * `{ id, title, steps[] }` record both before and after, so nothing inside is
 * rewritten and the `hop` -> `step` terminology fix is documentation-only.
 *
 * Run this BEFORE upgrading to a build that writes `trails`. The model schema is
 * `additionalProperties: false`, so a stored record still carrying `walkthroughs`
 * will not validate against the new schema, and there is no read-time alias.
 *
 * Deliberately does NOT touch:
 *   - `_index.json` — `SubsystemModelIndexEntry` carries no trail field, so the
 *     manifest needs no migration.
 *   - audit reports / proposals — the `walkthrough` verification lane is retired
 *     outright rather than migrated; delete those stores instead.
 *   - maintain briefs — regenerated per run.
 *
 * NOTE: this file must keep naming the OLD key. A repo-wide `walkthrough` ->
 * `trail` rename pass will happily rewrite this script's own logic (it once did,
 * collapsing `hasOld` and `hasNew` onto the same string and turning the write
 * into a no-op delete). `assertKeysDistinct` below fails loudly if that recurs.
 *
 * Usage:
 *   bun scripts/backfill-trails.ts          # dry run
 *   bun scripts/backfill-trails.ts --apply  # write
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ROOT = join(homedir(), ".principal", "subsystem-models");
const APPLY = process.argv.includes("--apply");

/** The pre-rename document field. The post-rename field is the trail name. */
const OLD_KEY = "walkthrough";
const NEW_KEY = "trails";

/**
 * If a rename pass rewrites OLD_KEY into NEW_KEY, `classify` degenerates: every
 * record looks like it has neither key, so the script silently reports "nothing
 * to do" and the migration never happens. Fail instead.
 */
function assertKeysDistinct(): void {
	if (`${OLD_KEY}s` === NEW_KEY) {
		throw new Error(
			`backfill-trails: OLD_KEY ("${OLD_KEY}") and NEW_KEY ("${NEW_KEY}") ` +
				`collide — a repo-wide rename pass rewrote this script's own logic. ` +
				`Restore OLD_KEY to the pre-rename field name.`,
		);
	}
}

/**
 * Re-declared rather than imported so this script keeps compiling after the
 * hard rename lands in subsystems-core, and so it stays the one place in the
 * repo that still knows the old key.
 */
interface StoredModel {
	id?: string;
	title?: string;
	[key: string]: unknown;
}

type Outcome = "migrated" | "already" | "neither" | "conflict";

function classify(model: StoredModel): Outcome {
	const hasOld = OLD_KEY + "s" in model;
	const hasNew = NEW_KEY in model;
	if (hasOld && hasNew) return "conflict";
	if (hasNew) return "already";
	if (hasOld) return "migrated";
	return "neither";
}

async function main(): Promise<void> {
	assertKeysDistinct();

	let names: string[];
	try {
		names = (await fs.readdir(ROOT)).filter(
			(n) => n.endsWith(".json") && n !== "_index.json",
		);
	} catch (err) {
		console.error(`[backfill] cannot read ${ROOT}: ${(err as Error).message}`);
		process.exit(1);
	}

	const oldKey = OLD_KEY + "s";
	let scanned = 0;
	let unreadable = 0;
	let migrated = 0;
	let already = 0;
	let neither = 0;
	const conflicts: string[] = [];

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

		const outcome = classify(model);
		if (outcome === "conflict") {
			conflicts.push(name);
			continue;
		}
		if (outcome === "already") {
			already++;
			continue;
		}
		if (outcome === "neither") {
			neither++;
			continue;
		}

		// `trails` lands last in the object. Key order is cosmetic and the record
		// is a private store file, so this is not worth rebuilding the object for.
		model[NEW_KEY] = model[oldKey];
		delete model[oldKey];
		migrated++;

		if (APPLY) {
			await fs.writeFile(path, JSON.stringify(model, null, 2), "utf8");
		}
	}

	console.log(
		`[backfill] ${APPLY ? "APPLIED" : "DRY RUN"} — scanned ${scanned}, ` +
			`migrated ${migrated}, already had \`${NEW_KEY}\` ${already}, ` +
			`no trail field ${neither}, unreadable ${unreadable}`,
	);

	if (conflicts.length > 0) {
		console.error(
			`[backfill] ${conflicts.length} file(s) carry BOTH \`${oldKey}\` and ` +
				`\`${NEW_KEY}\` — refusing to guess which is authoritative:`,
		);
		for (const name of conflicts) console.error(`[backfill]   ${name}`);
		process.exit(1);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
