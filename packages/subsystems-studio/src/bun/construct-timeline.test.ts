import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type RunGraphifyExtractOptions, type RunGraphifyExtractResult } from "./graphify-runner";
import { ConstructTimelineService, diffTimelineIdentities, parseTimelineLog } from "./construct-timeline";
import { summarizeConstructTimeline, timelineFileCoverage, timelineFileStatus } from "../shared/construct-timeline";

const purl = "pkg:github/test/timeline";
let root: string;

const f = (value: number) => `export function f() {\n  return ${value};\n}\n`;
const g = (value: number) => `export function g() {\n  return ${value};\n}\n`;
/** root -> change f -> introduce g -> remove g -> change f */
const HISTORY: Array<Record<string, string | null>> = [
	{ "a.ts": f(1) }, { "a.ts": f(2) }, { "b.ts": g(3) }, { "b.ts": null }, { "a.ts": f(4) },
];

beforeAll(async () => {
	root = await fs.mkdtemp(join(tmpdir(), "construct-timeline-test-"));
});

afterAll(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

/** Build a fresh repo and return its directory plus the sha of every commit. */
async function makeRepo(name: string, steps: Array<Record<string, string | null>> = HISTORY, dates?: readonly string[]) {
	const repo = join(root, name);
	await fs.mkdir(repo, { recursive: true });
	let committedAt: string | undefined;
	const run = async (...args: string[]): Promise<string> => {
		const proc = Bun.spawn(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe",
			env: { ...process.env, ...(committedAt ? { GIT_AUTHOR_DATE: committedAt, GIT_COMMITTER_DATE: committedAt } : {}) } });
		const [out, error] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
		if (await proc.exited) throw new Error(error);
		return out.trim();
	};
	await run("init");
	const shas: string[] = [];
	for (const [index, step] of steps.entries()) {
		committedAt = dates?.[index];
		for (const [file, content] of Object.entries(step)) {
			if (content === null) await fs.rm(join(repo, file), { force: true });
			else await fs.writeFile(join(repo, file), content);
		}
		await run("add", "-A");
		await run("commit", "--allow-empty", "-m", `Commit ${index}`);
		shas.push(await run("rev-parse", "HEAD"));
	}
	committedAt = undefined;
	return { repo, shas, run };
}

async function extract(opts: RunGraphifyExtractOptions): Promise<RunGraphifyExtractResult> {
	const names = (await fs.readdir(opts.repoRoot)).filter((name) => name.endsWith(".ts"));
	const nodes = [];
	for (const name of names) {
		const content = await fs.readFile(join(opts.repoRoot, name), "utf8");
		const symbol = content.match(/function (\w+)/)![1]!;
		nodes.push({
			id: `${name.slice(0, -3)}_${symbol}`, label: `${symbol}()`, source_file: name,
			source_location: `L${content.slice(0, content.indexOf("export function")).split("\n").length}`, file_type: "code",
		});
	}
	const graph = { nodes, links: [] };
	const output = join(opts.outDir!, "graphify-out");
	await fs.mkdir(output, { recursive: true });
	const graphJsonPath = join(output, "graph.json");
	await fs.writeFile(graphJsonPath, JSON.stringify(graph));
	return {
		ok: true, repoRoot: opts.repoRoot, outDir: opts.outDir!, graphifyOut: output, graphJsonPath,
		graph, nodeCount: nodes.length, edgeCount: 0, usedTempOut: false, durationMs: 1, stdout: "", stderr: "",
	};
}

function service(name: string, repo: string) {
	return new ConstructTimelineService({ storeRoot: join(root, name), resolveRepo: () => repo, extract });
}

