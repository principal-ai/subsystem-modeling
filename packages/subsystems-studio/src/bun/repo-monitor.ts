/**
 * Studio's handle on the shared repository monitoring daemon
 * (`@principal-ai/repository-monitoring-server`): one plain-Node process per
 * user that owns git-aware file trees, watchers and caches for every repo, and
 * that the Principal desktop app shares. "Connect if present, spawn if not" —
 * the client probes `~/.principal/repo-monitor.sock` and spawns the daemon
 * bundle staged next to this file when nothing answers.
 *
 * The daemon is the only source of file trees: there is no in-process walk to
 * fall back to, so a missing `node`, an unbuildable daemon or a protocol
 * mismatch surfaces as an error in the tab that asked. After a failure the
 * client backs off briefly so repeated readers fail fast with the same reason
 * instead of each waiting out a spawn attempt.
 */

import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
	RepoMonitorClient,
	type RepoMonitorDiagnostics,
} from "@principal-ai/repository-monitoring-server/client";

export type RepoFile = { path: string; size: number };

const LOG = "[principal-studio] repo-monitor:";
const RETRY_AFTER_FAILURE_MS = 10_000;

let client: RepoMonitorClient | null = null;
let unavailableUntil = 0;
let lastFailure: string | null = null;
/** Repos this process already registered; the client replays them on reconnect. */
const registered = new Set<string>();
const listeners = new Set<(status: RepoMonitorDiagnostics) => void>();

/** The daemon bundle: staged into app/bun by electrobun.config.ts, else from node_modules (tests, scripts). */
export function resolveDaemonEntryPath(): string | null {
	const staged = join(import.meta.dir, "repo-monitor-daemon.js");
	if (existsSync(staged)) return staged;
	try {
		const pkg = createRequire(import.meta.url).resolve(
			"@principal-ai/repository-monitoring-server/package.json",
		);
		const fromPackage = join(dirname(pkg), "dist", "daemon", "repository-monitoring-daemon.js");
		return existsSync(fromPackage) ? fromPackage : null;
	} catch {
		return null;
	}
}

/**
 * The `node` that runs the daemon. A packaged app launched from Finder gets a
 * minimal PATH, so after `REPO_MONITOR_NODE` and PATH we try the usual
 * installer locations.
 */
export function resolveNodeBinary(): string | null {
	const explicit = process.env["REPO_MONITOR_NODE"];
	if (explicit && existsSync(explicit)) return explicit;
	const onPath = Bun.which("node");
	if (onPath) return onPath;
	const home = homedir();
	const candidates = [
		"/opt/homebrew/bin/node",
		"/usr/local/bin/node",
		join(home, ".volta", "bin", "node"),
		join(home, ".local", "share", "fnm", "aliases", "default", "bin", "node"),
		join(home, ".asdf", "shims", "node"),
		...nvmNodes(home),
	];
	return candidates.find((p) => existsSync(p)) ?? null;
}

/** nvm installs, newest first. */
function nvmNodes(home: string): string[] {
	const dir = join(home, ".nvm", "versions", "node");
	let versions: string[];
	try {
		versions = readdirSync(dir);
	} catch {
		return [];
	}
	const semver = (v: string) => v.replace(/^v/, "").split(".").map((n) => Number(n) || 0);
	return versions
		.sort((a, b) => {
			const [x, y] = [semver(a), semver(b)];
			for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
			return 0;
		})
		.map((v) => join(dir, v, "bin", "node"));
}

function markUnavailable(reason: string): void {
	unavailableUntil = Date.now() + RETRY_AFTER_FAILURE_MS;
	if (reason !== lastFailure) console.error(`${LOG} unavailable: ${reason}`);
	lastFailure = reason;
}

