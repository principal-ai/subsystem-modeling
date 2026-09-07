/**
 * Walks the trail JSON cache (`~/.principal/trails/...`) to power the library
 * tab. Reads enough of each cached file to extract title and repo identity;
 * skips full payload parsing for files we'll only show metadata for.
 *
 * Layout matches `packages/principal-studio-cli/src/lib/trail-cache.ts`:
 *   - `~/.principal/trails/by-id/<id>.json` — fallback for trails we can't
 *     anchor to a Purl.
 *   - `~/.principal/trails/<purl-namespace>/<purl-name>/<id>.json` — primary.
 */

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import {
	extractPurlFromRemoteUrl,
	parsePurl,
} from "@principal-ai/alexandria-core-library";
import type {
	GitConfigIdentity,
	LibraryEntry,
	UserIdentity,
} from "../shared/contract";

const ROOT = join(homedir(), ".principal", "trails");

export async function walkLibrary(): Promise<LibraryEntry[]> {
	const entries: LibraryEntry[] = [];
	let topLevel;
	try {
		topLevel = await fs.readdir(ROOT, { withFileTypes: true });
	} catch {
		return entries;
	}

	for (const ns of topLevel) {
		if (!ns.isDirectory()) continue;
		const nsDir = join(ROOT, ns.name);
		if (ns.name === "by-id") {
			await collectFlat(nsDir, "by-id", entries);
			continue;
		}
		// hierarchical: `<ns>/<name>/<id>.json`
		let names;
		try {
			names = await fs.readdir(nsDir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const name of names) {
			if (!name.isDirectory()) continue;
			await collectFlat(
				join(nsDir, name.name),
				`${ns.name}/${name.name}`,
				entries,
			);
		}
	}

	entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
	return entries;
}

async function collectFlat(
	dir: string,
	anchor: string,
	out: LibraryEntry[],
): Promise<void> {
	let files;
	try {
		files = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const f of files) {
		if (!f.isFile() || !f.name.endsWith(".json")) continue;
		const trailFile = join(dir, f.name);
		const id = f.name.replace(/\.json$/, "");
		try {
			const stat = await fs.stat(trailFile);
			const meta = await readMetadata(trailFile);
			const localRepoRoot = localRepoRootFromAnchor(anchor);
			// Local trails rarely record a remote in their payload; recover the
			// owner/repo from the working tree's git origin instead.
			let owner = meta.owner;
			let repo = meta.repo;
			if ((!owner || !repo) && localRepoRoot) {
				const identity = resolveLocalRepoIdentity(localRepoRoot);
				owner = owner ?? identity.owner;
				repo = repo ?? identity.repo;
			}
			out.push({
				kind: "trail",
				trailFile,
				id,
				title: meta.title ?? id,
				anchor,
				owner,
				repo,
				localRepoRoot,
				published: meta.published,
				mtimeMs: stat.mtimeMs,
			});
		} catch {
			// best-effort: a malformed file shouldn't break the whole listing
		}
	}
}

const TOURS_ROOT = join(homedir(), ".principal", "tours", "by-id");

/**
 * Walks the tour JSON cache (`~/.principal/tours/by-id/<id>.json`) to surface
 * cached File City introduction tours in the same library tab as trails.
 *
 * Tours are stored flat and verbatim as the web-ade wrapper
 * (`{ owner, repo, entry, payload }`), so unlike trails they carry an explicit
 * owner/repo but no on-disk path back to the working tree they were authored
 * against. We recover a best-effort `localRepoRoot` by matching that owner/repo
 * against the local checkouts the trails cache already knows about — clicking a
 * tour then opens it against a real working tree when one is on disk, and falls
 * back to the viewer's "no directory matched" framing when it isn't.
 */
export async function walkTours(): Promise<LibraryEntry[]> {
	let files;
	try {
		files = await fs.readdir(TOURS_ROOT, { withFileTypes: true });
	} catch {
		return [];
	}

	const out: LibraryEntry[] = [];
	for (const f of files) {
		if (!f.isFile() || !f.name.endsWith(".json")) continue;
		const trailFile = join(TOURS_ROOT, f.name);
		const id = f.name.replace(/\.json$/, "");
		try {
			const stat = await fs.stat(trailFile);
			const meta = await readTourMetadata(trailFile);
			out.push({
				kind: "tour",
				trailFile,
				id,
				title: meta.title ?? id,
				anchor: "by-id",
				owner: meta.owner,
				repo: meta.repo,
				// The local checkout is resolved from Alexandria at open time (the
				// registry is authoritative and may change between list and click).
				localRepoRoot: undefined,
				// Tours aren't draft/published like trails; the badge renders "Tour".
				published: false,
				mtimeMs: stat.mtimeMs,
			});
		} catch {
			// best-effort: a malformed file shouldn't break the whole listing
		}
	}
	return out;
}

interface CachedTourMetadata {
	title?: string;
	owner?: string;
	repo?: string;
}

/**
 * Pull title + owner/repo out of a cached tour wrapper. Title prefers the
 * lightweight `entry.title` (always present on a store fetch) and falls back to
 * the full `payload.title`; owner/repo come from the wrapper's top level, which
 * web-ade always stamps.
 */
async function readTourMetadata(path: string): Promise<CachedTourMetadata> {
	const raw = await fs.readFile(path, "utf8");
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}
	if (typeof parsed !== "object" || parsed === null) return {};
	const obj = parsed as Record<string, unknown>;

	const owner = typeof obj["owner"] === "string" ? (obj["owner"] as string) : undefined;
	const repo = typeof obj["repo"] === "string" ? (obj["repo"] as string) : undefined;

	const entryTitle =
		typeof (obj["entry"] as { title?: unknown } | undefined)?.title === "string"
			? (obj["entry"] as { title: string }).title
			: undefined;
	const payloadTitle =
		typeof (obj["payload"] as { title?: unknown } | undefined)?.title === "string"
			? (obj["payload"] as { title: string }).title
			: undefined;

	return { title: entryTitle ?? payloadTitle, owner, repo };
}