describe("cumulative construct timeline", () => {
	test("advances through history presets from the epoch and resumes after the cursor without repeating work", async () => {
		const dates = ["2026-01-31T08:00:00Z", "2026-01-31T20:00:00Z", "2026-02-01T00:00:00Z",
			"2026-02-07T12:00:00Z", "2026-03-07T00:00:00Z", "2026-04-07T00:00:00Z"];
		const { repo, shas } = await makeRepo("history-preset-repo", dates.map((_, index) => ({ "a.ts": f(index) })), dates);
		const timeline = service("history-preset-store", repo);
		const deadlines = spyOn(globalThis, "setTimeout");
		try {
			await timeline.extend(purl, { historyPeriod: "day" });
			await timeline.wait(purl);
			expect((await timeline.get(purl))!.events.map((event) => event.sha)).toEqual(shas.slice(0, 2));
			await timeline.extend(purl, { historyPeriod: "week" });
			await timeline.wait(purl);
			expect((await timeline.get(purl))!.events.map((event) => event.sha)).toEqual(shas.slice(0, 4));
			await timeline.extend(purl, { historyPeriod: "month" });
			await timeline.wait(purl);
			expect((await timeline.get(purl))!.events.map((event) => event.sha)).toEqual(shas.slice(0, 5));
			await timeline.extend(purl, { maxCommits: 10 });
			await timeline.wait(purl);
			expect((await timeline.get(purl))!.events.map((event) => event.sha)).toEqual(shas);
			expect(deadlines.mock.calls.some((call) => call[1] === 600_000)).toBe(false);
		} finally { deadlines.mockRestore(); }
	});

	test("only installs a runtime deadline when requested, and preserves the cursor on expiry", async () => {
		const { repo, shas } = await makeRepo("runtime-preset-repo", [{ "a.ts": f(1) }, { "a.ts": f(2) }]);
		let entered!: () => void, release!: () => void;
		const started = new Promise<void>((resolve) => { entered = resolve; });
		const gate = new Promise<void>((resolve) => { release = resolve; });
		const timeline = new ConstructTimelineService({ storeRoot: join(root, "runtime-preset-store"), resolveRepo: () => repo,
			extract: async (options) => { entered(); await gate; return extract(options); } });
		const deadlines = spyOn(globalThis, "setTimeout");
		try {
			await timeline.extend(purl, { maxMinutes: 60 });
			await started;
			const deadline = deadlines.mock.calls.find((call) => call[1] === 3_600_000);
			expect(deadline).toBeDefined();
			(deadline![0] as () => void)();
			release();
			await timeline.wait(purl);
			const stopped = (await timeline.get(purl))!;
			expect(stopped.meta.status).toBe("interrupted");
			expect(stopped.meta.error).toContain("Time budget reached (60.0 min)");
			expect(stopped.meta.cursor).toBeUndefined();
			expect(stopped.events).toHaveLength(0);
			await timeline.extend(purl, { maxCommits: 10 });
			await timeline.wait(purl);
			expect((await timeline.get(purl))!.events.map((event) => event.sha)).toEqual(shas);
		} finally { release(); await timeline.wait(purl); deadlines.mockRestore(); }
	});

	test("reads exact Git changes and full messages, including renames, type/mode changes and empty commits", async () => {
		const odd = "old name\t\n.ts";
		const { repo, shas, run } = await makeRepo("git-changes-repo", [{
			"edit.ts": f(1), [odd]: f(1), "link-or-file": "target", "mode.sh": "echo hi\n", "delete.bin": "\0\x01",
		}]);
		const timeline = service("git-changes-store", repo);
		const initial = await timeline.getFiles(purl, shas[0]!);
		expect(initial.message).toBe("Commit 0");
		expect(initial.changes).toHaveLength(5);
		expect(initial.changes!.every((change) => change.status === "added")).toBe(true);
		await fs.writeFile(join(repo, "edit.ts"), f(2));
		await fs.rename(join(repo, odd), join(repo, "renamed.ts"));
		await fs.rm(join(repo, "delete.bin"));
		await fs.rm(join(repo, "link-or-file"));
		await fs.symlink("edit.ts", join(repo, "link-or-file"));
		await fs.chmod(join(repo, "mode.sh"), 0o755);
		await run("add", "-A");
		await run("commit", "-m", "Update <files>", "-m", "Full message body.\n\nPreserve paragraphs and café.");
		const sha = await run("rev-parse", "HEAD");
		await fs.writeFile(join(repo, "edit.ts"), "dirty, not part of the commit");
		const before = await run("status", "--porcelain");
		const snapshot = await timeline.getFiles(purl, sha);
		expect(snapshot.message).toBe("Update <files>\n\nFull message body.\n\nPreserve paragraphs and café.");
		expect(snapshot.changes).toEqual([
			{ path: "delete.bin", status: "removed", before: { size: 2, kind: "file" } },
			{ path: "edit.ts", status: "modified" },
			{ path: "link-or-file", status: "modified" },
			{ path: "mode.sh", status: "modified" },
			{ path: odd, status: "removed", before: { size: Buffer.byteLength(f(1)), kind: "file" } },
			{ path: "renamed.ts", status: "added" },
		]);
		expect(snapshot.files.some((file) => file.path === odd || file.path === "delete.bin")).toBe(false);
		expect(snapshot.files.every((file) => file.status === "uncovered" && !file.coverage)).toBe(true);
		expect(await run("status", "--porcelain")).toBe(before);
		expect(await timeline.get(purl)).toBeUndefined();
		await run("commit", "--allow-empty", "-m", "Empty");
		expect((await timeline.getFiles(purl, await run("rev-parse", "HEAD"))).changes).toEqual([]);
	});

	test("diffs merge commits against the first parent, not the merged branch", async () => {
		const { repo, shas, run } = await makeRepo("merge-changes-repo", [{ "a.ts": f(1) }, { "a.ts": f(2) }]);
		const main = await run("branch", "--show-current");
		await run("checkout", "-b", "side", shas[0]!);
		await fs.writeFile(join(repo, "side.ts"), g(3));
		await run("add", "-A");
		await run("commit", "-m", "Side branch");
		await run("checkout", main);
		await run("merge", "--no-ff", "side", "-m", "Merge side branch");
		const timeline = service("merge-changes-store", repo);
		const snapshot = await timeline.getFiles(purl, await run("rev-parse", "HEAD"));
		expect(snapshot.changes).toEqual([{ path: "side.ts", status: "added" }]);
		expect(snapshot.message).toBe("Merge side branch");
	});

	test("keeps shallow snapshots readable without treating missing parents as root commits", async () => {
		const { repo, shas } = await makeRepo("shallow-changes-repo", [{ "a.ts": f(1) }, { "a.ts": f(2) }]);
		await fs.writeFile(join(repo, ".git", "shallow"), `${shas[1]}\n`);
		await fs.rm(join(repo, ".git", "objects", shas[0]!.slice(0, 2), shas[0]!.slice(2)));
		const snapshot = await service("shallow-changes-store", repo).getFiles(purl, shas[1]!);
		expect(snapshot.files).toHaveLength(1);
		expect(snapshot.message).toBe("Commit 1");
		expect(snapshot.changes).toBeUndefined();
	});

	test("reports the actual in-flight commit without persisting progress as completed analysis", async () => {
		const { repo, shas } = await makeRepo("processing-repo", [{ "a.ts": f(1) }, { "a.ts": f(2) }]);
		const steps = [0, 1].map(() => {
			let entered!: () => void;
			let release!: () => void;
			const started = new Promise<void>((resolve) => { entered = resolve; });
			const gate = new Promise<void>((resolve) => { release = resolve; });
			return { started, gate, entered: () => entered(), release: () => release() };
		});
		const storeRoot = join(root, "processing-store");
		let index = 0;
		const timeline = new ConstructTimelineService({
			storeRoot, resolveRepo: () => repo,
			extract: async (options) => {
				const step = steps[index++]!;
				step.entered();
				await step.gate;
				return extract(options);
			},
		});
		await timeline.extend(purl, { maxMinutes: 1 });
		try {
			await steps[0]!.started;
			const first = (await timeline.get(purl))!;
			expect(first.meta.processing?.sha).toBe(shas[0]);
			expect(first.meta.cursor).toBeUndefined();
			expect(first.events).toHaveLength(0);
			const directory = join(storeRoot, (await fs.readdir(storeRoot))[0]!);
			expect(JSON.parse(await fs.readFile(join(directory, "timeline.json"), "utf8")).processing).toBeUndefined();
			const offline = new ConstructTimelineService({ storeRoot, resolveRepo: () => repo });
			expect((await offline.get(purl))!.meta.processing).toBeUndefined();
			const preview = await offline.getFiles(purl, first.meta.processing!.sha);
			expect(preview).toMatchObject({ analyzed: false, message: "Commit 0", changes: [{ path: "a.ts", status: "added" }] });
			steps[0]!.release();
			await steps[1]!.started;
			const next = (await timeline.get(purl))!;
			expect(next.meta.processing?.sha).toBe(shas[1]);
			expect(next.meta.cursor?.sha).toBe(shas[0]);
			expect(next.events).toHaveLength(1);
		} finally {
			for (const step of steps) step.release();
			await timeline.wait(purl);
		}
		const done = (await timeline.get(purl))!;
		expect(done.meta.status).toBe("idle");
		expect(done.meta.processing).toBeUndefined();
		expect(done.meta.cursor?.sha).toBe(shas[1]);
	});

	test("reads full first-parent activity and gray Git-only maps without creating or changing analysis", async () => {
		const { repo, shas, run } = await makeRepo("activity-repo", [
			{ "a.ts": f(1), "main.zig": "pub fn main() void {}\n", "README.md": "Initial\n" },
			{ "a.ts": f(2) }, { "a.ts": f(3) },
		]);
		const timeline = service("activity-store", repo);
		const head = await run("rev-parse", "HEAD");
		await fs.writeFile(join(repo, "a.ts"), "dirty source\n");
		await fs.writeFile(join(repo, "untracked.txt"), "keep\n");
		const status = await run("status", "--porcelain");
		const history = await timeline.getHistory(purl);
		expect(history.map((commit) => commit.sha)).toEqual([...shas].reverse());
		expect(history[0]).toMatchObject({ subject: "Commit 2", committedAt: expect.any(String) });
		const initial = await timeline.getFiles(purl, shas[0]!);
		expect(initial).toMatchObject({ analyzed: false, coverageAvailable: false });
		expect(initial.files.every((file) => file.status === "uncovered" && !file.coverage)).toBe(true);
		expect(initial.files.find((file) => file.path === "a.ts")!.size).toBe(Buffer.byteLength(f(1)));
		expect(await timeline.get(purl)).toBeUndefined();
		expect(await fs.stat(join(root, "activity-store")).catch(() => undefined)).toBeUndefined();
		expect(await run("status", "--porcelain")).toBe(status);
		expect(await run("rev-parse", "HEAD")).toBe(head);
		expect(await fs.readFile(join(repo, "a.ts"), "utf8")).toBe("dirty source\n");

		await timeline.extend(purl, { maxCommits: 1, maxMinutes: 1 });
		await timeline.wait(purl);
		const before = await timeline.get(purl);
		const directory = join(root, "activity-store", (await fs.readdir(join(root, "activity-store")))[0]!);
		const privateHead = await fs.readFile(join(directory, "repository", ".git", "HEAD"), "utf8");
		expect((await timeline.getFiles(purl, shas[0]!)).analyzed).toBe(true);
		expect((await timeline.getFiles(purl, shas[2]!)).analyzed).toBe(false);
		expect(await timeline.get(purl)).toEqual(before);
		expect(await fs.readFile(join(directory, "repository", ".git", "HEAD"), "utf8")).toBe(privateHead);
		// A clone's detached checkout is the cursor, not the history tip.
		const offline = new ConstructTimelineService({ storeRoot: join(root, "activity-store"), resolveRepo: () => null });
		expect((await offline.getHistory(purl)).map((commit) => commit.sha)).toEqual([...shas].reverse());
		expect((await offline.getFiles(purl, shas[2]!)).analyzed).toBe(false);
		// Commits added after the clone was fetched are read from source objects,
		// without fetching into or changing the analysis checkout.
		await fs.writeFile(join(repo, "a.ts"), f(4));
		await run("add", "a.ts");
		await run("commit", "-m", "New source commit");
		const newTip = await run("rev-parse", "HEAD");
		expect((await timeline.getHistory(purl))[0]!.sha).toBe(newTip);
		const newSnapshot = await timeline.getFiles(purl, newTip);
		expect(newSnapshot.files.find((file) => file.path === "a.ts")!.size).toBe(Buffer.byteLength(f(4)));
		expect(newSnapshot.message).toBe("New source commit");
		expect(newSnapshot.changes).toEqual([{ path: "a.ts", status: "modified" }]);
		expect(await timeline.get(purl)).toEqual(before);
		expect(await fs.readFile(join(directory, "repository", ".git", "HEAD"), "utf8")).toBe(privateHead);
		const offChain = await run("commit-tree", `${head}^{tree}`, "-p", head, "-m", "Not on first-parent chain");
		await expect(timeline.getFiles(purl, offChain)).rejects.toThrow("first-parent history");
	});

	test("starts at the epoch, records transitions forward, and advances the cursor", async () => {
		const { repo, shas } = await makeRepo("baseline-repo");
		const timeline = service("baseline", repo);
		expect(await timeline.get(purl)).toBeUndefined();
		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		const stored = (await timeline.get(purl))!;
		expect(stored.meta.status).toBe("idle");
		expect(stored.meta.epoch?.sha).toBe(shas[0]!);
		expect(stored.meta.cursor?.sha).toBe(shas[4]!);
		expect(stored.meta.events).toBe(5);
		expect(stored.meta.constructs).toBe(1);
		expect(stored.events.map((event) => event.sha)).toEqual(shas);
		const names = (event: { introduced: Array<{ file: string; symbol: string }> }) =>
			event.introduced.map((identity) => `${identity.file}:${identity.symbol}`);
		expect(stored.events.map(names)).toEqual([["a.ts:f"], [], ["b.ts:g"], [], []]);
		expect(stored.events.map((event) => event.changed.map((identity) => identity.symbol)))
			.toEqual([[], ["f"], [], [], ["f"]]);
		expect(stored.events[3]!.removed.map((identity) => identity.symbol)).toEqual(["g"]);
		expect(stored.events[0]!.introduced[0]!.after).toMatchObject({
			sha: shas[0], span: { startLine: 1, endLine: 3, contentHash: expect.any(String) },
		});
		expect(stored.events[1]!.changed[0]).toMatchObject({
			before: { sha: shas[0], span: { startLine: 1, endLine: 3 } },
			after: { sha: shas[1], span: { startLine: 1, endLine: 3 } },
		});
		expect(stored.events[1]!.changed[0]!.before!.span.contentHash)
			.not.toBe(stored.events[1]!.changed[0]!.after!.span.contentHash);
		expect(stored.events[3]!.removed[0]).toMatchObject({
			before: { sha: shas[2], span: { startLine: 1, endLine: 3 } },
		});
		expect(stored.events[3]!.removed[0]!.after).toBeUndefined();
		expect(stored.events.every((event) => event.constructs >= 1 && event.coverage.verified >= 1)).toBe(true);
		expect(summarizeConstructTimeline(stored.events)).toMatchObject({ introduced: 2, removed: 1, changed: 2 });
	});

	test("extends forward from the cursor without re-analyzing earlier commits", async () => {
		const { repo, shas, run } = await makeRepo("incremental-repo");
		const timeline = service("incremental", repo);
		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		const first = (await timeline.get(purl))!;
		const directory = join(root, "incremental", (await fs.readdir(join(root, "incremental")))[0]!);
		const eventsPath = join(directory, "events.ndjson");
		const bytes = (await fs.stat(eventsPath)).size;

		await fs.writeFile(join(repo, "a.ts"), f(5));
		await run("add", "-A");
		await run("commit", "-m", "Commit 5");
		const tip = await run("rev-parse", "HEAD");

		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		const second = (await timeline.get(purl))!;
		// Only the new commit is appended; the earlier prefix is untouched on disk.
		expect(second.events.slice(0, first.events.length)).toEqual(first.events);
		expect(second.events).toHaveLength(first.events.length + 1);
		expect(second.events.at(-1)!.sha).toBe(tip);
		expect(second.events.at(-1)!.changed.map((identity) => identity.symbol)).toEqual(["f"]);
		expect((await fs.stat(eventsPath)).size).toBeGreaterThan(bytes);
		expect(second.meta.cursor?.sha).toBe(tip);
		expect(shas).toHaveLength(5);
	});

	test("caps each extension and resumes from the cursor, oldest first", async () => {
		const { repo, shas } = await makeRepo("capped-repo");
		const timeline = service("capped", repo);
		await timeline.extend(purl, { maxCommits: 2, maxMinutes: 1 });
		await timeline.wait(purl);
		const first = (await timeline.get(purl))!;
		expect(first.events.map((event) => event.sha)).toEqual(shas.slice(0, 2));
		expect(first.meta.cursor?.sha).toBe(shas[1]!);

		await timeline.extend(purl, { maxCommits: 2, maxMinutes: 1 });
		await timeline.wait(purl);
		const second = (await timeline.get(purl))!;
		expect(second.events.map((event) => event.sha)).toEqual(shas.slice(0, 4));
		expect(second.meta.cursor?.sha).toBe(shas[3]!);

		await timeline.extend(purl, { maxCommits: 2, maxMinutes: 1 });
		await timeline.wait(purl);
		const third = (await timeline.get(purl))!;
		expect(third.events.map((event) => event.sha)).toEqual(shas);
		expect(third.meta.cursor?.sha).toBe(shas[4]!);

		// A no-op extension leaves the timeline as-is.
		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		expect((await timeline.get(purl))!.meta.events).toBe(5);
	});

	test("detects a rewritten history instead of splicing a disjoint log", async () => {
		const { repo, shas, run } = await makeRepo("rewrite-repo");
		const timeline = service("rewrite", repo);
		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		expect((await timeline.get(purl))!.meta.cursor?.sha).toBe(shas[4]!);
		// Rewrite: branch from the root with a different tip.
		await run("checkout", "--detach", shas[0]!);
		await fs.writeFile(join(repo, "a.ts"), f(99));
		await run("add", "-A");
		await run("commit", "-m", "Rewritten");
		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		const stored = (await timeline.get(purl))!;
		expect(stored.meta.status).toBe("failed");
		expect(stored.meta.error).toContain("rewritten");
		// The recorded prefix is preserved; nothing disjoint was spliced in.
		expect(stored.meta.events).toBe(5);
		expect(stored.events.map((event) => event.sha)).toEqual(shas);
	});

	test("reports a running extension that was left behind as interrupted", async () => {
		const { repo } = await makeRepo("interrupted-repo");
		const timeline = service("interrupted", repo);
		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		const directory = join(root, "interrupted", (await fs.readdir(join(root, "interrupted")))[0]!);
		const metaPath = join(directory, "timeline.json");
		const meta = JSON.parse(await fs.readFile(metaPath, "utf8")) as Record<string, unknown>;
		await fs.writeFile(metaPath, JSON.stringify({ ...meta, status: "running" }));
		const fresh = service("interrupted", repo);
		expect((await fresh.get(purl))!.meta.status).toBe("interrupted");
	});

	test("validates limits and PURLs", async () => {
		const { repo } = await makeRepo("limits-repo");
		const timeline = service("limits", repo);
		await expect(timeline.extend(purl, { maxCommits: 0 })).rejects.toThrow();
		await expect(timeline.extend(purl, { maxCommits: 1.5 })).rejects.toThrow();
		await expect(timeline.extend(purl, { maxMinutes: 0 })).rejects.toThrow();
		await expect(timeline.extend(purl, { maxMinutes: 1_000 })).rejects.toThrow();
		await expect(timeline.extend(purl, { historyPeriod: "year" as "day" })).rejects.toThrow("day, week or month");
		await expect(timeline.extend("not-a-purl", {})).rejects.toThrow();
	});

	test("retains per-file coverage for unchanged files and reads the selected Git tree without checkout", async () => {
		const unusual = "notes\twith\nnewline.md";
		const { repo, shas } = await makeRepo("file-coverage-repo", [
			{ "a.ts": f(1), "main.zig": "pub fn main() void {}", "main.c": "int main() {}", [unusual]: "initial notes" }, { "b.ts": g(1) }, { "b.ts": null },
		]);
		const timeline = service("file-coverage", repo);
		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		const directory = join(root, "file-coverage", (await fs.readdir(join(root, "file-coverage")))[0]!);
		const checkoutFile = join(directory, "repository", "a.ts");
		const headPath = join(directory, "repository", ".git", "HEAD");
		const head = await fs.readFile(headPath, "utf8");
		const first = await timeline.getFiles(purl, shas[0]!);
		expect(first.coverageAvailable).toBe(true);
		expect(first.files.find((file) => file.path === "a.ts")).toMatchObject({
			status: "verified", kind: "file", size: Buffer.byteLength(f(1)), coverage: { verified: 1, unresolved: 0 },
		});
		expect(first.files.find((file) => file.path === unusual)).toMatchObject({ status: "non-code", size: 13 });
		expect(first.files.find((file) => file.path === "main.zig")!.status).toBe("unsupported");
		expect(first.files.find((file) => file.path === "main.zig")!.coverage).toBeUndefined();
		expect(first.files.find((file) => file.path === "main.c")!.status).toBe("unsupported");
		expect(first.files.some((file) => file.path === "b.ts")).toBe(false);
		const second = await timeline.getFiles(purl, shas[1]!);
		expect(second.files.find((file) => file.path === "a.ts")!.status).toBe("verified");
		expect(second.files.find((file) => file.path === "a.ts")!.coverage!.declarations).toEqual([
			{ symbol: "f", construct: "function", status: "verified", startLine: 1, endLine: 3 },
		]);
		expect(second.files.find((file) => file.path === "b.ts")!.status).toBe("verified");
		expect((await timeline.getFiles(purl, shas[2]!)).files.some((file) => file.path === "b.ts")).toBe(false);
		expect(await fs.readFile(headPath, "utf8")).toBe(head);
		expect(await fs.readFile(checkoutFile, "utf8")).toBe(f(1));
		await expect(timeline.getFiles(purl, "HEAD")).rejects.toThrow("full commit");
		await expect(timeline.getFiles(purl, "f".repeat(40))).rejects.toThrow("first-parent history");

		// Older events must not be painted green just because a transition exists.
		const eventsPath = join(directory, "events.ndjson");
		const events = (await timeline.get(purl))!.events;
		for (const event of events) delete event.files;
		await fs.writeFile(eventsPath, events.map((event) => JSON.stringify(event)).join("\n") + "\n");
		const legacy = await timeline.getFiles(purl, shas[0]!);
		expect(legacy.coverageAvailable).toBe(false);
		expect(legacy.files.find((file) => file.path === "a.ts")!.status).toBe("uncovered");
		expect(legacy.files.find((file) => file.path === "main.zig")!.status).toBe("unsupported");
		expect(legacy.files.find((file) => file.path === unusual)!.status).toBe("non-code");
		expect((await timeline.get(purl))!.events[0]!.files).toBeUndefined();
	});

	test("aggregates observed candidates without hiding partial or failed files", () => {
		const files = timelineFileCoverage([
			{ file: "a.ts", symbol: "f", construct: "function", span: { startLine: 1, endLine: 3 }, verification: { status: "verified", evidence: "Verified." } },
			{ file: "a.ts", symbol: "missing", graphStartLine: 5, verification: { status: "unresolved", evidence: "Anchor does not match a declaration." } },
			{ file: "error.ts", symbol: "failed", verification: { status: "error", evidence: "Could not initialize parser." } },
			{ file: "unknown.nix", symbol: "unknown", verification: { status: "unsupported", evidence: "No bundled parser." } },
			{ file: "ok.ts", symbol: "ok", verification: { status: "verified", evidence: "Verified." } },
			{ file: "unresolved.ts", symbol: "missing", verification: { status: "unresolved", evidence: "No matching declaration." } },
		]);
		expect(files.map((file) => [file.file, timelineFileStatus(file)])).toEqual([
			["a.ts", "partial"], ["error.ts", "error"], ["ok.ts", "verified"],
			["unknown.nix", "unsupported"], ["unresolved.ts", "unresolved"],
		]);
		expect(timelineFileStatus()).toBe("uncovered");
		expect(files[0]).toEqual({ file: "a.ts", verified: 1, unresolved: 1, unsupported: 0, error: 0, declarations: [
			{ symbol: "f", construct: "function", status: "verified", startLine: 1, endLine: 3 },
			{ symbol: "missing", status: "unresolved", graphStartLine: 5, evidence: "Anchor does not match a declaration." },
		] });
	});

	test("retains verified and unresolved names, reasons and locations for unchanged files after restart", async () => {
		const { repo, shas } = await makeRepo("declaration-outcomes-repo", [
			{ "a.ts": f(1) }, { "README.md": "notes only" },
		]);
		const storeRoot = join(root, "declaration-outcomes");
		const timeline = new ConstructTimelineService({
			storeRoot, resolveRepo: () => repo,
			extract: async (options) => {
				const result = await extract(options);
				result.graph.nodes.push({ id: "unmatched", label: "missing()", source_file: "a.ts", source_location: "L1", file_type: "code" });
				result.nodeCount++;
				return result;
			},
		});
		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		const restarted = new ConstructTimelineService({ storeRoot });
		const stored = (await restarted.get(purl))!;
		expect(stored.events[1]!.introduced).toHaveLength(0);
		const snapshot = await restarted.getFiles(purl, shas[1]!);
		const file = snapshot.files.find((entry) => entry.path === "a.ts")!;
		expect(file.status).toBe("partial");
		expect(file.coverage!.declarations).toEqual([
			{ symbol: "f", construct: "function", status: "verified", startLine: 1, endLine: 3 },
			{ symbol: "missing", status: "unresolved", graphStartLine: 1,
				evidence: "The graph anchor and name do not identify one supported source declaration." },
		]);
		expect(file.coverage!.declarations).toEqual(stored.events[0]!.files![0]!.declarations);
		const directory = join(storeRoot, (await fs.readdir(storeRoot))[0]!);
		for (const event of stored.events) for (const coverage of event.files ?? []) delete coverage.declarations;
		await fs.writeFile(join(directory, "events.ndjson"), stored.events.map((event) => JSON.stringify(event)).join("\n") + "\n");
		const legacy = await restarted.getFiles(purl, shas[1]!);
		expect(legacy.files.find((entry) => entry.path === "a.ts")!.coverage).toEqual({
			file: "a.ts", verified: 1, unresolved: 1, unsupported: 0, error: 0,
		});
	});

	test("resets only the selected timeline, preserves source changes and restarts from the epoch", async () => {
		const { repo, shas, run } = await makeRepo("reset-repo");
		const timeline = service("reset", repo);
		const other = "pkg:github/test/other";
		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		await timeline.extend(other, { maxCommits: 1, maxMinutes: 1 });
		await timeline.wait(other);
		const otherBefore = await timeline.get(other);
		await fs.writeFile(join(repo, "a.ts"), "user edits");
		await fs.writeFile(join(repo, "untracked.txt"), "user notes");
		const before = await run("status", "--porcelain");
		// Even incompatible older timelines can be reset without extending them.
		const store = join(root, "reset");
		for (const dir of await fs.readdir(store)) {
			const path = join(store, dir, "timeline.json");
			const meta = JSON.parse(await fs.readFile(path, "utf8"));
			if (meta.purl === purl) {
				meta.analyzerVersion = "construct-timeline-v1";
				await fs.writeFile(path, JSON.stringify(meta));
			}
		}
		await timeline.reset(purl);
		expect(await timeline.get(purl)).toBeUndefined();
		expect(await fs.readdir(store)).toHaveLength(1);
		expect(await timeline.get(other)).toEqual(otherBefore);
		expect(await fs.readFile(join(repo, "a.ts"), "utf8")).toBe("user edits");
		expect(await fs.readFile(join(repo, "untracked.txt"), "utf8")).toBe("user notes");
		expect(await run("status", "--porcelain")).toBe(before);
		expect(await run("rev-parse", "HEAD")).toBe(shas.at(-1)!);
		await timeline.reset(purl); // Already absent is safe.
		await expect(timeline.reset("../../")).rejects.toThrow("repository-backed");
		await timeline.extend(purl, { maxCommits: 1, maxMinutes: 1 });
		await timeline.wait(purl);
		const restarted = (await timeline.get(purl))!;
		expect(restarted.meta.analyzerVersion).toBe("construct-timeline-v2");
		expect(restarted.events.map((event) => event.sha)).toEqual([shas[0]!]);
		expect(restarted.meta.cursor?.sha).toBe(shas[0]!);
	});

	test("refuses reset while extending without a time limit and permits it after cancellation", async () => {
		const { repo } = await makeRepo("reset-active-repo");
		let entered!: () => void;
		let release!: () => void;
		const extracting = new Promise<void>((resolve) => { entered = resolve; });
		const gate = new Promise<void>((resolve) => { release = resolve; });
		const timeline = new ConstructTimelineService({
			storeRoot: join(root, "reset-active"), resolveRepo: () => repo,
			extract: async (options) => { entered(); await gate; return extract(options); },
		});
		const starting = timeline.extend(purl, { maxCommits: 10 });
		await expect(timeline.reset(purl)).rejects.toThrow("busy");
		await starting;
		await extracting;
		try {
			await expect(timeline.reset(purl)).rejects.toThrow("busy");
			expect((await timeline.get(purl))!.meta.processing).toBeDefined();
			timeline.cancel(purl);
			expect((await timeline.get(purl))!.meta.processing).toBeUndefined();
			await expect(timeline.reset(purl)).rejects.toThrow("busy");
		} finally {
			release();
			await timeline.wait(purl);
		}
		await timeline.reset(purl);
		expect(await timeline.get(purl)).toBeUndefined();
	});

	test("serializes reset against a new extension and repeated resets", async () => {
		const { repo } = await makeRepo("reset-lock-repo", [{ "a.ts": f(1) }]);
		const timeline = service("reset-lock", repo);
		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		const resetting = timeline.reset(purl);
		await expect(timeline.extend(purl)).rejects.toThrow("busy");
		await expect(timeline.reset(purl)).rejects.toThrow("busy");
		await resetting;
		expect(await timeline.get(purl)).toBeUndefined();
	});

	test("includes symlink and submodule entries without pretending their targets were analyzed", async () => {
		const { repo, shas, run } = await makeRepo("tree-kinds-repo", [{ "a.ts": f(1) }]);
		await fs.symlink("a.ts", join(repo, "alias"));
		await run("add", "alias");
		await run("update-index", "--add", "--cacheinfo", `160000,${shas[0]},vendor/library`);
		await run("commit", "-m", "Link and submodule");
		const sha = await run("rev-parse", "HEAD");
		const timeline = service("tree-kinds", repo);
		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		const snapshot = await timeline.getFiles(purl, sha);
		expect(snapshot.files.find((file) => file.path === "alias")).toMatchObject({ kind: "symlink", status: "uncovered" });
		expect(snapshot.files.find((file) => file.path === "vendor/library")).toMatchObject({ kind: "submodule", status: "uncovered", size: 0 });
	});

	test("records a confirmed empty epoch and resumes into source-bearing commits", async () => {
		const { repo, shas } = await makeRepo("empty-epoch-repo", [{ "flake.nix": "{}" }, { "a.ts": f(1) }]);
		const timeline = new ConstructTimelineService({
			storeRoot: join(root, "empty-epoch"), resolveRepo: () => repo,
			extract: async (options) => {
				expect(options.allowEmptyCode).toBe(true);
				const result = await extract(options);
				return result.nodeCount ? result : { ...result, emptyCode: { unclassifiedFiles: 1, sensitiveFiles: 0 } };
			},
		});
		await timeline.extend(purl, { maxCommits: 1, maxMinutes: 1 });
		await timeline.wait(purl);
		const first = (await timeline.get(purl))!;
		expect(first.meta.status).toBe("idle");
		expect(first.meta.cursor?.sha).toBe(shas[0]);
		expect(first.events[0]).toMatchObject({
			constructs: 0, introduced: [], removed: [], changed: [],
			coverage: { verified: 0, unresolved: 0, unsupported: 0, error: 0 },
			extraction: { status: "no-supported-code", unclassifiedFiles: 1, sensitiveFiles: 0 },
		});
		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		const second = (await timeline.get(purl))!;
		expect(second.meta.status).toBe("idle");
		expect(second.events).toHaveLength(2);
		expect(second.events[1]!.introduced[0]).toMatchObject({ symbol: "f", after: { sha: shas[1] } });
		expect(second.events[1]!.extraction).toBeUndefined();
	});

	test("preserves the cursor and reports the failing commit and CLI cause", async () => {
		const { repo, shas } = await makeRepo("cli-failure-repo");
		let calls = 0;
		const timeline = new ConstructTimelineService({
			storeRoot: join(root, "cli-failure"), resolveRepo: () => repo,
			extract: async (options) => ++calls === 1 ? extract(options) : {
				ok: false, error: "graphify extract exited 1", exitCode: 1,
				stderr: "ModuleNotFoundError: No module named 'tree_sitter_zig'", durationMs: 1,
			},
		});
		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		const stored = (await timeline.get(purl))!;
		expect(stored.meta.status).toBe("failed");
		expect(stored.meta.cursor?.sha).toBe(shas[0]);
		expect(stored.events).toHaveLength(1);
		expect(stored.meta.error).toContain("tree_sitter_zig");
		expect(stored.meta.error).toContain(shas[1]!.slice(0, 12));
		expect(stored.meta.error).toContain("No partial commit was recorded");
	});

	test("parses the first-parent log and diffs verified identities", () => {
		const log = [
			`${"b".repeat(40)}\x002026-10-16T12:00:00Z\x00Newest\x00${"a".repeat(40)}`,
			`${"a".repeat(40)}\x002026-10-15T12:00:00Z\x00Oldest\x00`,
		].join("\n");
		expect(parseTimelineLog(log)).toEqual([
			{ sha: "b".repeat(40), committedAt: "2026-10-16T12:00:00Z", subject: "Newest" },
			{ sha: "a".repeat(40), committedAt: "2026-10-15T12:00:00Z", subject: "Oldest" },
		]);
		const entry = (file: string, symbol: string, contentHash: string, startLine = 1) => ({
			file, symbol, construct: "function", span: { startLine, endLine: startLine + 2, contentHash },
		});
		const older = new Map([
			["a.ts\0f", entry("a.ts", "f", "1")],
			["b.ts\0g", entry("b.ts", "g", "1")],
			["d.ts\0i", entry("d.ts", "i", "1")],
			["e.ts\0j", entry("e.ts", "j", "1")],
		]);
		const newer = new Map([
			["a.ts\0f", entry("a.ts", "f", "2", 2)],
			["c.ts\0h", entry("c.ts", "h", "1")],
			["d.ts\0i", entry("d.ts", "i", "1", 4)],
			["e.ts\0j", entry("e.ts", "j", "1")],
		]);
		const before = (key: string) => ({ sha: "old", span: older.get(key)!.span });
		const after = (key: string) => ({ sha: "new", span: newer.get(key)!.span });
		expect(diffTimelineIdentities(older, newer, { before: "old", after: "new" })).toEqual({
			introduced: [{ file: "c.ts", symbol: "h", construct: "function", after: after("c.ts\0h") }],
			removed: [{ file: "b.ts", symbol: "g", construct: "function", before: before("b.ts\0g") }],
			changed: [{ file: "a.ts", symbol: "f", construct: "function", before: before("a.ts\0f"), after: after("a.ts\0f") }],
			relocated: [{ file: "d.ts", symbol: "i", construct: "function", before: before("d.ts\0i"), after: after("d.ts\0i") }],
		});
		expect(() => diffTimelineIdentities(older, newer, { after: "new" })).toThrow("Previous commit SHA");
	});

	test("persists line-only shifts and resumes with spans after a service restart", async () => {
		const { repo, shas } = await makeRepo("span-repo", [
			{ "a.ts": f(1) }, { "a.ts": "\n\n" + f(1) }, {}, { "a.ts": null },
		]);
		const timeline = service("spans", repo);
		await timeline.extend(purl, { maxCommits: 1, maxMinutes: 1 });
		await timeline.wait(purl);
		const directory = join(root, "spans", (await fs.readdir(join(root, "spans")))[0]!);
		const checkpoint = JSON.parse(await fs.readFile(join(directory, "identities.json"), "utf8"));
		expect(checkpoint.sha).toBe(shas[0]);
		expect(checkpoint.entries[0]).toEqual([
			"a.ts\0f", "a.ts", "f", "function", expect.any(String), 1, 3,
		]);
		const fresh = service("spans", repo);
		await fresh.extend(purl, { maxMinutes: 1 });
		await fresh.wait(purl);
		const stored = (await fresh.get(purl))!;
		expect(stored.meta.status).toBe("idle");
		expect(stored.events[1]!.changed).toEqual([]);
		expect(stored.events[1]!.relocated).toEqual([{
			file: "a.ts", symbol: "f", construct: "function",
			before: { sha: shas[0], span: { startLine: 1, endLine: 3, contentHash: checkpoint.entries[0][4] } },
			after: { sha: shas[1], span: { startLine: 3, endLine: 5, contentHash: checkpoint.entries[0][4] } },
		}]);
		expect(stored.events[2]!.relocated).toEqual([]);
		expect(stored.events[3]!.removed[0]!.before).toEqual({
			sha: shas[2], span: { startLine: 3, endLine: 5, contentHash: checkpoint.entries[0][4] },
		});
		expect(summarizeConstructTimeline(stored.events)).toMatchObject({ introduced: 1, changed: 0, removed: 1 });
	});

	test("keeps legacy spanless timelines readable without appending incompatible events", async () => {
		const { repo } = await makeRepo("legacy-repo");
		const timeline = service("legacy", repo);
		await timeline.extend(purl, { maxCommits: 1, maxMinutes: 1 });
		await timeline.wait(purl);
		const directory = join(root, "legacy", (await fs.readdir(join(root, "legacy")))[0]!);
		const metaPath = join(directory, "timeline.json");
		const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
		const legacyMeta = JSON.stringify({ ...meta, analyzerVersion: "construct-timeline-v1" });
		await fs.writeFile(metaPath, legacyMeta);
		const eventsPath = join(directory, "events.ndjson");
		const event = JSON.parse((await fs.readFile(eventsPath, "utf8")).trim());
		delete event.relocated;
		delete event.introduced[0].after;
		const legacyEvents = JSON.stringify(event) + "\n";
		await fs.writeFile(eventsPath, legacyEvents);
		const fresh = service("legacy", repo);
		expect((await fresh.get(purl))!.events[0]!.introduced[0]!.after).toBeUndefined();
		await expect(fresh.extend(purl)).rejects.toThrow("incompatible analyzer");
		expect(await fs.readFile(metaPath, "utf8")).toBe(legacyMeta);
		expect(await fs.readFile(eventsPath, "utf8")).toBe(legacyEvents);
	});

	test("does not fabricate introductions when the persisted span baseline is invalid", async () => {
		const { repo } = await makeRepo("invalid-spans-repo");
		const timeline = service("invalid-spans", repo);
		await timeline.extend(purl, { maxCommits: 1, maxMinutes: 1 });
		await timeline.wait(purl);
		const directory = join(root, "invalid-spans", (await fs.readdir(join(root, "invalid-spans")))[0]!);
		const path = join(directory, "identities.json");
		const valid = JSON.parse(await fs.readFile(path, "utf8"));
		for (const checkpoint of [
			{ ...valid, entries: valid.entries.map((row: unknown[]) => row.slice(0, 5)) },
			{ ...valid, entries: valid.entries.map((row: unknown[]) => [...row.slice(0, 5), 0, 3]) },
			{ ...valid, entries: [] },
			{ ...valid, sha: "wrong-commit" },
		]) {
			await fs.writeFile(path, JSON.stringify(checkpoint));
			await timeline.extend(purl, { maxMinutes: 1 });
			await timeline.wait(purl);
			const stored = (await timeline.get(purl))!;
			expect(stored.meta.status).toBe("failed");
			expect(stored.meta.error).toContain("source-span baseline");
			expect(stored.events).toHaveLength(1);
		}
	});

	test("closes lifetimes and reports medians over the stored events", () => {
		const events = [
			{ sha: "1", committedAt: "2026-01-01T00:00:00Z", introduced: [{ file: "a.ts", symbol: "f" }], removed: [], changed: [] },
			{ sha: "2", committedAt: "2026-01-03T00:00:00Z", introduced: [{ file: "b.ts", symbol: "g" }], removed: [{ file: "a.ts", symbol: "f" }], changed: [] },
			{ sha: "3", committedAt: "2026-01-05T00:00:00Z", introduced: [], removed: [{ file: "b.ts", symbol: "g" }], changed: [] },
		].map((event) => ({
			...event, subject: "", constructs: 1, coverage: { verified: 1, unresolved: 0, unsupported: 0, error: 0 },
			timing: { checkoutMs: 0, extractMs: 0, matchMs: 0, totalMs: 0 },
		}));
		const summary = summarizeConstructTimeline(events);
		expect(summary).toMatchObject({ introduced: 2, removed: 2, changed: 0, medianLifetimeCommits: 1 });
		expect(summary.lifetimes.map((lifetime) => lifetime.symbol)).toEqual(["f", "g"]);
		expect(summary.lifetimes[0]).toMatchObject({ introducedCommit: "1", removedCommit: "2", commits: 1 });
		expect(summary.medianLifetimeMs).toBe(2 * 24 * 60 * 60 * 1000);
	});
});
