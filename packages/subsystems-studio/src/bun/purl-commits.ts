/**
 * Per-purl commit provenance for a subsystem model.
 *
 * A model spans repos and each repo moves independently, so provenance is one
 * commit sha per purl repo key (`purlRepoKey`, fragment stripped) — never a
 * whole-tree dirty fingerprint, which would flip a model on an unrelated edit.
 * Commits are captured at create ({@link capturePurlCommits}) and stamped only
 * when a full audit passes against a clean referenced state
 * ({@link referencedFilesClean}).
 *
 * The functions here are the *mechanism*; the store owns identity and writes.
 * Resolvers/head/git readers are injectable so the logic is testable without a
 * real Alexandria registry or checkout.
 */

import type {
	AnchorChanges,
	AutoRePinOutcome,
	ModelProvenanceDetail,
	ModelProvenanceSnapshot,
	PurlCommit,
	SubsystemModelPurlFreshness,
} from "../shared/contract";
import {
	commitTouches,
	diffScopedFiles,
	filesClean,
	filesDirty,
	headSha,
	remoteRefSha,
	revDistance,
} from "./git-repo";
import {
	isRepoPurl,
	purlRepoKey,
	resolveRepoRootForComponent,
} from "./subsystem-model-store";

export type { PurlCommit };

interface ComponentLike {
	alias: string;
	file?: string;
	purl?: string;
}

interface StepLike {
	file?: string;
	purl?: string;
	from?: string;
	to?: string;
}

interface TrailLike {
	steps?: ReadonlyArray<StepLike>;
}

interface RefCarrier {
	purl?: string;
	declarationRef?: {
		capturedAt?: string;
		revision?: { headSha?: string } | null;
	} | null;
}

interface CommitOptions {
	resolveRoot?: (purlOrKey: string) => string | undefined;
	head?: (repoRoot: string) => Promise<string | null>;
}

interface CleanOptions extends CommitOptions {
	isClean?: (repoRoot: string, relPaths: ReadonlyArray<string>) => Promise<boolean>;
}

/**
 * Injectable git probes, so the provenance composition can be tested without
 * real checkouts. Each defaults to the corresponding `git-repo` probe.
 */
export interface ProvenanceProbes extends CommitOptions {
	diff?: (
		repoRoot: string,
		from: string,
		to: string,
		paths: ReadonlyArray<string>,
	) => Promise<string[] | null>;
	dirty?: (
		repoRoot: string,
		paths: ReadonlyArray<string>,
	) => Promise<string[]>;
	distance?: (
		repoRoot: string,
		from: string,
		to: string,
	) => ReturnType<typeof revDistance>;
}

/**
 * Unique *repo* keys referenced by the given purls, in first-seen order.
 *
 * Pseudo-purls (`external:opencode2-service`, `external:proposed`, …) are
 * dropped, and the filter is `isRepoPurl` rather than a scheme test so it stays
 * the single definition of "is this a repo we can resolve". `purlRepoKey` does
 * no validation of its own — it only strips the fragment — so without this gate
 * an external identity becomes a key in every repo-keyed structure downstream.
 *
 * That is not cosmetic. `modelProvenance` emits a freshness row per key, and a
 * pseudo-purl has no checkout, so its row would read `unresolved` forever. The
 * provenance rollup takes the worst status across rows, so one such row flips a
 * model whose real repos are all pinned exactly at head from `current` to
 * `unresolved` — a false "Unmeasured" badge, and an anchor verdict of `unknown`
 * that no clean measurement can ever outrank.
 */
export function referencedPurlKeys(
	purls: ReadonlyArray<string | undefined>,
): string[] {
	const keys: string[] = [];
	const seen = new Set<string>();
	for (const purl of purls) {
		const key = purlRepoKey(purl);
		if (key && isRepoPurl(key) && !seen.has(key)) {
			seen.add(key);
			keys.push(key);
		}
	}
	return keys;
}

/**
 * Repo-root-relative files referenced by the model, grouped by purl repo key.
 * Components contribute their own `file`; trail steps prefer their own
 * `purl`, falling back to an endpoint component's purl.
 */