interface CachedMetadata {
	title?: string;
	owner?: string;
	repo?: string;
	published: boolean;
}

async function readMetadata(path: string): Promise<CachedMetadata> {
	const raw = await fs.readFile(path, "utf8");
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { published: false };
	}
	if (typeof parsed !== "object" || parsed === null) return { published: false };
	const obj = parsed as Record<string, unknown>;

	// web-ade wrapper: { entry, owner, repo, payload }.
	const wrapperOwner = typeof obj["owner"] === "string" ? (obj["owner"] as string) : undefined;
	const wrapperRepo = typeof obj["repo"] === "string" ? (obj["repo"] as string) : undefined;
	const inner =
		typeof obj["payload"] === "object" && obj["payload"] !== null
			? (obj["payload"] as Record<string, unknown>)
			: obj;

	const title =
		(typeof inner["title"] === "string" ? (inner["title"] as string) : undefined) ??
		(typeof (obj["entry"] as { title?: unknown } | undefined)?.title === "string"
			? ((obj["entry"] as { title: string }).title)
			: undefined);

	let owner = wrapperOwner;
	let repo = wrapperRepo;
	if (!owner || !repo) {
		const repos = inner["repos"];
		if (Array.isArray(repos) && repos.length > 0) {
			const remote = (repos[0] as { remote?: { owner?: unknown; name?: unknown } }).remote;
			if (typeof remote?.owner === "string") owner = remote.owner;
			if (typeof remote?.name === "string") repo = remote.name;
		}
	}

	// Published iff the trail carries a `share.id` — same field the open-trail
	// header and `persistShareMutation` use. Lives on `inner` (the payload for
	// wrapped files), mirroring where the share is written.
	const share = inner["share"];
	const published =
		typeof share === "object" &&
		share !== null &&
		typeof (share as { id?: unknown }).id === "string";

	return { title, owner, repo, published };
}

