/**
 * Neutral git probes shared by the graphify / package-layer caches and the
 * subsystem-model provenance record. Deliberately free of any store concern:
 * graphify keeps its `(headSha, dirtyHash)` slot logic on top of {@link gitStdout},
 * while provenance uses only {@link headSha} (a bare `rev-parse`) and
 * {@link filesClean} (anchor-scoped, never the whole working tree).
 */

/** Cap captured git output (matches the old spawnSync maxBuffer). */
const GIT_STDOUT_MAX_BYTES = 32 * 1024 * 1024;

/** HEAD is stable for the current tree; a short TTL collapses repeated reads
 * (per purl × per list pass) into one `git rev-parse`. */
const HEAD_TTL_MS = 2000;

const headCache = new Map<string, { at: number; sha: string | null }>();

export function clearHeadShaCache(): void {
	headCache.clear();
}

/** Run `git -C <repoRoot> <args>`, returning stdout (or null on failure/timeout). */
export async function gitStdout(
	repoRoot: string,
	args: string[],
): Promise<string | null> {
	const proc = Bun.spawn({
		cmd: ["git", "-C", repoRoot, ...args],
		stdio: ["ignore", "pipe", "ignore"],
	});
	const stdout = new Response(proc.stdout).text().catch(() => "");
	const deadline = Bun.sleep(30_000).then(() => {
		try {
			proc.kill();
		} catch {
			/* noop */
		}
		return "";
	});
	const text = await Promise.race([stdout, deadline]);
	const code = await proc.exited;
	if (code !== 0) return null;
	return text.slice(0, GIT_STDOUT_MAX_BYTES);
}

/** Current HEAD commit sha, or null when this is not a git repo / has no commits. */
export async function headSha(repoRoot: string): Promise<string | null> {
	const cached = headCache.get(repoRoot);
	if (cached && performance.now() - cached.at < HEAD_TTL_MS) return cached.sha;
	const out = await gitStdout(repoRoot, ["rev-parse", "HEAD"]);
	const sha = out?.trim() || null;
	headCache.set(repoRoot, { at: performance.now(), sha });
	return sha;
}

/**
 * Repo-root-relative paths among `relPaths` that git reports as modified,
 * untracked, staged or conflicted — everything short of committed-and-clean.
 *
 * The reporting form of {@link dirtyFiles}, for callers that need to say *which*
 * anchors are affected rather than just whether any are. A failure to confirm
 * returns every requested path, so an unreadable status can never present as
 * clean.
 */
export async function filesDirty(
	repoRoot: string,
	relPaths: ReadonlyArray<string>,
): Promise<string[]> {
	const paths = [...new Set(relPaths.filter((p) => p.length > 0))];
	if (paths.length === 0) return [];
	const status = await gitStdout(repoRoot, [
		"status",
		"--porcelain=v1",
		"-z",
		"--",
		...paths,
	]);
	if (status == null) return paths;
	return parsePorcelainPaths(status, paths);
}

/**
 * Repo-root-relative paths that differ between two commits, restricted to
 * `relPaths`.
 *
 * This is the probe that makes the anchor question answerable: `headSha` only
 * says *that* a repo moved, while this says whether anything the model anchors
 * to moved with it. It works across a rewritten history — `git diff` between
 * two commits does not require shared ancestry — which is why the anchor
 * verdict survives a rebase even though the commit distance does not.
 *
 * `null` when git cannot answer, so callers can distinguish "nothing changed"
 * from "could not tell".
 */
export async function diffScopedFiles(
	repoRoot: string,
	from: string,
	to: string,
	relPaths: ReadonlyArray<string>,
): Promise<string[] | null> {
	if (!from || !to) return null;
	const paths = [...new Set(relPaths.filter((p) => p.length > 0))];
	if (paths.length === 0) return [];
	const out = await gitStdout(repoRoot, [
		"diff",
		"--name-only",
		"-z",
		from,
		to,
		"--",
		...paths,
	]);
	if (out == null) return null;
	return out.split("\0").filter((f) => f.length > 0);
}

/** Commit distance between two commits, plus whether it can be trusted. */
export interface RevDistance {
	/** Commits reachable from `to` but not `from` — how far the checkout moved. */
	commitsSincePin?: number;
	/** Commits in `from` but not `to`. Normally 0; non-zero means a rollback. */
	pinOnlyCommits?: number;
	/**
	 * `from` is not an ancestor of `to`, so both counts are measured from a
	 * merge-base and can badly overstate the real distance. Both counts are
	 * omitted in that case rather than reported as if they were meaningful.
	 */
	historyRewritten?: boolean;
}

/**
 * How far `to` has travelled from `from`, in commits.
 *
 * `git rev-list --left-right --count <from>...<to>` returns both directions in
 * one call, but it is only meaningful when `from` is an ancestor of `to`. After
 * a rebase or force-push the pin is orphaned, every rewritten commit counts as
 * both added and removed, and the numbers are noise — so the ancestor check
 * gates the whole thing and sets `historyRewritten` instead.
 */
