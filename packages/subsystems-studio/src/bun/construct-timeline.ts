/**
 * Cumulative, repo-level construct timeline.
 *
 * Forward walk from an epoch with a durable cursor: each call processes the
 * oldest not-yet-analyzed commits after the cursor and appends one compact event
 * per commit (transition lists + verified count + coverage). Extending never
 * re-checks-out or re-extracts a commit that is already in the timeline, so the
 * beginning is analyzed once. Full per-commit inventories are not stored;
 * transitions retain before/after source spans and their commit SHAs.
 *
 * The private clone and the timeline files live under
 * `~/.principal/construct-timeline/<repo-key-hash>/`.
 */

import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { GraphifyNode } from "../../../subsystems-react/src/graphify/types";
import {
	CONSTRUCT_TIMELINE_ANALYZER, CONSTRUCT_TIMELINE_MAX_COMMITS, selectTimelineExtensionCommits,
	type ConstructTimeline, type ConstructTimelineEvent, type ConstructTimelineIdentity,
	type ConstructTimelineMeta, type ConstructTimelineOptions, type ConstructTimelineSpan,
	type ConstructTimelineFileSnapshot, type ConstructTimelineCommit, timelineFileCoverage, timelineFileStatus,
} from "../shared/construct-timeline";
import { verifyGraphConstructs } from "./graph-constructs";
import { resolveRepoRootForPurl } from "./graphify-store";
import { graphifyFailureReason, resolveGraphifyBin, runGraphifyExtract, type RunGraphifyExtractOptions, type GraphifyExtractOutcome } from "./graphify-runner";
import { isRepoPurl, purlRepoKey } from "./subsystem-model-store";

const ROOT = join(homedir(), ".principal", "construct-timeline");

interface IdentityEntry { file: string; symbol: string; construct?: string; span: ConstructTimelineSpan }
type IdentityMap = Map<string, IdentityEntry>;
interface CommitEntry { sha: string; committedAt: string; subject: string }

export interface ConstructTimelineDependencies {
	storeRoot?: string;
	resolveRepo?: (purl: string) => string | null;
	extract?: (opts: RunGraphifyExtractOptions) => Promise<GraphifyExtractOutcome>;
	bin?: string;
}

interface ActiveTimeline {
	controller: AbortController;
	done: Promise<void>;
	reason?: "cancelled" | "budget-exceeded" | "failed";
	processing?: ConstructTimelineMeta["processing"];
}

function directory(root: string, purl: string): string {
	return join(root, createHash("sha256").update(purl).digest("hex").slice(0, 32));
}

function validateOptions(options: ConstructTimelineOptions): void {
	const commits = options.maxCommits;
	if (commits !== undefined && (!Number.isInteger(commits) || commits < 1 || commits > CONSTRUCT_TIMELINE_MAX_COMMITS)) {
		throw new Error(`Choose 1–${CONSTRUCT_TIMELINE_MAX_COMMITS} commits per extension.`);
	}
	const minutes = options.maxMinutes;
	if (minutes !== undefined && (!Number.isFinite(minutes) || minutes < 0.1 || minutes > 120)) {
		throw new Error("Choose a time budget between 0.1 and 120 minutes.");
	}
	if (options.historyPeriod !== undefined && !["day", "week", "month"].includes(options.historyPeriod)) {
		throw new Error("Choose a day, week or month of commit history.");
	}
}

/** Parse `%H\0%cI\0%s\0%P` first-parent log output, newest first. */
export function parseTimelineLog(log: string): CommitEntry[] {
	return log.trim().split("\n").filter(Boolean).map((line) => {
		const [sha, committedAt, subject] = line.split("\0");
		return { sha: sha!, committedAt: committedAt!, subject: subject ?? "" };
	});
}

