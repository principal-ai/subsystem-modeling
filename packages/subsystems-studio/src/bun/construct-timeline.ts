/**
 * Cumulative, repo-level construct timeline.
 *
 * Forward walk from an epoch with a durable cursor: each call processes the
 * oldest not-yet-analyzed commits after the cursor and appends one compact event
 * per commit (transition lists + verified count + coverage). Extending never
 * re-checks-out or re-extracts a commit that is already in the timeline, so the
 * beginning is analyzed once. Per-commit observations are not stored.
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
	CONSTRUCT_TIMELINE_ANALYZER, CONSTRUCT_TIMELINE_DEFAULT_COMMITS, CONSTRUCT_TIMELINE_MAX_COMMITS,
	type ConstructTimeline, type ConstructTimelineEvent, type ConstructTimelineIdentity,
	type ConstructTimelineMeta, type ConstructTimelineOptions,
} from "../shared/construct-timeline";
import { verifyGraphConstructs } from "./graph-constructs";
import { resolveRepoRootForPurl } from "./graphify-store";
import { resolveGraphifyBin, runGraphifyExtract, type RunGraphifyExtractOptions, type RunGraphifyExtractResult } from "./graphify-runner";
import { isRepoPurl, purlRepoKey } from "./subsystem-model-store";

const ROOT = join(homedir(), ".principal", "construct-timeline");

interface IdentityEntry { file: string; symbol: string; construct?: string; contentHash: string }
type IdentityMap = Map<string, IdentityEntry>;
interface CommitEntry { sha: string; committedAt: string; subject: string }

export interface ConstructTimelineDependencies {
	storeRoot?: string;
	resolveRepo?: (purl: string) => string | null;
	extract?: (opts: RunGraphifyExtractOptions) => Promise<RunGraphifyExtractResult>;
	bin?: string;
}

interface ActiveTimeline { controller: AbortController; done: Promise<void>; reason?: "cancelled" | "budget-exceeded" | "failed" }

function directory(root: string, purl: string): string {
	return join(root, createHash("sha256").update(purl).digest("hex").slice(0, 32));
}

function validateOptions(options: ConstructTimelineOptions): void {
	const commits = options.maxCommits ?? CONSTRUCT_TIMELINE_DEFAULT_COMMITS;
	if (!Number.isInteger(commits) || commits < 1 || commits > CONSTRUCT_TIMELINE_MAX_COMMITS) {
		throw new Error(`Choose 1–${CONSTRUCT_TIMELINE_MAX_COMMITS} commits per extension.`);
	}
	const minutes = options.maxMinutes ?? 10;
	if (!Number.isFinite(minutes) || minutes < 0.1 || minutes > 120) {
		throw new Error("Choose a time budget between 0.1 and 120 minutes.");
	}
}

/** Parse `%H\0%cI\0%s\0%P` first-parent log output, newest first. */
export function parseTimelineLog(log: string): CommitEntry[] {
	return log.trim().split("\n").filter(Boolean).map((line) => {
		const [sha, committedAt, subject] = line.split("\0");
		return { sha: sha!, committedAt: committedAt!, subject: subject ?? "" };
	});
}