function getClient(): RepoMonitorClient | null {
	if (client) return client;
	const daemonEntryPath = resolveDaemonEntryPath();
	if (!daemonEntryPath) {
		markUnavailable("daemon bundle not found (rebuild Studio)");
		return null;
	}
	const nodeBinary = resolveNodeBinary();
	if (!nodeBinary) {
		markUnavailable("no `node` binary found (set REPO_MONITOR_NODE)");
		return null;
	}
	client = new RepoMonitorClient({
		spawnedBy: "studio",
		daemonEntryPath,
		nodeBinary,
		log: (level, message) => {
			if (level === "debug") return;
			(level === "info" ? console.log : console.warn)(`${LOG} ${message}`);
		},
	});
	const notify = () => void publishStatus();
	client.on("connected", notify);
	client.on("disconnected", notify);
	client.on("state", notify);
	return client;
}

async function publishStatus(): Promise<void> {
	if (listeners.size === 0) return;
	const status = await getRepoMonitorStatus();
	for (const fn of listeners) fn(status);
}

/** Connected client, or null when the daemon cannot be reached right now. */
export async function ensureRepoMonitor(): Promise<RepoMonitorClient | null> {
	if (Date.now() < unavailableUntil) return null;
	const c = getClient();
	if (!c) return null;
	if (c.state === "connected") return c;
	try {
		await c.connect();
		lastFailure = null;
		return c;
	} catch (err) {
		markUnavailable((err as Error).message);
		return null;
	}
}

/**
 * Relative file paths (with sizes) under `root` from the daemon's git-aware,
 * cached tree. Throws when the daemon is unavailable or cannot read the repo.
 */
export async function listRepoFiles(root: string): Promise<RepoFile[]> {
	const c = await ensureRepoMonitor();
	if (!c) throw new Error(`repository monitor unavailable: ${lastFailure ?? "not connected"}`);
	if (!registered.has(root)) {
		await c.request({ type: "register", path: root });
		registered.add(root);
	}
	const tree = await c.request({ type: "getFileTree", path: root });
	if (!tree) throw new Error(`repository monitor returned no file tree for ${root}`);
	return tree.allFiles.map((f) => ({ path: f.path, size: f.size ?? 0 }));
}

export async function getRepoMonitorStatus(): Promise<RepoMonitorDiagnostics> {
	const c = client;
	if (c) return c.status();
	const probe = new RepoMonitorClient({ spawnedBy: "studio", spawn: false });
	return {
		state: "unreachable",
		socketPath: probe.socketPath,
		...(lastFailure ? { error: lastFailure } : {}),
	};
}

/** Connect (spawning when needed) regardless of the failure back-off. */
export async function startRepoMonitor(): Promise<{ ok: boolean; error?: string; status: RepoMonitorDiagnostics }> {
	unavailableUntil = 0;
	const c = await ensureRepoMonitor();
	return { ok: c !== null, ...(c ? {} : { error: lastFailure ?? "could not start" }), status: await getRepoMonitorStatus() };
}

export async function restartRepoMonitor(): Promise<{ ok: boolean; error?: string; status: RepoMonitorDiagnostics }> {
	unavailableUntil = 0;
	const c = getClient();
	if (!c) return { ok: false, error: lastFailure ?? "unavailable", status: await getRepoMonitorStatus() };
	try {
		await c.restartDaemon();
		return { ok: true, status: await getRepoMonitorStatus() };
	} catch (err) {
		markUnavailable((err as Error).message);
		return { ok: false, error: (err as Error).message, status: await getRepoMonitorStatus() };
	}
}

/** Drop and rebuild every cache slice the daemon holds for `path`. */
export async function rebuildRepoMonitorRepo(path: string): Promise<{ ok: boolean; error?: string }> {
	const c = await ensureRepoMonitor();
	if (!c) return { ok: false, error: lastFailure ?? "daemon unavailable" };
	try {
		await c.request({ type: "refresh", path });
		return { ok: true };
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}
}

export function onRepoMonitorChanged(fn: (status: RepoMonitorDiagnostics) => void): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}

/** Disconnect; the daemon stays up for other clients and idles out on its own. */
export async function shutdownRepoMonitor(): Promise<void> {
	const c = client;
	client = null;
	if (c) await c.close();
}
