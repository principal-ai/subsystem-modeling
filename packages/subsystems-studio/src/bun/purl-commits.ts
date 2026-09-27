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
	PurlCommit,
	SubsystemModelPurlFreshness,
} from "../shared/contract";
import { filesClean, headSha } from "./git-repo";
import { purlRepoKey, resolveRepoRootForComponent } from "./subsystem-model-store";

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

interface WalkthroughLike {
	steps?: ReadonlyArray<StepLike>;
}

interface CommitOptions {
	resolveRoot?: (purlOrKey: string) => string | undefined;
	head?: (repoRoot: string) => Promise<string | null>;
}

interface CleanOptions extends CommitOptions {
	isClean?: (repoRoot: string, relPaths: ReadonlyArray<string>) => Promise<boolean>;
}

/** Unique repo keys referenced by the given purls, in first-seen order. */
export function referencedPurlKeys(
	purls: ReadonlyArray<string | undefined>,
): string[] {
	const keys: string[] = [];
	const seen = new Set<string>();
	for (const purl of purls) {
		const key = purlRepoKey(purl);
		if (key && !seen.has(key)) {
			seen.add(key);
			keys.push(key);
		}
	}
	return keys;
}

/**
 * Repo-root-relative files referenced by the model, grouped by purl repo key.
 * Components contribute their own `file`; walkthrough steps prefer their own
 * `purl`, falling back to an endpoint component's purl.
 */
export function referencedFilesByPurl(
	components: ReadonlyArray<ComponentLike>,
	walkthroughs?: ReadonlyArray<WalkthroughLike>,
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
	for (const w of walkthroughs ?? []) {
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
	walkthroughs?: ReadonlyArray<WalkthroughLike>,
	opts?: CleanOptions,
): Promise<boolean> {
	const resolveRoot = opts?.resolveRoot ?? resolveRepoRootForComponent;
	const isClean = opts?.isClean ?? filesClean;
	for (const [key, files] of referencedFilesByPurl(components, walkthroughs)) {
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
