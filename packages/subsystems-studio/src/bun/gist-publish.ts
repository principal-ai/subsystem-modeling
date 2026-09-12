/**
 * Publish a portable subsystem model as a public GitHub gist.
 *
 * Token resolution mirrors the CLI trail publish path: `TRAIL_GH_TOKEN` →
 * `gh auth token` → git credential helper. The token is never logged.
 */

import { spawnSync } from "node:child_process";

export type SubsystemModelGistRef = { id: string; fileName?: string };

/** Minimal fields needed to build a portable gist payload. */
export type GistPublishDocument = {
	title: string;
	description?: string;
	components: unknown;
	relations: unknown;
	walkthroughs?: unknown;
	$schema?: string;
};

export type GistPublishResult =
	| {
			ok: true;
			gistId: string;
			gistUrl: string;
			viewUrl: string;
			fileName: string;
			created: boolean;
	  }
	| { ok: false; error: string };

const SITE_GIST_BASE =
	"https://principal-ai.github.io/subsystem-modeling/gist";

/** Keep only portable fields — drop host bindings / store metadata. */
function toPortableGistPayload(doc: GistPublishDocument): {
	title: string;
	components: unknown;
	relations: unknown;
	$schema?: string;
	description?: string;
	walkthroughs?: unknown;
} {
	const out: {
		title: string;
		components: unknown;
		relations: unknown;
		$schema?: string;
		description?: string;
		walkthroughs?: unknown;
	} = {
		title: doc.title,
		components: doc.components,
		relations: doc.relations,
	};
	if (doc.$schema) out.$schema = doc.$schema;
	if (doc.description) out.description = doc.description;
	if (doc.walkthroughs) out.walkthroughs = doc.walkthroughs;
	return out;
}

function resolveTokenViaGh(): string | null {
	const result = spawnSync("gh", ["auth", "token"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	});
	if (result.status === 0 && result.stdout) {
		const token = result.stdout.trim();
		if (token) return token;
	}
	return null;
}

function resolveTokenViaGitCredential(): string | null {
	const result = spawnSync("git", ["credential", "fill"], {
		encoding: "utf8",
		input: "protocol=https\nhost=github.com\n\n",
		stdio: ["pipe", "pipe", "ignore"],
	});
	if (result.status !== 0 || !result.stdout) return null;
	for (const line of result.stdout.split("\n")) {
		if (line.startsWith("password=")) {
			const token = line.slice("password=".length).trim();
			if (token) return token;
		}
	}
	return null;
}

/** Resolve a GitHub token for gist write. Prefer env (Studio launch), then gh/git. */
export function resolveGithubToken(): string | null {
	const fromEnv = process.env["TRAIL_GH_TOKEN"]?.trim();
	if (fromEnv) return fromEnv;
	return resolveTokenViaGh() ?? resolveTokenViaGitCredential();
}

/** Stable gist filename from the model title (or a default). */
export function gistFileNameForTitle(title: string): string {
	const slug = title
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60);
	return `${slug || "subsystem-model"}.json`;
}

function viewUrlForGist(gistId: string): string {
	return `${SITE_GIST_BASE}?gist=${encodeURIComponent(gistId)}`;
}

/**
 * Create or update a public gist holding the portable document.
 * When `existing` is set, PATCHes that gist (same id, same or prior fileName).
 */
export async function publishSubsystemModelGist(opts: {
	document: GistPublishDocument;
	existing?: SubsystemModelGistRef | null;
}): Promise<GistPublishResult> {
	const token = resolveGithubToken();
	if (!token) {
		return {
			ok: false,
			error:
				"No GitHub token found. Run `gh auth login` (gist scope) or set TRAIL_GH_TOKEN.",
		};
	}

	const portable = toPortableGistPayload(opts.document);
	const fileName =
		opts.existing?.fileName?.trim() ||
		gistFileNameForTitle(portable.title);
	const content = `${JSON.stringify(portable, null, 2)}\n`;
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "principal-subsystems-studio",
	};

	const existingId = opts.existing?.id?.trim();
	if (existingId) {
		let res: Response;
		try {
			res = await fetch(`https://api.github.com/gists/${existingId}`, {
				method: "PATCH",
				headers,
				body: JSON.stringify({
					description: portable.title,
					files: { [fileName]: { content } },
				}),
			});
		} catch {
			return { ok: false, error: "Network error updating gist." };
		}
		if (!res.ok) {
			const detail = await res.text().catch(() => "");
			return {
				ok: false,
				error: `GitHub gist update failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
			};
		}
		const body = (await res.json()) as { id?: string; html_url?: string };
		const gistId = body.id ?? existingId;
		return {
			ok: true,
			gistId,
			gistUrl: body.html_url ?? `https://gist.github.com/${gistId}`,
			viewUrl: viewUrlForGist(gistId),
			fileName,
			created: false,
		};
	}

	let res: Response;
	try {
		res = await fetch("https://api.github.com/gists", {
			method: "POST",
			headers,
			body: JSON.stringify({
				description: portable.title,
				public: true,
				files: { [fileName]: { content } },
			}),
		});
	} catch {
		return { ok: false, error: "Network error creating gist." };
	}
	if (!res.ok) {
		const detail = await res.text().catch(() => "");
		return {
			ok: false,
			error: `GitHub gist create failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
		};
	}
	const body = (await res.json()) as { id?: string; html_url?: string };
	if (!body.id) {
		return { ok: false, error: "GitHub gist create returned no id." };
	}
	return {
		ok: true,
		gistId: body.id,
		gistUrl: body.html_url ?? `https://gist.github.com/${body.id}`,
		viewUrl: viewUrlForGist(body.id),
		fileName,
		created: true,
	};
}
