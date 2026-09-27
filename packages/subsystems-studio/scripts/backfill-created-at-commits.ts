/**
 * One-shot backfill: stamp `createdAtCommits` on stored subsystem models that
 * predate the field, and drop the retired per-declaration
 * `declarationRef.revision`.
 *
 * Seed order per purl:
 *   1. the historic `declarationRef.revision.headSha` (earliest `capturedAt`),
 *      when present — the true coordinate for models that were anchored; else
 *   2. the current HEAD of the registered checkout.
 *
 * Usage:
 *   bun scripts/backfill-created-at-commits.ts          # dry run
 *   bun scripts/backfill-created-at-commits.ts --apply  # write
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	capturePurlCommits,
	commitsFromDeclarationRefs,
	referencedPurlKeys,
} from "../src/bun/purl-commits";

const ROOT = join(homedir(), ".principal", "subsystem-models");
const APPLY = process.argv.includes("--apply");

interface StoredComponent {
	alias?: string;
	purl?: string;
	declarationRef?: Record<string, unknown> | null;
}

interface StoredModel {
	id?: string;
	title?: string;
	components?: StoredComponent[];
	walkthroughs?: Array<{ steps?: Array<{ purl?: string }> }>;
	createdAtCommits?: Record<string, string>;
}

function referencedPurls(model: StoredModel): Array<string | undefined> {
	const purls: Array<string | undefined> = (model.components ?? []).map(
		(c) => c.purl,
	);
	for (const w of model.walkthroughs ?? []) {
		for (const s of w.steps ?? []) purls.push(s.purl);
	}
	return purls;
}

async function main(): Promise<void> {
	const names = (await fs.readdir(ROOT)).filter(
		(n) => n.endsWith(".json") && n !== "_index.json",
	);
	let scanned = 0;
	let already = 0;
	let anchored = 0;
	let seeded = 0;
	let fellBack = 0;
	let skipped = 0;
	let stripped = 0;

	for (const name of names) {
		const path = join(ROOT, name);
		let model: StoredModel;
		try {
			model = JSON.parse(await fs.readFile(path, "utf8")) as StoredModel;
		} catch {
			continue;
		}
		scanned++;

		const components = model.components ?? [];
		const refKeys = new Set(referencedPurlKeys(referencedPurls(model)));

		// Read the historic pins BEFORE retiring the field.
		const seeds = commitsFromDeclarationRefs(components);
		const seededKeys = Object.keys(seeds).filter((k) => refKeys.has(k));

		// Retire the per-declaration revision (now superseded by the per-purl pin).
		let hadRevision = false;
		for (const c of components) {
			if (c.declarationRef && "revision" in c.declarationRef) {
				hadRevision = true;
				delete c.declarationRef["revision"];
			}
		}

		if (model.createdAtCommits) {
			already++;
			if (hadRevision && APPLY) {
				await fs.writeFile(path, JSON.stringify(model, null, 2), "utf8");
				stripped++;
			}
			continue;
		}

		const fallback = await capturePurlCommits(
			components.map((c) => ({ alias: c.alias ?? "", purl: c.purl })),
		);

		const commits: Record<string, string> = { ...fallback, ...seeds };
		for (const key of Object.keys(commits)) {
			if (!refKeys.has(key)) delete commits[key];
		}
		if (Object.keys(commits).length === 0) {
			skipped++;
			continue;
		}

		model.createdAtCommits = commits;
		anchored++;
		seeded += seededKeys.length;
		fellBack += Object.keys(commits).length - seededKeys.length;
		if (hadRevision) stripped++;

		if (APPLY) {
			await fs.writeFile(path, JSON.stringify(model, null, 2), "utf8");
		}
	}

	console.log(
		`[backfill] ${APPLY ? "APPLIED" : "DRY RUN"} — scanned ${scanned}, ` +
			`already pinned ${already}, anchored ${anchored} ` +
			`(seeded ${seeded} from declaration refs, ${fellBack} from current HEAD), ` +
			`skipped (nothing resolvable) ${skipped}, revision stripped ${stripped}`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