export function referencedFilesByPurl(
	components: ReadonlyArray<ComponentLike>,
	trails?: ReadonlyArray<TrailLike>,
): Map<string, string[]> {
	const byAlias = new Map(components.map((c) => [c.alias, c]));
	const grouped = new Map<string, Set<string>>();
	const add = (purl: string | undefined, file: string | undefined): void => {
		const key = purlRepoKey(purl);
		if (!key || !file) return;
		const set = grouped.get(key) ?? new Set<string>();
		set.add(file);
		grouped.set(key, set);
	};

	for (const c of components) add(c.purl, c.file);
	for (const w of trails ?? []) {
		for (const step of w.steps ?? []) {
			const purl =
				step.purl ??
				byAlias.get(step.from ?? "")?.purl ??
				byAlias.get(step.to ?? "")?.purl;
			add(purl, step.file);
		}
	}

	const out = new Map<string, string[]>();
	for (const [key, files] of grouped) out.set(key, [...files]);
	return out;
}

/**
 * Best-effort historic pins recovered from the retired per-declaration
 * `declarationRef.revision.headSha`. Per repo the earliest `capturedAt` is
 * closest to model creation — a ref re-pinned later would overstate the commit.
 * Used only to backfill `createdAtCommits` on records that predate it.
 */
export function commitsFromDeclarationRefs(
	components: ReadonlyArray<RefCarrier>,
): Record<string, PurlCommit> {
	const best = new Map<string, { sha: string; at: number }>();
	for (const c of components) {
		const key = purlRepoKey(c.purl);
		const sha = c.declarationRef?.revision?.headSha;
		if (!key || !sha) continue;
		const at = Date.parse(c.declarationRef?.capturedAt ?? "") || 0;
		const cur = best.get(key);
		if (!cur || at < cur.at) best.set(key, { sha, at });
	}
	const out: Record<string, PurlCommit> = {};
	for (const [key, v] of best) out[key] = v.sha;
	return out;
}

/**
 * Capture the current commit of every resolvable purl referenced by the model.
 * Unresolved purls (no registered checkout) are omitted rather than fabricated.
 */
export async function capturePurlCommits(
	components: ReadonlyArray<ComponentLike>,
	opts?: CommitOptions,
): Promise<Record<string, PurlCommit>> {
	const resolveRoot = opts?.resolveRoot ?? resolveRepoRootForComponent;
	const head = opts?.head ?? headSha;
	const out: Record<string, PurlCommit> = {};
	for (const key of referencedPurlKeys(components.map((c) => c.purl))) {
		const root = resolveRoot(key);
		if (!root) continue;
		const sha = await head(root);
		if (sha) out[key] = sha;
	}
	return out;
}

/**
 * True when every referenced file is committed and unmodified. Anchor-scoped:
 * unresolved repos are skipped (absence of a machine is not dirtiness), but any
 * referenced file with uncommitted edits fails the whole check.
 */
export async function referencedFilesClean(
	components: ReadonlyArray<ComponentLike>,
	trails?: ReadonlyArray<TrailLike>,
	opts?: CleanOptions,
): Promise<boolean> {
	const resolveRoot = opts?.resolveRoot ?? resolveRepoRootForComponent;
	const isClean = opts?.isClean ?? filesClean;
	for (const [key, files] of referencedFilesByPurl(components, trails)) {
		const root = resolveRoot(key);
		if (!root) continue;
		if (!(await isClean(root, files))) return false;
	}
	return true;
}

/** Compare a pinned commit with the live checkout. */
export function commitStatus(
	pinned: string | undefined,
	live: string | null | undefined,
	resolved: boolean,
): SubsystemModelPurlFreshness["status"] {
	if (!resolved || !pinned || !live) return "unresolved";
	return pinned === live ? "match" : "moved";
}

/**
 * Per-purl comparison of the pinned commit against the current checkout, over
 * the union of pinned purls and the model's current purls. Coarse — a `moved`
 * means the repo advanced, not that a referenced file changed.
 */
export async function purlCommitFreshness(
	stored: {
		createdAtCommits?: Record<string, PurlCommit>;
		verifiedAtCommits?: Record<string, PurlCommit>;
	},
	components: ReadonlyArray<ComponentLike>,
	opts?: CommitOptions,
): Promise<SubsystemModelPurlFreshness[]> {
	const resolveRoot = opts?.resolveRoot ?? resolveRepoRootForComponent;
	const head = opts?.head ?? headSha;
	const keys = referencedPurlKeys([
		...Object.keys(stored.createdAtCommits ?? {}),
		...Object.keys(stored.verifiedAtCommits ?? {}),
		...components.map((c) => c.purl),
	]);

	const rows: SubsystemModelPurlFreshness[] = [];
	for (const key of keys) {
		const pinned =
			stored.verifiedAtCommits?.[key] ?? stored.createdAtCommits?.[key];
		const root = resolveRoot(key);
		const live = root ? await head(root) : null;
		rows.push({
			purl: key,
			pinned,
			live: live ?? undefined,
			status: commitStatus(pinned, live, Boolean(root)),
		});
	}
	return rows;
}

