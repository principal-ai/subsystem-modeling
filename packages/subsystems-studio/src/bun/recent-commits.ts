import { existsSync } from "node:fs";
import type {
	FileChange,
	FileChangeStatus,
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

function fileChangeStatus(letter: string): FileChangeStatus {
	switch (letter.toUpperCase()) {
		case "A":
			return "added";
		case "D":
			return "deleted";
		case "R":
			return "renamed";
		case "C":
			return "copied";
		default:
			return "modified";
	}
}

/**
 * Parse the NUL-separated token stream from `git ... --name-status -z`.
 * Each entry is `status`, `path`, or `status`, `old path`, `new path` for
 * renames/copies. A tiny state machine beats matching filename text.
 */
export function parseNameStatus(tokens: readonly string[]): FileChange[] {
	const clean = (value: string | undefined) =>
		(value ?? "").replace(/^\n/, "").trim();
	const changes: FileChange[] = [];
	let index = 0;
	while (index < tokens.length) {
		const statusToken = clean(tokens[index++]);
		if (!statusToken) continue;
		const letter = statusToken[0] ?? "M";
		if (letter.toUpperCase() === "R" || letter.toUpperCase() === "C") {
			const previousPath = clean(tokens[index++]);
			const path = clean(tokens[index++]);
			if (!path) continue;
			changes.push({
				path,
				previousPath: previousPath || undefined,
				status: fileChangeStatus(letter),
			});
			continue;
		}
		const path = clean(tokens[index++]);
		if (path) changes.push({ path, status: fileChangeStatus(letter) });
	}
	return changes;
}

interface LineStat {
	additions: number;
	deletions: number;
}

function parseNumstatToken(
	token: string,
): { path: string; stat: LineStat } | null {
	const raw = token.replace(/^\n/, "");
	if (!raw) return null;
	const first = raw.indexOf("\t");
	const second = first >= 0 ? raw.indexOf("\t", first + 1) : -1;
	if (first < 0 || second < 0) return null;
	const addRaw = raw.slice(0, first).trim();
	const delRaw = raw.slice(first + 1, second).trim();
	const path = raw.slice(second + 1).trim();
	if (!path) return null;
	return {
		path,
		stat: {
			additions: addRaw === "-" ? 0 : Number(addRaw) || 0,
			deletions: delRaw === "-" ? 0 : Number(delRaw) || 0,
		},
	};
}

function parseNumstatTokens(tokens: readonly string[]): Map<string, LineStat> {
	const stats = new Map<string, LineStat>();
	for (const token of tokens) {
		const parsed = parseNumstatToken(token);
		if (parsed) stats.set(parsed.path, parsed.stat);
	}
	return stats;
}

/**
 * Parse `git log --numstat -z --format=%x00COMMIT%x00%H` into per-commit
 * path stats. The status stream from `--name-status` is separate because git
 * emits only one of the two formats when both flags are present.
 */
function parseNumstatLog(
	tokens: readonly string[],
): Map<string, Map<string, LineStat>> {
	const bySha = new Map<string, Map<string, LineStat>>();
	let current: Map<string, LineStat> | null = null;
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index] ?? "";
		if (token === "COMMIT") {
			const sha = (tokens[++index] ?? "").trim();
			current = new Map();
			if (sha) bySha.set(sha, current);
			continue;
		}
		if (!current) continue;
		const parsed = parseNumstatToken(token);
		if (parsed) current.set(parsed.path, parsed.stat);
	}
	return bySha;
}

function applyLineStats(
	changes: FileChange[],
	stats: ReadonlyMap<string, LineStat> | undefined,
): LineStat | null {
	let known = false;
	let additions = 0;
	let deletions = 0;
	for (const change of changes) {
		const stat = stats?.get(change.path);
		if (!stat) continue;
		change.additions = stat.additions;
		change.deletions = stat.deletions;
		known = true;
		additions += stat.additions;
		deletions += stat.deletions;
	}
	return known ? { additions, deletions } : null;
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
		"--name-status",
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
		fileTokens: string[];
	} | null = null;
	let fieldIndex = -1;
	const pushCurrent = () => {
		if (!current) return;
		const login = parseNoreplyLogin(current.email);
		const changes = parseNameStatus(current.fileTokens);
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
			files: changes.map((change) => change.path),
			changes,
			merge: current.parents.trim().split(/\s+/).filter(Boolean).length > 1,
		});
	};
	for (const raw of log.split("\0")) {
		if (raw === "COMMIT") {
			pushCurrent();
			current = { sha: "", author: "", email: "", date: "", parents: "", subject: "", fileTokens: [] };
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
		// Status/path tokens follow the header until the next COMMIT marker.
		current.fileTokens.push(raw);
	}
	pushCurrent();

	// Line counts need a second pass: git emits either status or numstat, not
	// both, when both flags are present. Same range/SHAs, so the stats map
	// lines up with the commits parsed above.
	const numstatLog = await gitStdout(repoPath, [
		"log",
		"--first-parent",
		`--since=${since}`,
		`--max-count=${MAX_COMMITS_PER_REPO + 1}`,
		"--numstat",
		"-z",
		"--format=%x00COMMIT%x00%H",
		"HEAD",
		"--",
	]);
	const statsBySha = numstatLog
		? parseNumstatLog(numstatLog.split("\0"))
		: new Map<string, Map<string, LineStat>>();
	for (const commit of commits) {
		const totals = applyLineStats(
			commit.changes ?? [],
			statsBySha.get(commit.sha),
		);
		if (totals) {
			commit.additions = totals.additions;
			commit.deletions = totals.deletions;
		}
	}

	// Plain `--name-status` omits merge diffs; backfill them against the first
	// parent so merge commits highlight like everything else. Merges are rare,
	// so one targeted call each stays cheap.
	for (const commit of commits) {
		if ((commit.changes?.length ?? 0) > 0 || !commit.merge) continue;
		const out = await gitStdout(repoPath, [
			"diff-tree",
			"--no-commit-id",
			"--name-status",
			"-r",
			"-z",
			`${commit.sha}^1`,
			commit.sha,
			"--",
		]);
		if (out == null) continue;
		const changes = parseNameStatus(out.split("\0"));
		commit.changes = changes;
		commit.files = changes.map((change) => change.path);

		const statOut = await gitStdout(repoPath, [
			"diff-tree",
			"--no-commit-id",
			"--numstat",
			"-r",
			"-z",
			`${commit.sha}^1`,
			commit.sha,
			"--",
		]);
		if (statOut != null) {
			const totals = applyLineStats(
				changes,
				parseNumstatTokens(statOut.split("\0")),
			);
			if (totals) {
				commit.additions = totals.additions;
				commit.deletions = totals.deletions;
			}
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