/**
 * Decode a `local/<slug>` cache anchor back to a working-tree path on disk.
 *
 * The cache writes local trails under `~/.principal/trails/local/<slug>/<id>.json`,
 * where `<slug>` is the abs repo path with `/` replaced by `-` (per
 * `encodePathForPurl` from `@principal-ai/alexandria-core-library`). That
 * encoding is lossy because real path segments can also contain `-`
 * (`web-ade`, `industry-themed-file-city-panels`), so we recover the original
 * by walking the filesystem: at each dash boundary, try the next slash
 * position only if the resulting prefix is an actual directory. Branches that
 * don't exist prune immediately, so this is cheap in practice.
 *
 * Anchor-driven rather than payload-driven on purpose — older trails (pre-
 * `repos[]` schema) carry only `authoredAt.sha` and no repo identity in the
 * payload, but they still land in `local/<slug>/` because the host that
 * authored them used the per-repo cache layout. The directory is the
 * authoritative signal that "this trail belongs to a working tree on disk."
 *
 * Returns `undefined` for non-local anchors and for slugs that don't resolve
 * to any directory. Callers should treat `undefined` as "fall back to remote
 * mode."
 */
/**
 * Identity for a `local/` trail, resolved from the working tree rather than the
 * payload — local trails almost never record a remote, but the directory they
 * live in usually has a GitHub `origin`. Mirrors the publish path's remote
 * sniffing (`git remote get-url origin` → purl → owner/repo). When there's no
 * GitHub origin we fall back to `local / <dir basename>` so the row at least
 * shows the repo folder instead of the dash-encoded cache path.
 *
 * Memoized by repoRoot: many trails share one working tree, and a fresh
 * `walkLibrary` (on every refresh) would otherwise re-shell `git` per file.
 */
const repoIdentityCache = new Map<string, { owner: string; repo: string }>();

export function resolveLocalRepoIdentity(repoRoot: string): { owner: string; repo: string } {
	const cached = repoIdentityCache.get(repoRoot);
	if (cached) return cached;

	let identity: { owner: string; repo: string } = {
		owner: "local",
		repo: basename(repoRoot),
	};
	try {
		const git = spawnSync(
			"git",
			["-C", repoRoot, "remote", "get-url", "origin"],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
		);
		const remoteUrl = git.stdout?.trim() ?? "";
		if (git.status === 0 && remoteUrl) {
			const purl = extractPurlFromRemoteUrl(remoteUrl);
			const parsed = purl ? parsePurl(purl) : null;
			if (parsed && parsed.type === "github" && parsed.namespace && parsed.name) {
				identity = { owner: parsed.namespace, repo: parsed.name };
			}
		}
	} catch {
		// best-effort: keep the basename fallback
	}

	repoIdentityCache.set(repoRoot, identity);
	return identity;
}

/**
 * The identity of the person *using* the viewer (distinct from the repo owner
 * resolved above). Layered, best-effort:
 *   1. `gh api user`           — GitHub login + avatar, if the gh CLI is authed.
 *   2. `TRAIL_GH_TOKEN`        — same shape via api.github.com when a token was
 *                                handed to the host but gh isn't installed.
 *   3. `git config user.*`     — the commit identity; always present in a repo
 *                                even with no GitHub auth. No avatar/login.
 *
 * `source` names which one drives the header chip (GitHub wins when present).
 * The local `git` config is *always* read and attached, even when signed in to
 * GitHub, so the provenance modal can show both identities side by side.
 * Returns `{ source: "none" }` when nothing resolves (e.g. bare dir, no git).
 */

let userIdentityCache: UserIdentity | null = null;

interface GitHubUserResponse {
	login?: string;
	name?: string;
	avatar_url?: string;
	html_url?: string;
}

