/**
 * Repo-level sparse facts that fill gaps graphify left thin (e.g. construct
 * when the extractor inferred `unknown`). Survives graphify slot rebuilds.
 *
 * Layout: `~/.principal/graphify-augmentations/<sanitized-purl>.json`
 */

import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { sanitizePurlDirName } from "./graphify-store";
import { purlRepoKey } from "./subsystem-model-store";

const ROOT = join(homedir(), ".principal", "graphify-augmentations");

export type GraphifyAugmentationStatus = "accepted" | "rejected";

/** Named-type bags confirming a function/method signature when Graphify has no edges. */
export type GraphifySignatureAugmentationClaim = {
	parameterTypes: string[];
	returnTypes: string[];
};

/**
 * Confirm a model topology claim (from → to, relationType) when Graphify left
 * the edge thin. Keyed by from file#symbol under the source purl; target via
 * file#symbol when available, else id/name (externals).
 */
export type GraphifyRelationAugmentationClaim = {
	relationType: string;
	toFile?: string;
	toSymbol?: string;
	toId?: string;
	toName?: string;
};

/**
 * Confirm an intentional module≠file grouping when the frame key is not the
 * source file (or a path prefix). Keyed by file#symbol under the component purl.
 */
export type GraphifyModuleAugmentationClaim = {
	/** Claimed module frame key. */
	module: string;
};

export interface GraphifyAugmentation {
	id: string;
	purl: string;
	file: string;
	symbol: string;
	claims: {
		construct?: string;
		signature?: GraphifySignatureAugmentationClaim;
		relation?: GraphifyRelationAugmentationClaim;
		module?: GraphifyModuleAugmentationClaim;
	};
	evidence?: string[];
	provenance: {
		source: string;
		at: string;
		rationale?: string;
	};
	status: GraphifyAugmentationStatus;
	resolvedAt?: string;
}

interface AugmentationFile {
	version: 1;
	purl: string;
	augmentations: GraphifyAugmentation[];
}

function storeRoot(override?: string): string {
	return override ?? ROOT;
}

function filePath(purlKey: string, root?: string): string {
	return join(storeRoot(root), `${sanitizePurlDirName(purlKey)}.json`);
}

function newId(): string {
	return `ga-${randomBytes(6).toString("hex")}`;
}

