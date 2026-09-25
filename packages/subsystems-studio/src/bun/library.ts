/**
 * Walks the tour JSON store (`~/.principal/tours/by-id/<id>.json`) to power the
 * library tab, and resolves local/user identities for the header.
 */

import { spawnSync } from "node:child_process";
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

const TOURS_ROOT = join(homedir(), ".principal", "tours", "by-id");

/**
 * Walks the tour JSON store to surface cached File City introduction tours.
 *
 * Tours are stored flat and verbatim as the wrapper
 * (`{ owner, repo, entry, payload }`), so unlike a hand-authored file they carry
 * an explicit owner/repo but no on-disk path back to the working tree they were
 * authored against. The local checkout is resolved from Alexandria at open time.
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
		const file = join(TOURS_ROOT, f.name);
		const id = f.name.replace(/\.json$/, "");
		try {
			const stat = await fs.stat(file);
			const meta = await readTourMetadata(file);
			out.push({
				file,
				id,
				title: meta.title ?? id,
				anchor: "by-id",
				owner: meta.owner,
				repo: meta.repo,
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
 * the full `payload.title`; owner/repo come from the wrapper's top level.
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

/**
 * Resolve a tab's repo identity from its working tree rather than the payload —
 * a tour opened against a local checkout shows `owner/name` recovered from that
 * checkout's GitHub `origin`. When there's no GitHub origin we fall back to
 * `local / <dir basename>`.
 *
 * Memoized by repoRoot: many tabs share one working tree, and a fresh listing
 * would otherwise re-shell `git` per file.
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
 *  still resolves — the common case when the library tab is showing and no tab
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