function fromGitHubUser(
	raw: GitHubUserResponse,
	source: "gh" | "token",
): UserIdentity | null {
	if (!raw.login) return null;
	return {
		login: raw.login,
		name: raw.name ?? undefined,
		avatarUrl: raw.avatar_url ?? undefined,
		htmlUrl: raw.html_url ?? undefined,
		source,
	};
}

async function resolveGitHubUserFromToken(
	token: string,
): Promise<UserIdentity | null> {
	try {
		const res = await fetch("https://api.github.com/user", {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/vnd.github+json",
				"User-Agent": "principal-studio",
			},
		});
		if (!res.ok) return null;
		return fromGitHubUser((await res.json()) as GitHubUserResponse, "token");
	} catch {
		return null;
	}
}

/** Read `git config user.name` / `user.email`. Always attempted, independent of
 *  GitHub sign-in. When a repoRoot is given we read it with `-C` (picks up any
 *  repo-local override); otherwise we run git plain so the *global* identity
 *  still resolves — the common case when the library tab is showing and no trail
 *  (hence no repoRoot) is open. Returns undefined when neither value is set. */
function readGitConfigIdentity(
	repoRoot: string | undefined,
): GitConfigIdentity | undefined {
	const scope = repoRoot ? ["-C", repoRoot] : [];
	const read = (key: string): string | undefined => {
		try {
			const r = spawnSync("git", [...scope, "config", key], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			});
			const value = r.status === 0 ? r.stdout?.trim() : "";
			return value || undefined;
		} catch {
			return undefined;
		}
	};
	const name = read("user.name");
	const email = read("user.email");
	if (!name && !email) return undefined;
	return { name, email };
}

export async function resolveUserIdentity(
	repoRoot: string | undefined,
	ghToken?: string,
): Promise<UserIdentity> {
	if (userIdentityCache) return userIdentityCache;

	let identity: UserIdentity = { source: "none" };

	// 1. gh CLI — richest, gives login + avatar in one shot.
	try {
		const gh = spawnSync("gh", ["api", "user"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		if (gh.status === 0 && gh.stdout) {
			const parsed = fromGitHubUser(
				JSON.parse(gh.stdout) as GitHubUserResponse,
				"gh",
			);
			if (parsed) identity = parsed;
		}
	} catch {
		// gh missing or unauthed — fall through.
	}

	// 2. Token handed to the host.
	if (identity.source === "none" && ghToken) {
		const fromToken = await resolveGitHubUserFromToken(ghToken);
		if (fromToken) identity = fromToken;
	}

	// Local git identity — read unconditionally so the modal can show it even
	// when GitHub auth already drove the chip. Also serves as the floor source
	// when no GitHub identity resolved.
	const gitIdentity = readGitConfigIdentity(repoRoot);
	if (identity.source === "none" && gitIdentity?.name) {
		identity = { name: gitIdentity.name, source: "git" };
	}
	if (gitIdentity) identity.git = gitIdentity;

	userIdentityCache = identity;
	return identity;
}

function localRepoRootFromAnchor(anchor: string): string | undefined {
	const prefix = "local/";
	if (!anchor.startsWith(prefix)) return undefined;
	const slug = anchor.slice(prefix.length);
	if (!slug) return undefined;
	const parts = slug.split("-");
	return walkExistingPrefix("/", parts);
}

function walkExistingPrefix(prefix: string, parts: string[]): string | undefined {
	if (parts.length === 0) {
		return isExistingDirectory(prefix) ? prefix : undefined;
	}
	for (let i = 1; i <= parts.length; i++) {
		const segment = parts.slice(0, i).join("-");
		const next = prefix === "/" ? `/${segment}` : `${prefix}/${segment}`;
		if (!isExistingDirectory(next)) continue;
		const result = walkExistingPrefix(next, parts.slice(i));
		if (result) return result;
	}
	return undefined;
}

function isExistingDirectory(path: string): boolean {
	try {
		return existsSync(path) && statSync(path).isDirectory();
	} catch {
		return false;
	}
}