async function readTimelineTree(root: string, sha: string) {
	const listing = await git(["-C", root, "ls-tree", "-r", "-l", "-z", sha, "--"]);
	return listing.split("\0").filter(Boolean).map((entry) => {
		const separator = entry.indexOf("\t");
		if (separator < 0) throw new Error("Could not read the historical file tree.");
		const [mode, , , bytes] = entry.slice(0, separator).trim().split(/\s+/);
		const kind = mode === "160000" ? "submodule" : mode === "120000" ? "symlink" : "file";
		return { path: entry.slice(separator + 1), size: bytes === "-" ? 0 : Number(bytes),
			kind: kind as ConstructTimelineFileSnapshot["files"][number]["kind"] };
	});
}

/** Keep commit-qualified source evidence, including location-only shifts. */
export function diffTimelineIdentities(
	older: ReadonlyMap<string, IdentityEntry>,
	newer: ReadonlyMap<string, IdentityEntry>,
	commits: { before?: string; after: string },
): { introduced: ConstructTimelineIdentity[]; removed: ConstructTimelineIdentity[]; changed: ConstructTimelineIdentity[]; relocated: ConstructTimelineIdentity[] } {
	const introduced: ConstructTimelineIdentity[] = [];
	const removed: ConstructTimelineIdentity[] = [];
	const changed: ConstructTimelineIdentity[] = [];
	const relocated: ConstructTimelineIdentity[] = [];
	if (older.size && !commits.before) throw new Error("Previous commit SHA is required for source evidence.");
	const identity = (entry: IdentityEntry): ConstructTimelineIdentity => ({
		file: entry.file, symbol: entry.symbol, construct: entry.construct,
	});
	for (const [key, entry] of newer) {
		const previous = older.get(key);
		const after = { sha: commits.after, span: { ...entry.span } };
		if (!previous) introduced.push({ ...identity(entry), after });
		else {
			const transition = { ...identity(entry), before: { sha: commits.before!, span: { ...previous.span } }, after };
			if (previous.span.contentHash !== entry.span.contentHash) changed.push(transition);
			else if (previous.span.startLine !== entry.span.startLine || previous.span.endLine !== entry.span.endLine) relocated.push(transition);
		}
	}
	for (const [key, entry] of older) {
		if (!newer.has(key)) removed.push({ ...identity(entry), before: { sha: commits.before!, span: { ...entry.span } } });
	}
	const sort = (a: ConstructTimelineIdentity, b: ConstructTimelineIdentity) =>
		a.file.localeCompare(b.file) || a.symbol.localeCompare(b.symbol);
	return { introduced: introduced.sort(sort), removed: removed.sort(sort), changed: changed.sort(sort), relocated: relocated.sort(sort) };
}