/** What `modelProvenance` needs off a stored record. */
export interface ProvenanceSource {
	createdAtCommits?: Record<string, PurlCommit>;
	verifiedAtCommits?: Record<string, PurlCommit>;
	components: ReadonlyArray<ComponentLike>;
	trails?: ReadonlyArray<TrailLike>;
}

/**
 * The cheap provenance tier — everything a list or overview pass can afford.
 *
 * Per referenced repo this is three probes: HEAD (cached for 2s in `git-repo`),
 * a pathspec-scoped diff between the pin and HEAD, and a pathspec-scoped dirty
 * check. That is what makes the anchor question answerable: `headSha` alone can
 * only say a repo moved, which in this repo's case is true across 216 files
 * while a model anchoring a single declaration file sees one.
 *
 * The per-commit walk is deliberately absent — it is a whole-log read per repo
 * and belongs in {@link modelProvenanceDetail}, fetched only when a row opens.
 */
export async function modelProvenance(
	stored: ProvenanceSource,
	probes?: ProvenanceProbes,
): Promise<ModelProvenanceSnapshot> {
	const resolveRoot = probes?.resolveRoot ?? resolveRepoRootForComponent;
	const head = probes?.head ?? headSha;
	const diff = probes?.diff ?? diffScopedFiles;
	const dirty = probes?.dirty ?? filesDirty;

	const byPurl = referencedFilesByPurl(stored.components, stored.trails);
	const keys = referencedPurlKeys([
		...Object.keys(stored.createdAtCommits ?? {}),
		...Object.keys(stored.verifiedAtCommits ?? {}),
		...stored.components.map((c) => c.purl),
	]);

	const purlFreshness: SubsystemModelPurlFreshness[] = [];
	const anchorChanges: Record<string, AnchorChanges> = {};
	// Model-wide grounded-contact rollup: how many components a drift could
	// invalidate, and how many actually did. Only measured repos count — see
	// the `committed` guard below.
	let referencedComponents = 0;
	let affectedComponents = 0;

	for (const key of keys) {
		const pinned =
			stored.verifiedAtCommits?.[key] ?? stored.createdAtCommits?.[key];
		const root = resolveRoot(key);
		const live = root ? await head(root) : null;
		purlFreshness.push({
			purl: key,
			pinned,
			live: live ?? undefined,
			status: commitStatus(pinned, live, Boolean(root)),
		});

		// No pin or no checkout: nothing to compare, and inventing an empty
		// `committed` list here would claim "nothing changed" when the truth is
		// "could not look".
		if (!root || !pinned || !live) continue;

		const files = byPurl.get(key) ?? [];
		const changes: AnchorChanges = {};
		const committed = await diff(root, pinned, live, files);
		if (committed) {
			changes.committed = committed;
			// The diff is the measurement; only then may a component be counted
			// as grounded. A null diff means the repo was not compared, so its
			// components stay out of the denominator rather than reading clean.
			const changed = new Set(committed);
			for (const c of stored.components) {
				if (!c.file || purlRepoKey(c.purl) !== key) continue;
				referencedComponents += 1;
				if (changed.has(c.file)) affectedComponents += 1;
			}
		}
		const uncommitted = await dirty(root, files);
		if (uncommitted.length > 0) changes.dirty = uncommitted;

		const distance = probes?.distance
			? await probes.distance(root, pinned, live)
			: await revDistance(root, pinned, live);
		if (distance.commitsSincePin !== undefined) {
			changes.commitsSincePin = distance.commitsSincePin;
		}
		if (distance.pinOnlyCommits !== undefined) {
			changes.pinOnlyCommits = distance.pinOnlyCommits;
		}
		if (distance.historyRewritten) changes.historyRewritten = true;

		// Only record contact we actually measured. An empty object would read
		// as "measured, clean" for a repo whose pathspec we never had.
		if (Object.keys(changes).length > 0) anchorChanges[key] = changes;
	}

	return {
		createdAtCommits: stored.createdAtCommits,
		verifiedAtCommits: stored.verifiedAtCommits,
		purlFreshness,
		...(Object.keys(anchorChanges).length > 0 ? { anchorChanges } : {}),
		...(referencedComponents > 0
			? {
					componentContact: {
						referenced: referencedComponents,
						affected: affectedComponents,
					},
				}
			: {}),
	};
}