/** Normalize identity for lookup (posix-ish path, trim symbol). */
export function augmentationKey(file: string, symbol: string): string {
	const f = file.trim().replace(/\\/g, "/").replace(/^\.\//, "");
	const s = symbol.trim();
	return `${f}::${s}`;
}

async function readDoc(
	purlKey: string,
	root?: string,
): Promise<AugmentationFile> {
	try {
		const raw = await fs.readFile(filePath(purlKey, root), "utf8");
		const parsed = JSON.parse(raw) as AugmentationFile;
		if (!parsed || !Array.isArray(parsed.augmentations)) {
			return { version: 1, purl: purlKey, augmentations: [] };
		}
		return {
			version: 1,
			purl: parsed.purl || purlKey,
			augmentations: parsed.augmentations,
		};
	} catch {
		return { version: 1, purl: purlKey, augmentations: [] };
	}
}

async function writeDoc(doc: AugmentationFile, root?: string): Promise<void> {
	const dir = storeRoot(root);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(
		filePath(doc.purl, root),
		`${JSON.stringify(doc, null, 2)}\n`,
		"utf8",
	);
}

export async function listGraphifyAugmentations(
	purl: string,
	opts?: { storeRoot?: string; status?: GraphifyAugmentationStatus },
): Promise<GraphifyAugmentation[]> {
	const key = purlRepoKey(purl) ?? purl.trim();
	if (!key) return [];
	const doc = await readDoc(key, opts?.storeRoot);
	if (!opts?.status) return doc.augmentations;
	return doc.augmentations.filter((a) => a.status === opts.status);
}

/**
 * Latest accepted construct claim for this file+symbol, if any.
 */
export async function findAcceptedConstructAugmentation(
	opts: {
		purl: string;
		file: string;
		symbol: string;
		storeRoot?: string;
	},
): Promise<GraphifyAugmentation | null> {
	const key = purlRepoKey(opts.purl) ?? opts.purl.trim();
	if (!key || !opts.file?.trim() || !opts.symbol?.trim()) return null;
	const want = augmentationKey(opts.file, opts.symbol);
	const doc = await readDoc(key, opts.storeRoot);
	const accepted = doc.augmentations.filter(
		(a) =>
			a.status === "accepted" &&
			augmentationKey(a.file, a.symbol) === want &&
			typeof a.claims.construct === "string" &&
			a.claims.construct.trim().length > 0,
	);
	if (accepted.length === 0) return null;
	// Prefer newest resolved/provenance timestamp.
	accepted.sort((a, b) => {
		const at = a.resolvedAt ?? a.provenance.at;
		const bt = b.resolvedAt ?? b.provenance.at;
		return bt.localeCompare(at);
	});
	return accepted[0] ?? null;
}

export async function upsertAcceptedConstructAugmentation(input: {
	purl: string;
	file: string;
	symbol: string;
	construct: string;
	source: string;
	rationale?: string;
	evidence?: string[];
	storeRoot?: string;
}): Promise<
	| { ok: true; augmentation: GraphifyAugmentation }
	| { ok: false; error: string }
> {
	const key = purlRepoKey(input.purl) ?? input.purl.trim();
	if (!key) return { ok: false, error: "purl is required" };
	const file = input.file.trim().replace(/\\/g, "/");
	const symbol = input.symbol.trim();
	const construct = input.construct.trim();
	if (!file) return { ok: false, error: "file is required" };
	if (!symbol) return { ok: false, error: "symbol is required" };
	if (!construct) return { ok: false, error: "construct is required" };

	const now = new Date().toISOString();
	const want = augmentationKey(file, symbol);
	const doc = await readDoc(key, input.storeRoot);

	// Supersede prior accepted construct augs for the same identity.
	for (let i = 0; i < doc.augmentations.length; i++) {
		const a = doc.augmentations[i]!;
		if (
			a.status === "accepted" &&
			augmentationKey(a.file, a.symbol) === want &&
			a.claims.construct
		) {
			doc.augmentations[i] = {
				...a,
				status: "rejected",
				resolvedAt: now,
			};
		}
	}

	const augmentation: GraphifyAugmentation = {
		id: newId(),
		purl: key,
		file,
		symbol,
		claims: { construct },
		evidence: input.evidence,
		provenance: {
			source: input.source.trim() || "unknown",
			at: now,
			rationale: input.rationale?.trim() || undefined,
		},
		status: "accepted",
		resolvedAt: now,
	};
	doc.augmentations.unshift(augmentation);
	await writeDoc(doc, input.storeRoot);
	return { ok: true, augmentation };
}

function normalizeSignatureClaim(
	raw: GraphifySignatureAugmentationClaim | undefined,
): GraphifySignatureAugmentationClaim | null {
	if (!raw || typeof raw !== "object") return null;
	const parameterTypes = Array.isArray(raw.parameterTypes)
		? raw.parameterTypes
				.filter((t): t is string => typeof t === "string")
				.map((t) => t.trim())
				.filter(Boolean)
		: [];
	const returnTypes = Array.isArray(raw.returnTypes)
		? raw.returnTypes
				.filter((t): t is string => typeof t === "string")
				.map((t) => t.trim())
				.filter(Boolean)
		: [];
	if (parameterTypes.length === 0 && returnTypes.length === 0) return null;
	return { parameterTypes, returnTypes };
}

/**
 * Latest accepted signature claim for this file+symbol, if any.
 */
export async function findAcceptedSignatureAugmentation(
	opts: {
		purl: string;
		file: string;
		symbol: string;
		storeRoot?: string;
	},
): Promise<GraphifyAugmentation | null> {
	const key = purlRepoKey(opts.purl) ?? opts.purl.trim();
	if (!key || !opts.file?.trim() || !opts.symbol?.trim()) return null;
	const want = augmentationKey(opts.file, opts.symbol);
	const doc = await readDoc(key, opts.storeRoot);
	const accepted = doc.augmentations.filter(
		(a) =>
			a.status === "accepted" &&
			augmentationKey(a.file, a.symbol) === want &&
			normalizeSignatureClaim(a.claims.signature) != null,
	);
	if (accepted.length === 0) return null;
	accepted.sort((a, b) => {
		const at = a.resolvedAt ?? a.provenance.at;
		const bt = b.resolvedAt ?? b.provenance.at;
		return bt.localeCompare(at);
	});
	return accepted[0] ?? null;
}

export async function upsertAcceptedSignatureAugmentation(input: {
	purl: string;
	file: string;
	symbol: string;
	signature: GraphifySignatureAugmentationClaim;
	source: string;
	rationale?: string;
	evidence?: string[];
	storeRoot?: string;
}): Promise<
	| { ok: true; augmentation: GraphifyAugmentation }
	| { ok: false; error: string }
> {
	const key = purlRepoKey(input.purl) ?? input.purl.trim();
	if (!key) return { ok: false, error: "purl is required" };
	const file = input.file.trim().replace(/\\/g, "/");
	const symbol = input.symbol.trim();
	const signature = normalizeSignatureClaim(input.signature);
	if (!file) return { ok: false, error: "file is required" };
	if (!symbol) return { ok: false, error: "symbol is required" };
	if (!signature) {
		return {
			ok: false,
			error: "signature must include at least one parameter or return type",
		};
	}

	const now = new Date().toISOString();
	const want = augmentationKey(file, symbol);
	const doc = await readDoc(key, input.storeRoot);

	for (let i = 0; i < doc.augmentations.length; i++) {
		const a = doc.augmentations[i]!;
		if (
			a.status === "accepted" &&
			augmentationKey(a.file, a.symbol) === want &&
			a.claims.signature
		) {
			doc.augmentations[i] = {
				...a,
				status: "rejected",
				resolvedAt: now,
			};
		}
	}

	const augmentation: GraphifyAugmentation = {
		id: newId(),
		purl: key,
		file,
		symbol,
		claims: { signature },
		evidence: input.evidence,
		provenance: {
			source: input.source.trim() || "unknown",
			at: now,
			rationale: input.rationale?.trim() || undefined,
		},
		status: "accepted",
		resolvedAt: now,
	};
	doc.augmentations.unshift(augmentation);
	await writeDoc(doc, input.storeRoot);
	return { ok: true, augmentation };
}

function normalizeRelationClaim(
	raw: GraphifyRelationAugmentationClaim | undefined,
): GraphifyRelationAugmentationClaim | null {
	if (!raw || typeof raw !== "object") return null;
	const relationType =
		typeof raw.relationType === "string" ? raw.relationType.trim() : "";
	if (!relationType) return null;
	const toFile =
		typeof raw.toFile === "string" && raw.toFile.trim()
			? raw.toFile.trim().replace(/\\/g, "/")
			: undefined;
	const toSymbol =
		typeof raw.toSymbol === "string" && raw.toSymbol.trim()
			? raw.toSymbol.trim()
			: undefined;
	const toId =
		typeof raw.toId === "string" && raw.toId.trim()
			? raw.toId.trim()
			: undefined;
	const toName =
		typeof raw.toName === "string" && raw.toName.trim()
			? raw.toName.trim()
			: undefined;
	if (!toFile && !toSymbol && !toId && !toName) return null;
	return { relationType, toFile, toSymbol, toId, toName };
}

/** Stable edge identity for lookup / supersede. */
export function relationAugmentationKey(
	fromFile: string,
	fromSymbol: string,
	claim: GraphifyRelationAugmentationClaim,
): string {
	const from = augmentationKey(fromFile, fromSymbol);
	const to =
		claim.toFile && claim.toSymbol
			? augmentationKey(claim.toFile, claim.toSymbol)
			: `id:${(claim.toId ?? "").trim()}|name:${(claim.toName ?? "").trim()}`;
	return `${from}|${claim.relationType.trim()}|${to}`;
}

function relationClaimFromEndpoints(opts: {
	relationType: string;
	toFile?: string;
	toSymbol?: string;
	toId?: string;
	toName?: string;
}): GraphifyRelationAugmentationClaim | null {
	return normalizeRelationClaim({
		relationType: opts.relationType,
		toFile: opts.toFile,
		toSymbol: opts.toSymbol,
		toId: opts.toId,
		toName: opts.toName,
	});
}

/**
 * Latest accepted relation corroboration for this from→to claim, if any.
 */
export async function findAcceptedRelationAugmentation(opts: {
	purl: string;
	fromFile: string;
	fromSymbol: string;
	relationType: string;
	toFile?: string;
	toSymbol?: string;
	toId?: string;
	toName?: string;
	storeRoot?: string;
}): Promise<GraphifyAugmentation | null> {
	const key = purlRepoKey(opts.purl) ?? opts.purl.trim();
	if (!key || !opts.fromFile?.trim() || !opts.fromSymbol?.trim()) return null;
	const wantClaim = relationClaimFromEndpoints(opts);
	if (!wantClaim) return null;
	const want = relationAugmentationKey(
		opts.fromFile,
		opts.fromSymbol,
		wantClaim,
	);
	const doc = await readDoc(key, opts.storeRoot);
	const fromWant = augmentationKey(opts.fromFile, opts.fromSymbol);
	const accepted = doc.augmentations.filter((a) => {
		if (a.status !== "accepted") return false;
		if (augmentationKey(a.file, a.symbol) !== fromWant) return false;
		const claim = normalizeRelationClaim(a.claims.relation);
		if (!claim) return false;
		return relationAugmentationKey(a.file, a.symbol, claim) === want;
	});
	if (accepted.length === 0) return null;
	accepted.sort((a, b) => {
		const at = a.resolvedAt ?? a.provenance.at;
		const bt = b.resolvedAt ?? b.provenance.at;
		return bt.localeCompare(at);
	});
	return accepted[0] ?? null;
}

export async function upsertAcceptedRelationAugmentation(input: {
	purl: string;
	fromFile: string;
	fromSymbol: string;
	relationType: string;
	toFile?: string;
	toSymbol?: string;
	toId?: string;
	toName?: string;
	source: string;
	rationale?: string;
	evidence?: string[];
	storeRoot?: string;
}): Promise<
	| { ok: true; augmentation: GraphifyAugmentation }
	| { ok: false; error: string }
> {
	const key = purlRepoKey(input.purl) ?? input.purl.trim();
	if (!key) return { ok: false, error: "purl is required" };
	const fromFile = input.fromFile.trim().replace(/\\/g, "/");
	const fromSymbol = input.fromSymbol.trim();
	if (!fromFile) return { ok: false, error: "fromFile is required" };
	if (!fromSymbol) return { ok: false, error: "fromSymbol is required" };
	const relation = relationClaimFromEndpoints(input);
	if (!relation) {
		return {
			ok: false,
			error:
				"relation claim needs relationType and a target (toFile+toSymbol or toId/toName)",
		};
	}

	const now = new Date().toISOString();
	const want = relationAugmentationKey(fromFile, fromSymbol, relation);
	const doc = await readDoc(key, input.storeRoot);

	for (let i = 0; i < doc.augmentations.length; i++) {
		const a = doc.augmentations[i]!;
		const claim = normalizeRelationClaim(a.claims.relation);
		if (
			a.status === "accepted" &&
			claim &&
			relationAugmentationKey(a.file, a.symbol, claim) === want
		) {
			doc.augmentations[i] = {
				...a,
				status: "rejected",
				resolvedAt: now,
			};
		}
	}

	const augmentation: GraphifyAugmentation = {
		id: newId(),
		purl: key,
		file: fromFile,
		symbol: fromSymbol,
		claims: { relation },
		evidence: input.evidence,
		provenance: {
			source: input.source.trim() || "unknown",
			at: now,
			rationale: input.rationale?.trim() || undefined,
		},
		status: "accepted",
		resolvedAt: now,
	};
	doc.augmentations.unshift(augmentation);
	await writeDoc(doc, input.storeRoot);
	return { ok: true, augmentation };
}

function normalizeModuleClaim(
	raw: GraphifyModuleAugmentationClaim | undefined,
): GraphifyModuleAugmentationClaim | null {
	if (!raw || typeof raw !== "object") return null;
	const moduleKey =
		typeof raw.module === "string" ? raw.module.trim().replace(/\\/g, "/") : "";
	if (!moduleKey) return null;
	return { module: moduleKey };
}

/** Latest accepted module-boundary corroboration for file#symbol, if any. */
export async function findAcceptedModuleAugmentation(opts: {
	purl: string;
	file: string;
	symbol: string;
	module: string;
	storeRoot?: string;
}): Promise<GraphifyAugmentation | null> {
	const key = purlRepoKey(opts.purl) ?? opts.purl.trim();
	if (!key || !opts.file?.trim() || !opts.symbol?.trim()) return null;
	const wantModule = normalizeModuleClaim({ module: opts.module });
	if (!wantModule) return null;
	const want = augmentationKey(opts.file, opts.symbol);
	const doc = await readDoc(key, opts.storeRoot);
	const accepted = doc.augmentations.filter((a) => {
		if (a.status !== "accepted") return false;
		if (augmentationKey(a.file, a.symbol) !== want) return false;
		const claim = normalizeModuleClaim(a.claims.module);
		if (!claim) return false;
		return (
			claim.module.replace(/^\.\//, "") ===
			wantModule.module.replace(/^\.\//, "")
		);
	});
	if (accepted.length === 0) return null;
	accepted.sort((a, b) => {
		const at = a.resolvedAt ?? a.provenance.at;
		const bt = b.resolvedAt ?? b.provenance.at;
		return bt.localeCompare(at);
	});
	return accepted[0] ?? null;
}

export async function upsertAcceptedModuleAugmentation(input: {
	purl: string;
	file: string;
	symbol: string;
	module: string;
	source: string;
	rationale?: string;
	evidence?: string[];
	storeRoot?: string;
}): Promise<
	| { ok: true; augmentation: GraphifyAugmentation }
	| { ok: false; error: string }
> {
	const key = purlRepoKey(input.purl) ?? input.purl.trim();
	if (!key) return { ok: false, error: "purl is required" };
	const file = input.file.trim().replace(/\\/g, "/");
	const symbol = input.symbol.trim();
	const moduleClaim = normalizeModuleClaim({ module: input.module });
	if (!file) return { ok: false, error: "file is required" };
	if (!symbol) return { ok: false, error: "symbol is required" };
	if (!moduleClaim) return { ok: false, error: "module is required" };

	const now = new Date().toISOString();
	const want = augmentationKey(file, symbol);
	const doc = await readDoc(key, input.storeRoot);

	for (let i = 0; i < doc.augmentations.length; i++) {
		const a = doc.augmentations[i]!;
		const claim = normalizeModuleClaim(a.claims.module);
		if (
			a.status === "accepted" &&
			augmentationKey(a.file, a.symbol) === want &&
			claim &&
			claim.module.replace(/^\.\//, "") ===
				moduleClaim.module.replace(/^\.\//, "")
		) {
			doc.augmentations[i] = {
				...a,
				status: "rejected",
				resolvedAt: now,
			};
		}
	}

	const augmentation: GraphifyAugmentation = {
		id: newId(),
		purl: key,
		file,
		symbol,
		claims: { module: moduleClaim },
		evidence: input.evidence,
		provenance: {
			source: input.source.trim() || "unknown",
			at: now,
			rationale: input.rationale?.trim() || undefined,
		},
		status: "accepted",
		resolvedAt: now,
	};
	doc.augmentations.unshift(augmentation);
	await writeDoc(doc, input.storeRoot);
	return { ok: true, augmentation };
}
