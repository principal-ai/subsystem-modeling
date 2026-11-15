import { resolveGithubToken } from "./gist-publish";

interface GitHubRateLimitResponse {
	resources?: {
		core?: { limit?: number; remaining?: number; reset?: number };
		search?: { limit?: number; remaining?: number; reset?: number };
	};
	message?: string;
}

function toResource(value: {
	limit?: number;
	remaining?: number;
	reset?: number;
} | undefined) {
	if (
		value?.limit === undefined ||
		value.remaining === undefined ||
		value.reset === undefined
	) {
		return undefined;
	}
	return {
		limit: value.limit,
		remaining: value.remaining,
		resetAt: new Date(value.reset * 1000).toISOString(),
	};
}

/** Read the current authenticated user's core and search API quotas. */
export async function getGithubApiRateLimit() {
	const token = resolveGithubToken();
	try {
		const response = await fetch("https://api.github.com/rate_limit", {
			headers: {
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
				...(token ? { Authorization: `Bearer ${token}` } : {}),
			},
			signal: AbortSignal.timeout(10_000),
		});
		const body = (await response.json().catch(() => ({}))) as GitHubRateLimitResponse;
		if (!response.ok) {
			return {
				ok: false,
				authenticated: Boolean(token),
				error: body.message ?? `GitHub API returned ${response.status}.`,
			};
		}
		const core = toResource(body.resources?.core);
		const search = toResource(body.resources?.search);
		if (!core && !search) {
			return { ok: false, authenticated: Boolean(token), error: "GitHub returned no rate-limit details." };
		}
		return {
			ok: true,
			authenticated: Boolean(token),
			core,
			search,
		};
	} catch (error) {
		return {
			ok: false,
			authenticated: Boolean(token),
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