/**
 * Decide whether a pin can be carried forward to HEAD, per referenced repo.
 *
 * The promotion is justified by content identity rather than by re-running the
 * audit: git is content-addressed, so byte-identical anchored files mean an
 * audit at the old pin would have returned the same verdict. Every check in the
 * audit either reads only the anchored files or compares the model's own fields
 * against each other, so "nothing anchored moved" carries the verdict forward.
 *
 * The two refusals are about *now*, not about whether the model is sound:
 * - `dirty-tree` — the tree was clean when the pin was stamped but has gone
 *   dirty since, and there is no reproducible state to promote to.
 * - `history-rewritten` — the pin is orphaned, so "unchanged" cannot be shown.
 *
 * Nothing here can make an unsound model look sound; it only decides whether
 * there is a commit *right now* worth pinning to.
 */
export async function planAutoRePin(
	stored: ProvenanceSource,
	anchorChanges: Record<string, AnchorChanges> | undefined,
	probes?: ProvenanceProbes,
): Promise<Record<string, AutoRePinOutcome>> {
	const resolveRoot = probes?.resolveRoot ?? resolveRepoRootForComponent;
	const head = probes?.head ?? headSha;
	const dirty = probes?.dirty ?? filesDirty;
	const byPurl = referencedFilesByPurl(stored.components, stored.trails);
	const out: Record<string, AutoRePinOutcome> = {};

	for (const key of referencedPurlKeys(stored.components.map((c) => c.purl))) {
		const pinned =
			stored.verifiedAtCommits?.[key] ?? stored.createdAtCommits?.[key];
		const root = resolveRoot(key);
		if (!pinned || !root) continue;
		const live = await head(root);
		if (!live || live === pinned) continue;

		const changes = anchorChanges?.[key];
		// Promotion requires positive evidence that nothing anchored moved. An
		// absent `committed` list means unmeasured, which is not the same thing
		// and must not be read as clean.
		if (!changes?.committed) continue;
		if (changes.committed.length > 0) continue;
		if (changes.historyRewritten) {
			out[key] = { status: "blocked", blockedBy: "history-rewritten" };
			continue;
		}
		const uncommitted = changes.dirty ?? (await dirty(root, byPurl.get(key) ?? []));
		if (uncommitted.length > 0) {
			out[key] = { status: "blocked", blockedBy: "dirty-tree" };
			continue;
		}
		out[key] = { status: "applied", commit: live };
	}
	return out;
}

/**
 * The expensive tier: the per-commit walk and the remote's position.
 *
 * Fetched only when a provenance strip is expanded, because it is a whole-log
 * read per referenced repo — unbounded in range size, and multiplied by every
 * model on a list pass if it were not lazy.
 */
export async function modelProvenanceDetail(
	id: string,
	stored: ProvenanceSource,
	anchorChanges: Record<string, AnchorChanges> | undefined,
	probes?: ProvenanceProbes & {
		commits?: typeof commitTouches;
		remote?: typeof remoteRefSha;
		limit?: number;
	},
): Promise<ModelProvenanceDetail> {
	const resolveRoot = probes?.resolveRoot ?? resolveRepoRootForComponent;
	const head = probes?.head ?? headSha;
	const walk = probes?.commits ?? commitTouches;
	const remote = probes?.remote ?? remoteRefSha;
	const byPurl = referencedFilesByPurl(stored.components, stored.trails);
	const out: Record<string, AnchorChanges> = {};

	for (const key of referencedPurlKeys(stored.components.map((c) => c.purl))) {
		const pinned =
			stored.verifiedAtCommits?.[key] ?? stored.createdAtCommits?.[key];
		const root = resolveRoot(key);
		if (!pinned || !root) continue;
		const live = await head(root);
		if (!live || live === pinned) continue;
		const files = byPurl.get(key) ?? [];

		const commits = await walk(root, pinned, live, files, probes?.limit ?? 40);
		const remoteSha = await remote(root);
		const entry: AnchorChanges = { ...(anchorChanges?.[key] ?? {}) };
		if (commits) {
			entry.commits = commits.map((c) => ({
				sha: c.sha,
				touched: c.files.length > 0,
			}));
		}
		if (remoteSha) {
			// Position the remote on the walk. A remote sha that is not in the
			// window means every commit shown is unpushed; report it as
			// absent rather than guessing an index.
			const at = commits?.findIndex((c) => c.sha === remoteSha) ?? -1;
			if (at >= 0) entry.remoteIndex = at;
			else if (commits) entry.remoteAhead = commits.length;
		}
		out[key] = entry;
	}

	const autoRePin = await planAutoRePin(stored, anchorChanges, probes);
	return {
		id,
		...(Object.keys(out).length > 0 ? { anchorChanges: out } : {}),
		...(Object.keys(autoRePin).length > 0 ? { autoRePin } : {}),
	};
}
