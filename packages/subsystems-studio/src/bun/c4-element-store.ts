/**
 * The C4 element store — the durable home of a repo's approved C4 elements.
 *
 * Layout: `~/.principal/c4-elements/<sanitized-purl>.json`, holding a
 * `C4ElementSet` from @principal-ai/subsystems-react (imported, not mirrored,
 * as of react 0.52.0).
 *
 * The store is the approved architecture, not a history: it holds ACCEPTED
 * elements only. `proposed` exists only on in-memory proposal scaffolds and
 * is never persisted; a rejected proposal stays remembered by the proposal
 * store (`~/.principal/subsystem-model-proposals/`), which is where proposing
 * agents consult prior rejections.
 *
 * An accepted container here is what a process boundary reads its `verified`
 * status from — verification is read (`verifyProcessBoundaries`), never
 * stored.
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { sanitizePurlDirName } from "./graphify-store";
import { purlRepoKey } from "./subsystem-model-store";
import type {
	C4Container,
	C4Element,
	C4ElementSet,
} from "@principal-ai/subsystems-react";

const ROOT = join(homedir(), ".principal", "c4-elements");

/**
 * Root home for the store. `PRINCIPAL_C4_ELEMENTS_HOME` overrides the real
 * `~/.principal`, so tests redirect writes to a tmpdir (read at call time —
 * an override set after module load still applies).
 */
function storeRoot(override?: string): string {
	if (override) return override;
	const env = process.env["PRINCIPAL_C4_ELEMENTS_HOME"]?.trim();
	return env ? env : ROOT;
}

/** The store's on-disk state — accepted only, per the C4ElementSet contract. */
export type C4ElementStoreState = "accepted";

/**
 * The store's entry type: a `C4Element` pinned to `accepted`. Published sets
 * never carry `proposed` / `rejected` — those live on in-memory scaffolds.
 */
export type C4ElementStoreEntry = C4Element & { state: C4ElementStoreState };

export interface C4ElementSetFile extends C4ElementSet {
	version: 1;
	/** Repo key, e.g. `pkg:github/owner/name`. */
	repoKey: string;
	updatedAt?: string;
	elements: C4ElementStoreEntry[];
}

/**
 * The payload a `c4-container` proposal change carries — the container
 * scaffold (a `C4Container` minus the state the store forces).
 */
export type C4ContainerUpsert = Omit<C4Container, "state" | "kind">;

function filePath(repoKey: string, root?: string): string {
	return join(storeRoot(root), `${sanitizePurlDirName(repoKey)}.json`);
}

export function c4ElementId(prefix: string, key: string): string {
	return `${prefix}:${key}`;
}

async function readDoc(repoKey: string, root?: string): Promise<C4ElementSetFile> {
	try {
		const raw = await fs.readFile(filePath(repoKey, root), "utf8");
		const parsed = JSON.parse(raw) as C4ElementSetFile;
		if (!parsed || !Array.isArray(parsed.elements)) {
			return { version: 1, repoKey, elements: [] };
		}
		return {
			version: 1,
			repoKey: parsed.repoKey || repoKey,
			updatedAt: parsed.updatedAt,
			elements: parsed.elements,
		};
	} catch {
		return { version: 1, repoKey, elements: [] };
	}
}

async function writeDoc(doc: C4ElementSetFile, root?: string): Promise<void> {
	await fs.mkdir(storeRoot(root), { recursive: true });
	await fs.writeFile(
		filePath(doc.repoKey, root),
		`${JSON.stringify(doc, null, "\t")}\n`,
		"utf8",
	);
}

/** Read a repo's accepted element set. Absent file reads as an empty set. */
export async function readC4ElementSet(
	purl: string,
	root?: string,
): Promise<C4ElementSetFile> {
	const key = purlRepoKey(purl) ?? purl.trim();
	return readDoc(key, root);
}

/**
 * Upsert accepted containers (or elements) into a repo's element set.
 * Replaces any prior element with the same `id`; forces `state: "accepted"`
 * and stamps `decidedAt` — the caller never chooses the state, because the
 * store holds accepts only.
 */
export async function upsertAcceptedC4Elements(
	input: {
		purl: string;
		elements: Array<C4ContainerUpsert & { kind?: C4ElementStoreEntry["kind"] }>;
		/** Attribution — the proposal (and its runId) that produced the accept. */
		provenance?: { runId?: string; proposalId?: string };
		rationale?: string;
	},
	root?: string,
): Promise<{ ok: true; set: C4ElementSetFile } | { ok: false; error: string }> {
	const repoKey = purlRepoKey(input.purl) ?? input.purl.trim();
	if (!repoKey) return { ok: false, error: "purl is required" };
	if (!Array.isArray(input.elements) || input.elements.length === 0) {
		return { ok: false, error: "elements array is required" };
	}
	for (const e of input.elements) {
		if (!e.id?.trim()) return { ok: false, error: "element id is required" };
		if (!e.label?.trim()) return { ok: false, error: "element label is required" };
		if (
			e.containerKind != null &&
			e.containerKind !== "application" &&
			e.containerKind !== "data-store"
		) {
			return { ok: false, error: `unknown containerKind: ${e.containerKind}` };
		}
	}

	const now = new Date().toISOString();
	const doc = await readDoc(repoKey, root);
	for (const e of input.elements) {
		// The store is JSON on disk, not a discriminated-union enforcer: the
		// entry is built field-wise and pinned to the accepted state.
		const entry: C4ElementStoreEntry = {
			kind: "container",
			id: e.id.trim(),
			label: e.label.trim(),
			state: "accepted",
			decidedAt: now,
			...(e.description?.trim() && { description: e.description.trim() }),
			...((e.rationale ?? input.rationale)?.trim() && {
				rationale: (e.rationale ?? input.rationale)!.trim(),
			}),
			containerKind: e.containerKind ?? "application",
			technology: e.technology?.trim() ?? "",
			process: e.process?.trim(),
		} as C4ElementStoreEntry;
		const idx = doc.elements.findIndex((x) => x.id === entry.id);
		if (idx >= 0) doc.elements[idx] = entry;
		else doc.elements.push(entry);
	}
	doc.updatedAt = now;
	await writeDoc(doc, root);
	return { ok: true, set: doc };
}
