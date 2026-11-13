import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	listLocalRepoCommits,
	parseNoreplyLogin,
} from "./recent-commits";

function git(dir: string, ...args: string[]): string {
	const proc = Bun.spawnSync({
		cmd: ["git", "-C", dir, ...args],
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "Test Author",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test Author",
			GIT_COMMITTER_EMAIL: "test@example.com",
		},
	});
	const out = new TextDecoder().decode(proc.stdout);
	if (proc.exitCode !== 0) {
		throw new Error(
			`git ${args.join(" ")} failed: ${new TextDecoder().decode(proc.stderr)}`,
		);
	}
	return out;
}

describe("parseNoreplyLogin", () => {
	test("extracts the login from a noreply address", () => {
		expect(parseNoreplyLogin("123456+octocat@users.noreply.github.com")).toBe("octocat");
		expect(parseNoreplyLogin("octocat@users.noreply.github.com")).toBeNull();
		expect(parseNoreplyLogin("ada@example.com")).toBeNull();
		expect(parseNoreplyLogin("")).toBeNull();
	});
});

describe("listLocalRepoCommits", () => {
	test("lists branch commits with files, including merges", async () => {
		const dir = mkdtempSync(join(tmpdir(), "recent-commits-test-"));
		git(dir, "init", "-b", "main");
		writeFileSync(join(dir, "a.txt"), "one\n");
		git(dir, "add", "a.txt");
		git(dir, "commit", "-m", "first commit");
		git(dir, "checkout", "-b", "feature");
		writeFileSync(join(dir, "b.txt"), "two\n");
		git(dir, "add", "b.txt");
		git(dir, "commit", "-m", "feature work");
		git(dir, "checkout", "main");
		git(dir, "merge", "--no-ff", "-m", "merge feature", "feature");

		const { commits, truncated } = await listLocalRepoCommits(dir, "2000-01-01", "o", "r");
		expect(truncated).toBe(false);
		expect(commits.map((c) => c.message)).toEqual([
			"merge feature",
			"first commit",
		]);
		const merge = commits[0]!;
		expect(merge.merge).toBe(true);
		expect(merge.files).toContain("b.txt");
		expect(commits[1]!.merge).toBe(false);
		expect(commits[1]!.files).toContain("a.txt");
		expect(merge.committedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(merge.author).toBe("Test Author");
	});

	test("respects the since bound", async () => {
		const dir = mkdtempSync(join(tmpdir(), "recent-commits-test-"));
		git(dir, "init", "-b", "main");
		writeFileSync(join(dir, "a.txt"), "one\n");
		git(dir, "add", "a.txt");
		git(dir, "commit", "-m", "old commit");
		// NB: far-future dates like 2999-01-01 hit a git approxidate quirk
		// and don't filter; use a realistic near-future date instead.
		const future = new Date(Date.now() + 30 * 86_400_000);
		const since = future.toISOString().slice(0, 10);
		const { commits } = await listLocalRepoCommits(dir, since, "o", "r");
		expect(commits).toEqual([]);
	});

	test("returns empty for a non-repo path", async () => {
		const dir = mkdtempSync(join(tmpdir(), "recent-commits-test-"));
		const { commits } = await listLocalRepoCommits(dir, "2000-01-01", "o", "r");
		expect(commits).toEqual([]);
	});
});
