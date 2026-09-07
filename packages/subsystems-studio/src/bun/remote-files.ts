/**
 * Mode B file resolution — fetches `repo-relative path` slices from
 * raw.githubusercontent.com keyed by the trail's authored sha.
 *
 * See docs/PRINCIPAL_STUDIO_MODES.md for the design context. Token is supplied via
 * the `TRAIL_GH_TOKEN` env (set by the CLI parent process so it never appears
 * in argv).
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

interface RepoTarget {
	purl: string;
	owner: string;
	name: string;
	sha: string;
}

interface ReadFileResult {
	ok: boolean;
	content?: string;
	error?: string;
}

/**
 * Per-call context for remote slice resolution. Each tab in the viewer carries
 * its own context; we no longer read from `process.env` so that two tabs from
 * different repos can coexist without env-var collisions.
 */
export interface RemoteContext {
	ghToken?: string;
	fallbackOwner?: string;
	fallbackName?: string;
	fallbackPurl?: string;
}

const FILE_CACHE_ROOT = join(homedir(), ".principal", "cache", "files");
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Resolve which repo a `readFile` request belongs to.
 *
 * Multi-repo trails: pick the entry in `repos[]` whose `id` matches the
 * caller's `repoPurl`. Single-repo trails: fall back to `repos[0]` if present,
 * else synthesize from `authoredAt.sha` + the fallback owner/name supplied by
 * the caller (CLI parent process derives these from the web-ade wrapper).
 */
export function resolveTarget(
	payload: unknown,
	ctx: RemoteContext,
	repoPurl?: string,
): RepoTarget | null {
	if (typeof payload !== "object" || payload === null) return null;
	const p = payload as {
		repos?: Array<{
			id?: string;
			name?: string;
			remote?: { host?: string; owner?: string; name?: string };
			authoredAtSha?: string;
		}>;
		authoredAt?: { sha?: string };
	};

	if (Array.isArray(p.repos) && p.repos.length > 0) {
		const entry = repoPurl
			? p.repos.find((r) => r.id === repoPurl) ?? p.repos[0]
			: p.repos[0];
		if (entry?.remote?.owner && entry.remote.name && entry.authoredAtSha && entry.id) {
			return {
				purl: entry.id,
				owner: entry.remote.owner,
				name: entry.remote.name,
				sha: entry.authoredAtSha,
			};
		}
	}

	const sha = p.authoredAt?.sha;
	if (sha && ctx.fallbackOwner && ctx.fallbackName) {
		return {
			purl: ctx.fallbackPurl ?? `pkg:github/${ctx.fallbackOwner}/${ctx.fallbackName}`,
			owner: ctx.fallbackOwner,
			name: ctx.fallbackName,
			sha,
		};
	}

	return null;
}

export async function readFileRemote(
	payload: unknown,
	ctx: RemoteContext,
	path: string,
	repoPurl?: string,
): Promise<ReadFileResult> {
	const target = resolveTarget(payload, ctx, repoPurl);
	if (!target) {
		return {
			ok: false,
			error:
				"remote: trail has no repo identity (need repos[].remote+authoredAtSha or fallback owner/name)",
		};
	}

	const cleaned = normalizeRepoPath(path);
	if (!cleaned) {
		return { ok: false, error: `remote: invalid path '${path}'` };
	}

	const cached = readPositiveCache(target, cleaned);
	if (cached !== null) return { ok: true, content: cached };
	if (isNegativelyCached(target, cleaned)) {
		return { ok: false, error: `file not found at sha ${target.sha}: ${cleaned}` };
	}

	const url = `https://raw.githubusercontent.com/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.name)}/${encodeURIComponent(target.sha)}/${cleaned.split("/").map(encodeURIComponent).join("/")}`;
	const headers: Record<string, string> = { Accept: "application/vnd.github.raw" };
	if (ctx.ghToken) headers["Authorization"] = `Bearer ${ctx.ghToken}`;

	try {
		const response = await fetch(url, { headers });
		if (response.status === 404) {
			writeNegativeCache(target, cleaned);
			return { ok: false, error: `file not found at sha ${target.sha}: ${cleaned}` };
		}
		if (response.status === 403) {
			const reset = response.headers.get("x-ratelimit-reset");
			return {
				ok: false,
				error: reset
					? `GitHub rate limit hit (resets at ${new Date(Number(reset) * 1000).toISOString()}); set TRAIL_GH_TOKEN to authenticate`
					: "GitHub denied access (token may lack repo scope)",
			};
		}
		if (!response.ok) {
			return { ok: false, error: `GitHub returned ${response.status}` };
		}
		const content = await response.text();
		writePositiveCache(target, cleaned, content);
		return { ok: true, content };
	} catch (err) {
		return { ok: false, error: `network error: ${(err as Error).message}` };
	}
}

function normalizeRepoPath(raw: string): string | null {
	let cleaned = raw.replace(/^\/+/, "");
	if (cleaned.startsWith("GitHub/")) cleaned = cleaned.slice("GitHub/".length);
	if (!cleaned || cleaned.includes("..")) return null;
	return cleaned;
}

function purlToCacheSegment(purl: string): string {
	return purl.replace(/[^A-Za-z0-9._-]/g, "_");
}

function positiveCachePath(target: RepoTarget, path: string): string {
	return join(FILE_CACHE_ROOT, purlToCacheSegment(target.purl), target.sha, path);
}

function negativeCachePath(target: RepoTarget, path: string): string {
	return `${positiveCachePath(target, path)}.404`;
}

function readPositiveCache(target: RepoTarget, path: string): string | null {
	try {
		return readFileSync(positiveCachePath(target, path), "utf8");
	} catch {
		return null;
	}
}

function writePositiveCache(target: RepoTarget, path: string, content: string): void {
	try {
		const out = positiveCachePath(target, path);
		mkdirSync(dirname(out), { recursive: true });
		writeFileSync(out, content, "utf8");
	} catch {
		// non-fatal — cache writes shouldn't break a working fetch
	}
}

function isNegativelyCached(target: RepoTarget, path: string): boolean {
	try {
		const stat = statSync(negativeCachePath(target, path));
		return Date.now() - stat.mtimeMs < NEGATIVE_TTL_MS;
	} catch {
		return false;
	}
}

function writeNegativeCache(target: RepoTarget, path: string): void {
	try {
		const out = negativeCachePath(target, path);
		mkdirSync(dirname(out), { recursive: true });
		writeFileSync(out, "", "utf8");
	} catch {
		// non-fatal
	}
}