/** Local-only Git with ambient overrides stripped; kills the process group on abort. */
async function git(args: string[], signal?: AbortSignal): Promise<string> {
	signal?.throwIfAborted();
	const proc = Bun.spawn({
		cmd: ["git", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", ...args],
		env: {
			...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
			GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GIT_LFS_SKIP_SMUDGE: "1",
		},
		stdio: ["ignore", "pipe", "pipe"],
		detached: true,
	});
	const abort = () => { try { process.kill(-proc.pid, "SIGKILL"); } catch { /* exited */ } };
	signal?.addEventListener("abort", abort, { once: true });
	if (signal?.aborted) abort();
	try {
		const [out] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
		const code = await proc.exited;
		signal?.throwIfAborted();
		if (code !== 0) throw new Error("Local timeline command failed.");
		return out;
	} finally {
		signal?.removeEventListener("abort", abort);
	}
}

export class ConstructTimelineService {
	private active = new Map<string, ActiveTimeline>();
	private mutations = new Set<string>();
	private root: string;

	constructor(private dependencies: ConstructTimelineDependencies = {}) {
		this.root = dependencies.storeRoot ?? ROOT;
	}

	private key(purl: string): string {
		const key = purlRepoKey(purl.trim());
		if (!key || !isRepoPurl(key)) throw new Error("Choose a repository-backed PURL.");
		return key;
	}

	private paths(purl: string) {
		const dir = directory(this.root, purl);
		return {
			dir,
			meta: join(dir, "timeline.json"),
			events: join(dir, "events.ndjson"),
			identities: join(dir, "identities.json"),
			clone: join(dir, "repository"),
			output: join(dir, "extract"),
		};
	}

	private async fileBytes(path: string): Promise<number> {
		try { return (await fs.stat(path)).size; } catch { return 0; }
	}

	private async saveMeta(meta: ConstructTimelineMeta): Promise<void> {
		meta.updatedAt = new Date().toISOString();
		const paths = this.paths(meta.purl);
		await fs.mkdir(paths.dir, { recursive: true, mode: 0o700 });
		meta.retainedBytes = (await this.fileBytes(paths.events)) + (await this.fileBytes(paths.identities));
		const temp = `${paths.meta}.${randomUUID()}.tmp`;
		await fs.writeFile(temp, JSON.stringify(meta), { mode: 0o600 });
		await fs.rename(temp, paths.meta);
		meta.retainedBytes += await this.fileBytes(paths.meta);
	}

	private async loadIdentities(purl: string): Promise<{ sha: string; identities: IdentityMap } | undefined> {
		try {
			const raw = JSON.parse(await fs.readFile(this.paths(purl).identities, "utf8")) as { sha?: string; entries?: unknown };
			if (typeof raw.sha !== "string" || !Array.isArray(raw.entries)) return undefined;
			const identities: IdentityMap = new Map();
			for (const row of raw.entries) {
				if (!Array.isArray(row) || row.length !== 7) return undefined;
				const [key, file, symbol, construct, contentHash, startLine, endLine] = row;
				if (![key, file, symbol, construct, contentHash].every((value) => typeof value === "string")
					|| key !== `${file}\0${symbol}` || !contentHash
					|| !Number.isInteger(startLine) || !Number.isInteger(endLine)
					|| startLine < 1 || endLine < startLine || identities.has(key)) return undefined;
				identities.set(key, { file, symbol, construct: construct || undefined, span: { contentHash, startLine, endLine } });
			}
			return { sha: raw.sha, identities };
		} catch {
			return undefined;
		}
	}

	private async saveIdentities(purl: string, sha: string, identities: IdentityMap): Promise<void> {
		const entries = [...identities.entries()].map(([key, entry]) => [
			key, entry.file, entry.symbol, entry.construct ?? "", entry.span.contentHash, entry.span.startLine, entry.span.endLine,
		]);
		await fs.writeFile(this.paths(purl).identities, JSON.stringify({ sha, entries }), { mode: 0o600 });
	}

	async get(purl: string): Promise<ConstructTimeline | undefined> {
		const key = this.key(purl);
		const paths = this.paths(key);
		let meta: ConstructTimelineMeta;
		try {
			meta = JSON.parse(await fs.readFile(paths.meta, "utf8")) as ConstructTimelineMeta;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
			throw error;
		}
		if (meta.version !== 1 || meta.purl !== key) throw new Error("Unsupported timeline checkpoint.");
		if (meta.status === "running" && !this.active.has(key)) {
			meta.status = "interrupted";
			meta.error = "Interrupted. Extend the timeline to continue from the cursor.";
		}
		const events: ConstructTimelineEvent[] = [];
		try {
			const text = await fs.readFile(paths.events, "utf8");
			for (const line of text.split("\n")) {
				if (!line) continue;
				try { events.push(JSON.parse(line) as ConstructTimelineEvent); } catch { /* skip a torn tail */ }
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		const active = this.active.get(key);
		if (meta.status === "running" && active?.processing && !active.controller.signal.aborted) {
			meta.processing = { ...active.processing };
		} else delete meta.processing;
		return { meta, events };
	}

	/** Read Git objects directly; never checkout or extract for a UI request. */
	private historyRepository(key: string) {
		const source = (this.dependencies.resolveRepo ?? resolveRepoRootForPurl)(key);
		return source ? { root: source, tip: "HEAD" } : { root: this.paths(key).clone, tip: "FETCH_HEAD" };
	}

	async getHistory(purl: string): Promise<ConstructTimelineCommit[]> {
		const key = this.key(purl);
		const { root, tip } = this.historyRepository(key);
		return parseTimelineLog(await git(["-C", root, "log", "--first-parent", "--format=%H%x00%cI%x00%s", tip, "--"]));
	}

	/** Recorded coverage or an explicitly unverified preview of a reachable Git tree. */
	async getFiles(purl: string, sha: string): Promise<ConstructTimelineFileSnapshot> {
		const key = this.key(purl);
		if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha)) throw new Error("Choose a full commit SHA.");
		const stored = await this.get(key);
		const event = stored?.events.find((entry) => entry.sha === sha);
		if (!event && !(await this.getHistory(key)).some((commit) => commit.sha === sha)) {
			throw new Error("This commit is not in this repository's first-parent history.");
		}
		const coverage = new Map((event?.files ?? []).map((file) => [file.file, file]));
		let root = event ? this.paths(key).clone : this.historyRepository(key).root;
		let tree: Awaited<ReturnType<typeof readTimelineTree>>;
		if (event) {
			try { tree = await readTimelineTree(root, sha); }
			catch { root = this.historyRepository(key).root; tree = await readTimelineTree(root, sha); }
		} else {
			tree = await readTimelineTree(root, sha);
		}
		const files = tree.map(({ path, size, kind }) => {
			const evidence = coverage.get(path);
			return { path, size, kind,
				status: event ? timelineFileStatus(evidence, path, kind) : "uncovered" as const,
				...(evidence ? { coverage: evidence } : {}) };
		});
		// Raw headers retain the real parent even at a shallow-history boundary.
		const details = await git(["-C", root, "cat-file", "commit", sha]);
		const separator = details.indexOf("\n\n");
		const parent = details.slice(0, separator).match(/^parent ([a-f0-9]+)$/m)?.[1];
		const message = details.slice(separator + 2).trimEnd();
		let changes: ConstructTimelineFileSnapshot["changes"];
		try {
			const diff = await git(["-C", root, "diff-tree", "--no-commit-id", "--name-status", "-r", "-z",
				"--no-renames", "--no-ext-diff", "--no-textconv", ...(parent ? [parent, sha] : ["--root", sha]), "--"]);
			const fields = diff.split("\0");
			changes = [];
			for (let index = 0; index < fields.length - 1; index += 2) {
				const status = fields[index];
				if (!["A", "M", "D", "T"].includes(status!)) throw new Error("Unknown file change.");
				changes.push({ path: fields[index + 1]!, status: status === "A" ? "added" : status === "D" ? "removed" : "modified" });
			}
			if (parent && changes.some((change) => change.status === "removed")) {
				const before = new Map((await readTimelineTree(root, parent)).map((file) => [file.path, file]));
				for (const change of changes) {
					if (change.status !== "removed") continue;
					const file = before.get(change.path);
					if (!file) throw new Error("Deleted file metadata unavailable.");
					change.before = { size: file.size, kind: file.kind };
				}
			}
		} catch {
			// A shallow/missing parent must not prevent reading the commit's tree.
			changes = undefined;
		}
		return { sha, files, message, changes, analyzed: !!event, coverageAvailable: event?.files !== undefined, extraction: event?.extraction };
	}

	async extend(purl: string, options: ConstructTimelineOptions = {}): Promise<ConstructTimelineMeta> {
		const key = this.key(purl);
		validateOptions(options);
		if (this.active.has(key) || this.mutations.has(key)) throw new Error("The timeline is already busy.");
		this.mutations.add(key);
		try {
			return await this.startExtension(key, options);
		} finally {
			this.mutations.delete(key);
		}
	}

	private async startExtension(key: string, options: ConstructTimelineOptions): Promise<ConstructTimelineMeta> {
		const source = (this.dependencies.resolveRepo ?? resolveRepoRootForPurl)(key);
		if (!source) throw new Error("No local checkout is registered for this repository.");
		if (!this.dependencies.extract && !resolveGraphifyBin(this.dependencies.bin)) {
			throw new Error("Install Graphify before extending the timeline.");
		}
		const meta = await this.loadOrCreateMeta(key);
		if (meta.analyzerVersion !== CONSTRUCT_TIMELINE_ANALYZER) {
			throw new Error("This timeline uses an incompatible analyzer (older events may lack source spans). It remains readable; a new timeline store is required to analyze spans from the epoch. Existing data was not changed.");
		}
		meta.status = "running";
		meta.error = undefined;
		await this.saveMeta(meta);
		const active: ActiveTimeline = { controller: new AbortController(), done: Promise.resolve() };
		this.active.set(key, active);
		active.done = this.execute(meta, source, options, active).finally(() => this.active.delete(key));
		return meta;
	}

	/** Explicitly discard only this repository's managed analysis, never its source. */
	async reset(purl: string): Promise<void> {
		const key = this.key(purl);
		if (this.active.has(key) || this.mutations.has(key)) {
			throw new Error("The timeline is busy. Cancel the extension and wait for it to stop before resetting.");
		}
		this.mutations.add(key);
		try {
			await fs.rm(this.paths(key).dir, { recursive: true, force: true });
		} finally {
			this.mutations.delete(key);
		}
	}

	cancel(purl: string): void {
		const active = this.active.get(this.key(purl));
		if (!active || active.controller.signal.aborted) return;
		active.reason = "cancelled";
		active.controller.abort();
	}

	async wait(purl: string): Promise<void> {
		await this.active.get(this.key(purl))?.done;
	}

	private async loadOrCreateMeta(purl: string): Promise<ConstructTimelineMeta> {
		const existing = await this.get(purl);
		if (existing) return existing.meta;
		return {
			version: 1, analyzerVersion: CONSTRUCT_TIMELINE_ANALYZER, purl,
			status: "idle", updatedAt: new Date().toISOString(),
			events: 0, constructs: 0, elapsedMs: 0, retainedBytes: 0,
		};
	}

	private async execute(
		meta: ConstructTimelineMeta,
		source: string,
		options: ConstructTimelineOptions,
		active: ActiveTimeline,
	): Promise<void> {
		const { controller } = active;
		const signal = controller.signal;
		const paths = this.paths(meta.purl);
		const started = performance.now();
		const previousElapsed = meta.elapsedMs;
		const maxMinutes = options.maxMinutes;
		const timeBudget = maxMinutes === undefined ? undefined : setTimeout(() => {
			active.reason = "budget-exceeded";
			meta.error = `Time budget reached (${maxMinutes.toFixed(1)} min). Extend again to continue from the cursor.`;
			controller.abort();
		}, maxMinutes * 60_000);
		try {
			await fs.mkdir(paths.dir, { recursive: true, mode: 0o700 });
			let validClone = false;
			try { validClone = (await git(["-C", paths.clone, "rev-parse", "--is-inside-work-tree"], signal)).trim() === "true"; } catch { signal.throwIfAborted(); }
			if (!validClone) {
				await fs.rm(paths.clone, { recursive: true, force: true });
				await git(["clone", "--no-hardlinks", "--no-checkout", "--", source, paths.clone], signal);
			}
			await git(["-C", paths.clone, "config", "core.symlinks", "false"], signal);
			await git(["-C", paths.clone, "fetch", "--no-tags", "--", source, "HEAD"], signal);
			const tip = (await git(["-C", source, "rev-parse", "--verify", "--end-of-options", "HEAD^{commit}"], signal)).trim();
			const log = await git(["-C", paths.clone, "log", "--first-parent", "--format=%H%x00%cI%x00%s%x00%P", tip, "--"], signal);
			const all = parseTimelineLog(log);
			if (!all.length) throw new Error("No commits to analyze.");

			let baseline: IdentityMap = new Map();
			let selected: CommitEntry[];
			if (meta.cursor) {
				const index = all.findIndex((commit) => commit.sha === meta.cursor!.sha);
				if (index < 0) throw new Error("History was rewritten since the last extension. Start a new timeline.");
				// all is newest-first; newer-than-cursor entries are before it.
				selected = all.slice(0, index).reverse();
			} else {
				// First extension: the oldest commits, so the timeline starts at the epoch.
				selected = all.slice().reverse();
			}
			if (meta.cursor) {
				const saved = await this.loadIdentities(meta.purl);
				if (!saved || saved.sha !== meta.cursor.sha || saved.identities.size !== meta.constructs) {
					throw new Error("Timeline source-span baseline is missing, invalid or does not match the cursor. No commits were appended.");
				}
				baseline = saved.identities;
			}
			const pending = selectTimelineExtensionCommits(selected, options);
			for (const commit of pending) {
				signal.throwIfAborted();
				active.processing = { sha: commit.sha, committedAt: commit.committedAt };
				const commitStart = performance.now();
				await git(["-C", paths.clone, "checkout", "--force", "--detach", commit.sha, "--"], signal);
				const checkoutMs = performance.now() - commitStart;
				await fs.rm(paths.output, { recursive: true, force: true });
				const extraction = await (this.dependencies.extract ?? runGraphifyExtract)({
					repoRoot: paths.clone, outDir: paths.output, codeOnly: true, bin: this.dependencies.bin, signal, isolatedOutput: true, allowEmptyCode: true,
				});
				signal.throwIfAborted();
				if (!extraction.ok) {
					throw new Error(`${graphifyFailureReason(extraction)} at commit ${commit.sha.slice(0, 12)}. No partial commit was recorded.`);
				}
				const matchStart = performance.now();
				const inventory = await verifyGraphConstructs({
					repoRoot: paths.clone, purl: meta.purl, nodes: extraction.graph.nodes as GraphifyNode[], signal,
				});
				const next: IdentityMap = new Map();
				for (const row of inventory.constructs) {
					if (row.verification.status !== "verified" || !row.span) continue;
					next.set(`${row.file}\0${row.symbol}`, {
						file: row.file, symbol: row.symbol, construct: row.construct, span: { ...row.span },
					});
				}
				const transitions = diffTimelineIdentities(baseline, next, { before: meta.cursor?.sha, after: commit.sha });
				const event: ConstructTimelineEvent = {
					sha: commit.sha, committedAt: commit.committedAt, subject: commit.subject,
					...transitions, constructs: next.size, coverage: inventory.coverage, files: timelineFileCoverage(inventory.constructs),
					...(extraction.emptyCode ? { extraction: { status: "no-supported-code" as const, ...extraction.emptyCode } } : {}),
					timing: { checkoutMs, extractMs: extraction.durationMs, matchMs: performance.now() - matchStart, totalMs: performance.now() - commitStart },
				};
				await fs.appendFile(paths.events, `${JSON.stringify(event)}\n`, { mode: 0o600 });
				baseline = next;
				await this.saveIdentities(meta.purl, commit.sha, baseline);
				meta.cursor = { sha: commit.sha, committedAt: commit.committedAt };
				meta.epoch ??= { sha: commit.sha, committedAt: commit.committedAt };
				meta.events += 1;
				meta.constructs = next.size;
				meta.elapsedMs = previousElapsed + (performance.now() - started);
				await this.saveMeta(meta);
				active.processing = undefined;
				await fs.rm(paths.output, { recursive: true, force: true });
			}
			meta.status = active.reason === "cancelled" ? "interrupted" : "idle";
			meta.error = active.reason === "cancelled" ? "Cancelled. Extend the timeline to continue from the cursor." : undefined;
		} catch (error) {
			meta.status = active.reason === "budget-exceeded" || active.reason === "cancelled" ? "interrupted" : "failed";
			if (active.reason !== "budget-exceeded" && active.reason !== "cancelled") {
				meta.error = error instanceof Error ? error.message : "Timeline extension failed.";
			}
		} finally {
			active.processing = undefined;
			if (timeBudget !== undefined) clearTimeout(timeBudget);
			meta.elapsedMs = previousElapsed + (performance.now() - started);
			try {
				await fs.rm(paths.output, { recursive: true, force: true });
				await this.saveMeta(meta);
			} catch {
				meta.status = "failed";
				meta.error = "Could not save the timeline checkpoint.";
			}
		}
	}
}

export const constructTimeline = new ConstructTimelineService();
