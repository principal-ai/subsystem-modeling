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