export async function revDistance(
	repoRoot: string,
	from: string,
	to: string,
): Promise<RevDistance> {
	if (!from || !to) return {};
	if (from === to) return { commitsSincePin: 0, pinOnlyCommits: 0 };
	// `git merge-base --is-ancestor` cannot be used here: it exits 0 with empty
	// stdout when true and 1 with empty stdout when false, and `gitStdout`
	// collapses a non-zero exit to null — so "not an ancestor" is
	// indistinguishable from "the call failed". Compare against the merge-base
	// instead, which succeeds in both cases and answers the same question.
	const mb = await gitStdout(repoRoot, ["merge-base", from, to]);
	const base = mb?.trim();
	if (!base) return {};
	if (base !== from) return { historyRewritten: true };
	const counts = await gitStdout(repoRoot, [
		"rev-list",
		"--left-right",
		"--count",
		`${from}...${to}`,
	]);
	if (counts == null) return {};
	const [left, right] = counts.trim().split(/\s+/);
	const pinOnly = Number(left);
	const since = Number(right);
	if (!Number.isFinite(pinOnly) || !Number.isFinite(since)) return {};
	return { commitsSincePin: since, pinOnlyCommits: pinOnly };
}

/** One commit in a range, and the anchored files it touched. */
export interface CommitTouches {
	sha: string;
	/** Repo-root-relative anchored files this commit changed. */
	files: string[];
}

/**
 * The commits in `<from>..<to>`, oldest first, each with the anchored files it
 * touched.
 *
 * The most expensive probe here — a whole-log read with filenames, intersectable
 * against the model's referenced set. It exists because a net diff cannot say
 * *when* a model went stale: "22 commits, 1 file changed" reads the same whether
 * the damage is spread across the range or three commits old.
 *
 * `limit` caps the walk from the newest end, since a lightly-touched model can
 * be thousands of commits behind. Returns what fits, newest-biased.
 */
export async function commitTouches(
	repoRoot: string,
	from: string,
	to: string,
	relPaths: ReadonlyArray<string>,
	limit = 40,
): Promise<CommitTouches[] | null> {
	if (!from || !to) return null;
	const wanted = new Set(relPaths.filter((p) => p.length > 0));
	// `-M` picks up renames; without it a moved file reads as delete + add and
	// would still be reported, but the path on one side would be wrong.
	const out = await gitStdout(repoRoot, [
		"log",
		"--reverse",
		`--max-count=${Math.max(1, limit)}`,
		"--name-only",
		"-z",
		"--format=%x00%H",
		`${from}..${to}`,
	]);
	if (out == null) return null;
	const commits: CommitTouches[] = [];
	let current: CommitTouches | null = null;
	// Records are NUL-separated: an empty field precedes each sha, then the
	// changed paths follow until the next empty field. Each path arrives with a
	// leading newline from git's own formatting, which must be stripped or no
	// path will ever match the referenced set.
	for (const raw of out.split("\0")) {
		const field = raw.trim();
		if (field === "") {
			current = null;
			continue;
		}
		if (/^[0-9a-f]{40}$/.test(field)) {
			current = { sha: field, files: [] };
			commits.push(current);
			continue;
		}
		if (current && wanted.has(field)) current.files.push(field);
	}
	return commits;
}

/** The sha the remote's default branch points at, or null when unavailable. */
export async function remoteRefSha(repoRoot: string): Promise<string | null> {
	const head = await gitStdout(repoRoot, [
		"symbolic-ref",
		"--quiet",
		"--short",
		"refs/remotes/origin/HEAD",
	]);
	if (head) {
		const ref = head.trim();
		const sha = await gitStdout(repoRoot, ["rev-parse", "--verify", `${ref}^{commit}`]);
		const resolved = sha?.trim();
		if (resolved) return resolved;
	}
	const ls = await gitStdout(repoRoot, [
		"ls-remote",
		"--exit-code",
		"origin",
		"HEAD",
	]);
	const first = ls?.split("\n")[0]?.split(/\s+/)[0]?.trim();
	return first || null;
}

/**
 * True when every given repo-root-relative path is committed and unmodified.
 *
 * Anchor-scoped: only the passed paths are inspected (`git status --porcelain
 * -- <paths>`), so an unrelated edit elsewhere in the repo does not count.
 * Returns false when git cannot answer (not a repo, or the call fails) — a
 * failure to confirm is treated as "not clean", never as a false positive.
 */
export async function filesClean(
	repoRoot: string,
	relPaths: ReadonlyArray<string>,
): Promise<boolean> {
	const paths = [...new Set(relPaths.filter((p) => p.length > 0))];
	if (paths.length === 0) return true;
	const status = await gitStdout(repoRoot, [
		"status",
		"--porcelain=v1",
		"--",
		...paths,
	]);
	if (status == null) return false;
	return status.trim() === "";
}

/**
 * Extract the changed paths from `git status --porcelain=v1 -z` output.
 *
 * NUL-separated rather than newline-separated because a path may contain a
 * newline, which would otherwise split one dirty file into two bogus entries.
 * Each record is `XY <path>`, and a rename/copy appends ` -> <orig>`.
 */
function parsePorcelainPaths(
	status: string,
	requested: ReadonlyArray<string>,
): string[] {
	const out: string[] = [];
	for (const record of status.split("\0")) {
		if (record.length < 4) continue;
		// Skip the two status columns and the following space.
		let path = record.slice(3);
		const arrow = path.indexOf(" -> ");
		if (arrow >= 0) path = path.slice(arrow + 4);
		if (requested.includes(path)) out.push(path);
	}
	return out;
}
