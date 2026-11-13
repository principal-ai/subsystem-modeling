import { existsSync } from "node:fs";
import type {
	MergedPullRequestRepo,
	RepoCommit,
} from "../shared/contract";
import { listMergedPullRequestRepos } from "./merged-pull-requests";
import { gitStdout } from "./git-repo";

const MAX_COMMITS_PER_REPO = 100;

/** Parse a GitHub noreply address (`…+login@users.noreply.github.com`)
 *  back to the GitHub login, for zero-API avatar/filter identity. */
export function parseNoreplyLogin(email: string): string | null {
	const match = /\+([A-Za-z0-9-]+)@users\.noreply\.github\.com$/i.exec(
		email.trim(),
	);
	const login = match?.[1]?.trim();
	return login ? login : null;
}

export function commitAvatarUrl(login: string): string {
	return `https://github.com/${login}.png?size=64`;
}

/**
 * Commits on the checkout's current branch since `since` (YYYY-MM-DD, local
 * time), newest first, with changed paths inline. Merge commits are included;
 * their file list is the merge's diff against its first parent (what the
 * merge brought into this branch). Cheap and offline — one `git log` plus one
 * `diff-tree` per merge commit — so the files the repo map needs for
 * highlighting arrive in the same RPC, no progressive loading required.
 */
export async function listLocalRepoCommits(
	repoPath: string,
	since: string,
	owner: string,
	name: string,
): Promise<{ commits: RepoCommit[]; truncated: boolean }> {
	const log = await gitStdout(repoPath, [
		"log",
		"--first-parent",
		`--since=${since}`,
		`--max-count=${MAX_COMMITS_PER_REPO + 1}`,
		"--name-only",
		"-z",
		"--format=%x00COMMIT%x00%H%x00%an%x00%ae%x00%aI%x00%P%x00%s",
		"HEAD",
		"--",
	]);
	if (log == null) return { commits: [], truncated: false };
	const branchOut = await gitStdout(repoPath, ["branch", "--show-current"]);
	const branch = branchOut?.trim() || undefined;

	const commits: RepoCommit[] = [];
	let current: {
		sha: string;
		author: string;
		email: string;
		date: string;
		parents: string;
		subject: string;
		files: string[];
	} | null = null;
	let fieldIndex = -1;
	const pushCurrent = () => {
		if (!current) return;
		const login = parseNoreplyLogin(current.email);
		commits.push({
			owner,
			repo: name,
			sha: current.sha,
			message: current.subject,
			branch,
			author: login ?? (current.author || undefined),
			authorEmail: current.email || undefined,
			authorAvatarUrl: login ? commitAvatarUrl(login) : undefined,
			committedAt: current.date,
			files: current.files,
			merge: current.parents.trim().split(/\s+/).filter(Boolean).length > 1,
		});
	};
	for (const raw of log.split("\0")) {
		if (raw === "COMMIT") {
			pushCurrent();
			current = { sha: "", author: "", email: "", date: "", parents: "", subject: "", files: [] };
			fieldIndex = 0;
			continue;
		}
		if (!current || fieldIndex < 0) continue;
		if (fieldIndex < 6) {
			// Header fields arrive in format order; the subject is last and may
			// itself contain anything except NUL (paths are separate fields).
			const value = fieldIndex === 5 ? raw.replace(/^\n/, "") : raw.trim();
			if (fieldIndex === 0) current.sha = value;
			else if (fieldIndex === 1) current.author = value;
			else if (fieldIndex === 2) current.email = value;
			else if (fieldIndex === 3) current.date = value;
			else if (fieldIndex === 4) current.parents = value;
			else current.subject = value;
			fieldIndex++;
			continue;
		}
		// Changed paths follow the header until the next COMMIT marker. Each
		// path arrives with a leading newline from git's own formatting.
		const path = raw.replace(/^\n/, "").trim();
		if (path) current.files.push(path);
	}
	pushCurrent();

	// Plain `--name-only` omits merge diffs; backfill them against the first
	// parent so merge commits highlight like everything else. Merges are rare,
	// so one targeted call each stays cheap.
	for (const commit of commits) {
		if (commit.files!.length > 0 || !commit.merge) continue;
		const out = await gitStdout(repoPath, [
			"diff-tree",
			"--no-commit-id",
			"--name-only",
			"-r",
			`${commit.sha}^1`,
			commit.sha,
			"--",
		]);
		if (out != null) {
			commit.files = out.split("\n").map((line) => line.trim()).filter(Boolean);
		}
	}
	const truncated = commits.length > MAX_COMMITS_PER_REPO;
	return { commits: truncated ? commits.slice(0, MAX_COMMITS_PER_REPO) : commits, truncated };
}

/** Recent local-branch commits for an org, retaining only repos cloned locally. */
export async function listRecentCommits(opts: {
	owner: string;
	since: string;
}): Promise<{
	ok: boolean;
	commits: RepoCommit[];
	error?: string;
	errors?: string[];
	truncatedRepos?: string[];
}> {
	const owner = opts.owner.trim();
	if (!owner) return { ok: false, commits: [], error: "Choose a GitHub organization." };
	const since = (opts.since ?? "").trim().slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
		return { ok: false, commits: [], error: "Choose a time window to load commits." };
	}
	const repos = (await listMergedPullRequestRepos()).filter(
		(repo) => repo.owner.toLowerCase() === owner.toLowerCase(),
	);
	if (repos.length === 0) return { ok: true, commits: [] };

	const byRepo = new Map<string, MergedPullRequestRepo>();
	for (const repo of repos) {
		const key = `${repo.owner}/${repo.name}`.toLowerCase();
		if (!byRepo.has(key) && existsSync(repo.path)) byRepo.set(key, repo);
	}
	const commits: RepoCommit[] = [];
	const errors: string[] = [];
	const truncatedRepos: string[] = [];
	await Promise.all(
		[...byRepo.values()].map(async (repo) => {
			try {
				const result = await listLocalRepoCommits(repo.path, since, repo.owner, repo.name);
				commits.push(...result.commits);
				if (result.truncated) truncatedRepos.push(`${repo.owner}/${repo.name}`);
			} catch (error) {
				errors.push(
					`${repo.owner}/${repo.name}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}),
	);
	commits.sort((a, b) => Date.parse(b.committedAt) - Date.parse(a.committedAt));
	return {
		ok: true,
		commits,
		errors: errors.length > 0 ? errors : undefined,
		truncatedRepos: truncatedRepos.length > 0 ? truncatedRepos : undefined,
	};
}
