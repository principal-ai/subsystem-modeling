import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
	commitTouches,
	diffScopedFiles,
	filesClean,
	filesDirty,
	headSha,
	remoteRefSha,
	revDistance,
} from "./git-repo";

function git(dir: string, args: string[]): string {
	const r = spawnSync("git", ["-C", dir, ...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	// A non-zero exit is normal here (`merge-base` finds nothing on a fresh
	// repo), so callers that care check `status` themselves via `sha`.
	return r.stdout;
}

function commit(dir: string, message: string): void {
	const r = spawnSync("git", ["-C", dir, "commit", "-qam", message], {
		encoding: "utf8",
	});
	if (r.status !== 0) throw new Error(`commit ${message}: ${r.stderr}`);
}

function initRepo(): string {
	const dir = mkdtempSync(join(tmpdir(), "gitrepo-"));
	git(dir, ["init", "-q", "."]);
	git(dir, ["config", "user.email", "t@t"]);
	git(dir, ["config", "user.name", "t"]);
	writeFileSync(join(dir, "a.ts"), "one\n");
	writeFileSync(join(dir, "b.ts"), "one\n");
	git(dir, ["add", "-A"]);
	git(dir, ["commit", "-qm", "base"]);
	return dir;
}

const sha = (dir: string, ref = "HEAD"): string =>
	git(dir, ["rev-parse", ref]).trim();

describe("diffScopedFiles", () => {
	test("reports only requested paths, and survives an unrelated change", async () => {
		const dir = initRepo();
		const base = sha(dir);
		writeFileSync(join(dir, "a.ts"), "two\n");
		commit(dir, "change a");

		expect(await diffScopedFiles(dir, base, sha(dir), ["b.ts"])).toEqual([]);
		expect(await diffScopedFiles(dir, base, sha(dir), ["a.ts"])).toEqual([
			"a.ts",
		]);
	});

	test("returns null when git cannot answer, [] when nothing changed", async () => {
		const dir = initRepo();
		const head = sha(dir);
		expect(await diffScopedFiles(dir, head, head, ["a.ts"])).toEqual([]);
		expect(await diffScopedFiles(dir, "", head, ["a.ts"])).toBeNull();
		expect(await diffScopedFiles(dir, head, head, [])).toEqual([]);
	});

	test("works across a rewritten history, where revDistance gives up", async () => {
		const dir = initRepo();
		const base = sha(dir);
		writeFileSync(join(dir, "a.ts"), "two\n");
		commit(dir, "c1");
		const pin = sha(dir);
		git(dir, ["reset", "-q", "--hard", base]);
		writeFileSync(join(dir, "a.ts"), "different\n");
		commit(dir, "c1-prime");

		// The pin is orphaned, so the commit distance is untrustworthy...
		expect(await revDistance(dir, pin, sha(dir))).toEqual({
			historyRewritten: true,
		});
		// ...but the anchor question is still answerable.
		expect(await diffScopedFiles(dir, pin, sha(dir), ["a.ts"])).toEqual([
			"a.ts",
		]);
	});
});

describe("filesDirty", () => {
	test("names the dirty paths and ignores the clean ones", async () => {
		const dir = initRepo();
		writeFileSync(join(dir, "b.ts"), "dirty\n");
		expect(await filesDirty(dir, ["a.ts", "b.ts"])).toEqual(["b.ts"]);
		expect(await filesDirty(dir, ["a.ts"])).toEqual([]);
		expect(await filesDirty(dir, [])).toEqual([]);
	});

	test("reports an untracked file as dirty", async () => {
		const dir = initRepo();
		writeFileSync(join(dir, "c.ts"), "new\n");
		git(dir, ["add", "c.ts"]);
		expect(await filesDirty(dir, ["c.ts"])).toEqual(["c.ts"]);
	});

	test("stays consistent with filesClean", async () => {
		const dir = initRepo();
		expect(await filesClean(dir, ["a.ts", "b.ts"])).toBe(true);
		expect(await filesDirty(dir, ["a.ts", "b.ts"])).toEqual([]);
		writeFileSync(join(dir, "a.ts"), "dirty\n");
		expect(await filesClean(dir, ["a.ts", "b.ts"])).toBe(false);
		expect(await filesDirty(dir, ["a.ts", "b.ts"])).toEqual(["a.ts"]);
	});

	test("treats an unreadable repo as fully dirty, never clean", async () => {
		const missing = join(tmpdir(), "gitrepo-does-not-exist");
		expect(await filesDirty(missing, ["a.ts"])).toEqual(["a.ts"]);
	});
});

describe("revDistance", () => {
	test("counts commits since the pin in both directions", async () => {
		const dir = initRepo();
		const base = sha(dir);
		writeFileSync(join(dir, "a.ts"), "two\n");
		commit(dir, "c1");
		writeFileSync(join(dir, "b.ts"), "two\n");
		commit(dir, "c2");
		expect(await revDistance(dir, base, sha(dir))).toEqual({
			commitsSincePin: 2,
			pinOnlyCommits: 0,
		});
	});

	test("an identical pin is zero, not unknown", async () => {
		const dir = initRepo();
		expect(await revDistance(dir, sha(dir), sha(dir))).toEqual({
			commitsSincePin: 0,
			pinOnlyCommits: 0,
		});
	});

	test("an orphaned pin reports a rewrite instead of inflated counts", async () => {
		const dir = initRepo();
		const base = sha(dir);
		writeFileSync(join(dir, "a.ts"), "two\n");
		commit(dir, "c1");
		const pin = sha(dir);
		writeFileSync(join(dir, "b.ts"), "two\n");
		commit(dir, "c2");
		// Reset past the pin and commit different work, so `pin` is unreachable.
		git(dir, ["reset", "-q", "--hard", base]);
		writeFileSync(join(dir, "a.ts"), "different\n");
		commit(dir, "c1-prime");

		expect(await revDistance(dir, pin, sha(dir))).toEqual({
			historyRewritten: true,
		});
		// A pin still on the path is unaffected by the rewrite above.
		expect(await revDistance(dir, base, sha(dir))).toMatchObject({
			commitsSincePin: 1,
		});
	});
});

describe("commitTouches", () => {
	test("flags only the commits that touched an anchored file", async () => {
		const dir = initRepo();
		const base = sha(dir);
		writeFileSync(join(dir, "b.ts"), "two\n");
		commit(dir, "touch b");
		writeFileSync(join(dir, "a.ts"), "two\n");
		commit(dir, "touch a");
		writeFileSync(join(dir, "b.ts"), "three\n");
		commit(dir, "touch b again");

		const commits = await commitTouches(dir, base, sha(dir), ["a.ts"]);
		expect(commits?.map((c) => c.files)).toEqual([[], ["a.ts"], []]);
	});

	test("walks oldest-first and caps from the newest end", async () => {
		const dir = initRepo();
		const base = sha(dir);
		for (let i = 0; i < 5; i++) {
			writeFileSync(join(dir, "a.ts"), `v${i}\n`);
			commit(dir, `c${i}`);
		}
		const all = await commitTouches(dir, base, sha(dir), ["a.ts"]);
		expect(all?.length).toBe(5);
		// `--reverse` with `--max-count` yields the newest 2, oldest-first.
		const capped = await commitTouches(dir, base, sha(dir), ["a.ts"], 2);
		expect(capped?.length).toBe(2);
		expect(capped?.[capped.length - 1].sha).toBe(sha(dir));
	});
});

describe("remoteRefSha", () => {
	test("is null when there is no remote", async () => {
		expect(await remoteRefSha(initRepo())).toBeNull();
	});

	test("resolves origin/HEAD when a remote exists", async () => {
		const dir = initRepo();
		const bare = mkdtempSync(join(tmpdir(), "gitrepo-bare-"));
		spawnSync("git", ["init", "-q", "--bare", bare], { encoding: "utf8" });
		git(dir, ["remote", "add", "origin", bare]);
		git(dir, ["push", "-q", "-u", "origin", "HEAD"]);
		expect(await remoteRefSha(dir)).toBe(sha(dir));
	});
});

describe("headSha", () => {
	test("reads HEAD and is null outside a repo", async () => {
		const dir = initRepo();
		expect(await headSha(dir)).toBe(sha(dir));
		expect(await headSha(join(tmpdir(), "gitrepo-nope"))).toBeNull();
	});
});