/** Introduced / removed / changed between two verified-identity maps. */
export function diffTimelineIdentities(
	older: ReadonlyMap<string, IdentityEntry>,
	newer: ReadonlyMap<string, IdentityEntry>,
): { introduced: ConstructTimelineIdentity[]; removed: ConstructTimelineIdentity[]; changed: ConstructTimelineIdentity[] } {
	const introduced: ConstructTimelineIdentity[] = [];
	const removed: ConstructTimelineIdentity[] = [];
	const changed: ConstructTimelineIdentity[] = [];
	for (const [key, entry] of newer) {
		const previous = older.get(key);
		if (!previous) introduced.push({ file: entry.file, symbol: entry.symbol, construct: entry.construct });
		else if (previous.contentHash !== entry.contentHash) changed.push({ file: entry.file, symbol: entry.symbol, construct: entry.construct });
	}
	for (const [key, entry] of older) {
		if (!newer.has(key)) removed.push({ file: entry.file, symbol: entry.symbol, construct: entry.construct });
	}
	const sort = (a: ConstructTimelineIdentity, b: ConstructTimelineIdentity) =>
		a.file.localeCompare(b.file) || a.symbol.localeCompare(b.symbol);
	return { introduced: introduced.sort(sort), removed: removed.sort(sort), changed: changed.sort(sort) };
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
				if (!Array.isArray(row) || row.length < 5) continue;
				const [key, file, symbol, construct, contentHash] = row as string[];
				identities.set(key!, { file: file!, symbol: symbol!, construct: construct || undefined, contentHash: contentHash! });
			}
			return { sha: raw.sha, identities };
		} catch {
			return undefined;
		}
	}

	private async saveIdentities(purl: string, sha: string, identities: IdentityMap): Promise<void> {
		const entries = [...identities.entries()].map(([key, entry]) => [key, entry.file, entry.symbol, entry.construct ?? "", entry.contentHash]);
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
		return { meta, events };
	}

	async extend(purl: string, options: ConstructTimelineOptions = {}): Promise<ConstructTimelineMeta> {
		const key = this.key(purl);
		validateOptions(options);
		if (this.active.has(key)) throw new Error("The timeline is already extending.");
		const source = (this.dependencies.resolveRepo ?? resolveRepoRootForPurl)(key);
		if (!source) throw new Error("No local checkout is registered for this repository.");
		if (!this.dependencies.extract && !resolveGraphifyBin(this.dependencies.bin)) {
			throw new Error("Install Graphify before extending the timeline.");
		}
		const meta = await this.loadOrCreateMeta(key);
		meta.status = "running";
		meta.error = undefined;
		await this.saveMeta(meta);
		const active: ActiveTimeline = { controller: new AbortController(), done: Promise.resolve() };
		this.active.set(key, active);
		active.done = this.execute(meta, source, options, active).finally(() => this.active.delete(key));
		return meta;
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
		const maxCommits = options.maxCommits ?? CONSTRUCT_TIMELINE_DEFAULT_COMMITS;
		const maxMs = (options.maxMinutes ?? 10) * 60_000;
		const timeBudget = setTimeout(() => {
			active.reason = "budget-exceeded";
			meta.error = `Time budget reached (${(maxMs / 60_000).toFixed(1)} min). Extend again to continue from the cursor.`;
			controller.abort();
		}, maxMs);
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
				selected = all.slice(Math.max(0, all.length - maxCommits)).reverse();
			}
			if (meta.cursor) {
				const saved = await this.loadIdentities(meta.purl);
				if (saved && saved.sha === meta.cursor.sha) baseline = saved.identities;
			}
			const pending = selected.slice(0, maxCommits);
			for (const commit of pending) {
				signal.throwIfAborted();
				const commitStart = performance.now();
				await git(["-C", paths.clone, "checkout", "--force", "--detach", commit.sha, "--"], signal);
				const checkoutMs = performance.now() - commitStart;
				await fs.rm(paths.output, { recursive: true, force: true });
				const extraction = await (this.dependencies.extract ?? runGraphifyExtract)({
					repoRoot: paths.clone, outDir: paths.output, codeOnly: true, bin: this.dependencies.bin, signal, isolatedOutput: true,
				});
				signal.throwIfAborted();
				if (!extraction.ok) throw new Error("Graphify extraction failed. No partial commit was recorded.");
				const matchStart = performance.now();
				const inventory = await verifyGraphConstructs({
					repoRoot: paths.clone, purl: meta.purl, nodes: extraction.graph.nodes as GraphifyNode[], signal,
				});
				const next: IdentityMap = new Map();
				for (const row of inventory.constructs) {
					if (row.verification.status !== "verified" || !row.span) continue;
					next.set(`${row.file}\0${row.symbol}`, {
						file: row.file, symbol: row.symbol, construct: row.construct, contentHash: row.span.contentHash,
					});
				}
				const transitions = diffTimelineIdentities(baseline, next);
				const event: ConstructTimelineEvent = {
					sha: commit.sha, committedAt: commit.committedAt, subject: commit.subject,
					...transitions, constructs: next.size, coverage: inventory.coverage,
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
			clearTimeout(timeBudget);
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
