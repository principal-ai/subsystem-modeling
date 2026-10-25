/**
 * Programmatic graphify extract — spawn the CLI, land `graph.json`, validate.
 *
 * First building block for `ensureGraphifyGraph(purl)` (see topic
 * "Trail-viewer graphify cache: purl + HEAD + dirty hash"). This module does
 * not key by purl/hash yet; it only proves we can trigger extract and keep
 * the artifact we care about.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** Minimal shape we assert after extract (full types live in principal-view-react). */
export interface GraphifyGraphSmoke {
	nodes: unknown[];
	links?: unknown[];
	edges?: unknown[];
	built_at_commit?: string;
	[key: string]: unknown;
}

export interface RunGraphifyExtractOptions {
	/** Absolute path to the corpus / repo root to scan. */
	repoRoot: string;
	/**
	 * Parent directory for graphify's output. graphify writes
	 * `<outDir>/graphify-out/graph.json` (or `$GRAPHIFY_OUT` if absolute).
	 * When omitted, a temp directory is created and returned in the result.
	 */
	outDir?: string;
	/** AST-only, no LLM (default true for server/smoke use). */
	codeOnly?: boolean;
	/** Explicit binary path or name; else PATH, then `~/.local/bin/graphify`. */
	bin?: string;
	/** Extra CLI args after the standard flags. */
	extraArgs?: string[];
	/** When true, delete a temp outDir we created on failure (default true). */
	cleanupTempOnFailure?: boolean;
	/** Stop the CLI (and its process group) when a background job is cancelled. */
	signal?: AbortSignal;
	/** Ignore ambient GRAPHIFY_OUT and confine artifacts to the supplied outDir. */
	isolatedOutput?: boolean;
	/** Timeline-only: accept Graphify's confirmed zero-code empty-corpus exit. */
	allowEmptyCode?: boolean;
}

export interface GraphifyEmptyCode {
	/** File scan limits, not counts of unverified declarations. */
	unclassifiedFiles: number;
	sensitiveFiles: number;
}

export interface RunGraphifyExtractResult {
	ok: true;
	repoRoot: string;
	outDir: string;
	graphifyOut: string;
	graphJsonPath: string;
	graph: GraphifyGraphSmoke;
	nodeCount: number;
	edgeCount: number;
	builtAtCommit?: string;
	/** True when this call created `outDir` under os.tmpdir(). */
	usedTempOut: boolean;
	durationMs: number;
	stdout: string;
	stderr: string;
	emptyCode?: GraphifyEmptyCode;
}

export interface RunGraphifyExtractFailure {
	ok: false;
	error: string;
	exitCode?: number;
	stdout?: string;
	stderr?: string;
	graphJsonPath?: string;
	durationMs: number;
}

export type GraphifyExtractOutcome = RunGraphifyExtractResult | RunGraphifyExtractFailure;

/** uv / pipx conventional install location for the `graphify` command. */
export function conventionalGraphifyBin(): string {
	return join(homedir(), ".local", "bin", "graphify");
}

/**
 * Resolve the graphify CLI binary.
 * Order: explicit `bin` → `graphify` on PATH → `~/.local/bin/graphify`.
 */
export function resolveGraphifyBin(bin?: string): string | null {
	const explicit = bin?.trim();
	if (explicit) {
		if (explicit.includes("/") || explicit.includes("\\")) {
			return existsSync(explicit) ? resolve(explicit) : null;
		}
		return Bun.which(explicit) ?? null;
	}
	return Bun.which("graphify") ?? (existsSync(conventionalGraphifyBin()) ? conventionalGraphifyBin() : null);
}

/** Path graphify writes for a given `--out` parent. */
export function graphifyOutDir(outDir: string): string {
	const override = process.env["GRAPHIFY_OUT"]?.trim();
	if (override && (override.startsWith("/") || /^[A-Za-z]:[\\/]/.test(override))) {
		return override;
	}
	const name = override && !override.includes("/") && !override.includes("\\")
		? override
		: "graphify-out";
	return join(outDir, name);
}

export function graphJsonPathForOut(outDir: string): string {
	return join(graphifyOutDir(outDir), "graph.json");
}

/** Parse and lightly validate a graph.json file. */
export function loadGraphifyGraph(path: string): GraphifyGraphSmoke {
	const raw = readFileSync(path, "utf8");
	const data = JSON.parse(raw) as GraphifyGraphSmoke;
	if (!data || typeof data !== "object") {
		throw new Error("graph.json root is not an object");
	}
	if (!Array.isArray(data.nodes)) {
		throw new Error("graph.json missing nodes[]");
	}
	return data;
}

export function edgeCount(graph: GraphifyGraphSmoke): number {
	if (Array.isArray(graph.links)) return graph.links.length;
	if (Array.isArray(graph.edges)) return graph.edges.length;
	return 0;
}

const EMPTY_GRAPH_MESSAGE = "[graphify extract] graph is empty — extraction produced no nodes. Possible causes: all files skipped, binary-only corpus, or LLM returned no edges.";

/** Be conservative: a generic empty-graph error can also hide parser failures. */
function confirmedEmptyCode(stdout: string, stderr: string, exitCode: number): GraphifyEmptyCode | undefined {
	if (exitCode !== 1 || stderr.trim() !== EMPTY_GRAPH_MESSAGE) return undefined;
	const scans = [...stdout.matchAll(/^\[graphify extract\] found (\d+) code, \d+ docs, \d+ papers, \d+ images\r?$/gm)];
	if (scans.length !== 1 || scans[0]![1] !== "0") return undefined;
	const count = (pattern: RegExp) => {
		const matches = [...stdout.matchAll(pattern)];
		return matches.reduce((total, match) => total + Number(match[1]), 0);
	};
	return {
		unclassifiedFiles: count(/^\[graphify extract\] (\d+) file\(s\) not classified\b/gm),
		sensitiveFiles: count(/^\[graphify extract\] (\d+) file\(s\) skipped as potentially sensitive\b/gm),
	};
}

/** Do not persist arbitrary CLI output: it can contain source text or secrets. */
export function graphifyFailureReason(failure: RunGraphifyExtractFailure): string {
	const stderr = failure.stderr ?? "";
	const status = failure.exitCode === undefined ? "" : ` (exit ${failure.exitCode})`;
	if (stderr.includes("[graphify extract] graph is empty — extraction produced no nodes.")) {
		return `Graphify produced no graph nodes${status}. The scan did not qualify as a confirmed zero-code snapshot`;
	}
	const missing = stderr.match(/ModuleNotFoundError: No module named ['"]([\w.-]+)['"]/);
	if (missing) return `Graphify is missing Python module ${missing[1]}${status}`;
	const exception = stderr.match(/^([A-Za-z][A-Za-z0-9_]*(?:Error|Exception)):/m);
	if (exception) return `Graphify failed with ${exception[1]}${status}`;
	if (failure.error.startsWith("extract succeeded but graph.json missing")) return "Graphify completed without producing graph.json";
	if (failure.error.startsWith("graphify CLI not found")) return "Graphify CLI was not found";
	return `Graphify extraction failed${status}`;
}

/**
 * Run `graphify extract <repoRoot> --out <outDir> [--code-only]`.
 * Does not write HTML / GRAPH_REPORT (those come from cluster-only).
 */
export async function runGraphifyExtract(
	opts: RunGraphifyExtractOptions,
): Promise<GraphifyExtractOutcome> {
	const started = performance.now();
	if (opts.signal?.aborted) {
		return { ok: false, error: "Extraction cancelled", durationMs: performance.now() - started };
	}
	const repoRoot = resolve(opts.repoRoot);
	if (!existsSync(repoRoot)) {
		return {
			ok: false,
			error: `repo root not found: ${repoRoot}`,
			durationMs: performance.now() - started,
		};
	}

	const bin = resolveGraphifyBin(opts.bin);
	if (!bin) {
		return {
			ok: false,
			error:
				"graphify CLI not found on PATH or at ~/.local/bin/graphify. " +
				"Install with: uv tool install graphifyy (or: pipx install graphifyy).",
			durationMs: performance.now() - started,
		};
	}

	let usedTempOut = false;
	let outDir: string;
	if (opts.outDir) {
		outDir = resolve(opts.outDir);
		mkdirSync(outDir, { recursive: true });
	} else {
		outDir = mkdtempSync(join(tmpdir(), "graphify-smoke-"));
		usedTempOut = true;
	}

	const codeOnly = opts.codeOnly !== false;
	const args = ["extract", repoRoot, "--out", outDir];
	if (codeOnly) args.push("--code-only");
	if (opts.extraArgs?.length) args.push(...opts.extraArgs);
	// Avoid Graphify's one-process-per-CPU default exhausting desktop memory.
	args.push("--max-workers", "2");

	const proc = Bun.spawn({
		cmd: [bin, ...args],
		// Graphify re-execs as `python -m graphify` to pin its hash seed.
		// Running in the checkout can import its code instead of the installed CLI.
		cwd: outDir,
		stdio: ["ignore", "pipe", "pipe"],
		detached: !!opts.signal,
		env: {
			...process.env,
			...(opts.isolatedOutput ? { GRAPHIFY_OUT: join(outDir, "graphify-out") } : {}),
		},
	});
	let killTimer: ReturnType<typeof setTimeout> | undefined;
	const terminate = (signal: NodeJS.Signals) => {
		try {
			if (opts.signal && process.platform !== "win32") process.kill(-proc.pid, signal);
			else proc.kill(signal);
		} catch { /* The process may already have exited. */ }
	};
	const abort = () => {
		terminate("SIGTERM");
		killTimer = setTimeout(() => terminate("SIGKILL"), 1000);
	};
	opts.signal?.addEventListener("abort", abort, { once: true });
	if (opts.signal?.aborted) abort();

	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const exitCode = await proc.exited;
	opts.signal?.removeEventListener("abort", abort);
	if (opts.signal?.aborted) terminate("SIGKILL");
	if (killTimer) clearTimeout(killTimer);
	const durationMs = performance.now() - started;
	const graphPath = opts.isolatedOutput
		? join(outDir, "graphify-out", "graph.json")
		: graphJsonPathForOut(outDir);

	const failCleanup = () => {
		if (usedTempOut && opts.cleanupTempOnFailure !== false) {
			try {
				rmSync(outDir, { recursive: true, force: true });
			} catch {
				/* ignore */
			}
		}
	};

	if (opts.signal?.aborted) {
		failCleanup();
		return { ok: false, error: "Extraction cancelled", durationMs };
	}
	if (exitCode !== 0) {
		const emptyCode = codeOnly && opts.allowEmptyCode
			? confirmedEmptyCode(stdout, stderr, exitCode) : undefined;
		if (emptyCode && !existsSync(graphPath)) {
			const graph = { nodes: [], links: [] };
			// Keep the success contract: graphJsonPath always names a real graph.
			mkdirSync(dirname(graphPath), { recursive: true });
			await Bun.write(graphPath, JSON.stringify(graph));
			return {
				ok: true, repoRoot, outDir, graphifyOut: dirname(graphPath), graphJsonPath: graphPath,
				graph, nodeCount: 0, edgeCount: 0, usedTempOut, durationMs, stdout, stderr, emptyCode,
			};
		}
		failCleanup();
		return {
			ok: false,
			error: `graphify extract exited ${exitCode}`,
			exitCode,
			stdout,
			stderr,
			graphJsonPath: existsSync(graphPath) ? graphPath : undefined,
			durationMs,
		};
	}

	if (!existsSync(graphPath)) {
		failCleanup();
		return {
			ok: false,
			error: `extract succeeded but graph.json missing at ${graphPath}`,
			exitCode,
			stdout,
			stderr,
			durationMs,
		};
	}

	try {
		const graph = loadGraphifyGraph(graphPath);
		return {
			ok: true,
			repoRoot,
			outDir,
			graphifyOut: opts.isolatedOutput ? join(outDir, "graphify-out") : graphifyOutDir(outDir),
			graphJsonPath: graphPath,
			graph,
			nodeCount: graph.nodes.length,
			edgeCount: edgeCount(graph),
			builtAtCommit:
				typeof graph.built_at_commit === "string" ? graph.built_at_commit : undefined,
			usedTempOut,
			durationMs,
			stdout,
			stderr,
		};
	} catch (err) {
		failCleanup();
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
			exitCode,
			stdout,
			stderr,
			graphJsonPath: graphPath,
			durationMs,
		};
	}
}

/**
 * Copy `graph.json` from an extract `--out` tree to a destination path
 * (the only durable artifact we plan to keep in the purl/hash store).
 */
export function promoteGraphJson(fromOutDir: string, toPath: string): string {
	const src = graphJsonPathForOut(fromOutDir);
	if (!existsSync(src)) {
		throw new Error(`no graph.json under ${fromOutDir}`);
	}
	mkdirSync(dirname(toPath), { recursive: true });
	copyFileSync(src, toPath);
	return toPath;
}

export interface GraphifyCliStatus {
	installed: boolean;
	bin: string | null;
	/** Conventional uv/pipx path (may or may not exist). */
	conventionalBin: string;
	installCommand: string;
	/** From `graphify --version`, when installed. */
	installedVersion: string | null;
	/** Latest on PyPI (`graphifyy`), when checked. */
	latestVersion: string | null;
	/** True when latest > installed; null if either version is unknown. */
	updateAvailable: boolean | null;
	/** Host is running install/update/uninstall in the background. */
	cliBusy?: "install" | "update" | "uninstall" | null;
}

function readInstalledVersion(bin: string): string | null {
	const result = spawnSync(bin, ["--version"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
		timeout: 10_000,
	});
	if (result.status !== 0) return null;
	const out = (result.stdout ?? "").trim();
	const m = out.match(/graphify\s+(\d+\.\d+\.\d+\S*)/i) ?? out.match(/(\d+\.\d+\.\d+\S*)/);
	return m?.[1] ?? null;
}

/** Compare dotted versions; returns 1 if a>b, -1 if a<b, 0 if equal/unknown. */
export function compareSemver(a: string, b: string): number {
	const pa = a.replace(/^v/i, "").split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0);
	const pb = b.replace(/^v/i, "").split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0);
	const n = Math.max(pa.length, pb.length);
	for (let i = 0; i < n; i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (d > 0) return 1;
		if (d < 0) return -1;
	}
	return 0;
}

export async function fetchLatestGraphifyVersion(): Promise<string | null> {
	try {
		const res = await fetch("https://pypi.org/pypi/graphifyy/json", {
			headers: { Accept: "application/json" },
			signal: AbortSignal.timeout(12_000),
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { info?: { version?: string } };
		return typeof data.info?.version === "string" ? data.info.version : null;
	} catch {
		return null;
	}
}

export function getGraphifyStatus(): GraphifyCliStatus {
	const bin = resolveGraphifyBin();
	const installedVersion = bin ? readInstalledVersion(bin) : null;
	return {
		installed: bin !== null,
		bin,
		conventionalBin: conventionalGraphifyBin(),
		installCommand: "uv tool install graphifyy",
		installedVersion,
		latestVersion: null,
		updateAvailable: null,
		cliBusy: null,
	};
}

/** Like getGraphifyStatus, plus a PyPI latest-version check. */
export async function getGraphifyStatusDetailed(): Promise<GraphifyCliStatus> {
	const base = getGraphifyStatus();
	const latestVersion = await fetchLatestGraphifyVersion();
	let updateAvailable: boolean | null = null;
	if (base.installedVersion && latestVersion) {
		updateAvailable = compareSemver(latestVersion, base.installedVersion) > 0;
	}
	return { ...base, latestVersion, updateAvailable };
}

export function isGraphifyNotInstalledError(message: string): boolean {
	return /graphify CLI not found/i.test(message);
}

export interface InstallGraphifyResult {
	ok: boolean;
	bin?: string;
	error?: string;
	stdout?: string;
	stderr?: string;
	status?: GraphifyCliStatus;
}

async function runToolCommand(
	uvArgs: string[],
	pipxArgs: string[],
): Promise<{ ok: boolean; stdout: string; stderr: string; exitCode: number; error?: string }> {
	const uv = Bun.which("uv");
	if (uv) {
		const proc = Bun.spawn({
			cmd: [uv, ...uvArgs],
			stdio: ["ignore", "pipe", "pipe"],
		});
		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		const exitCode = await proc.exited;
		return { ok: exitCode === 0, stdout, stderr, exitCode };
	}
	const pipx = Bun.which("pipx");
	if (pipx) {
		const proc = Bun.spawn({
			cmd: [pipx, ...pipxArgs],
			stdio: ["ignore", "pipe", "pipe"],
		});
		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		const exitCode = await proc.exited;
		return { ok: exitCode === 0, stdout, stderr, exitCode };
	}
	return {
		ok: false,
		stdout: "",
		stderr: "",
		exitCode: 1,
		error:
			"Neither uv nor pipx found on PATH. Install uv (https://docs.astral.sh/uv/) then run: uv tool install graphifyy",
	};
}

/**
 * Install the graphify CLI via `uv tool install graphifyy` when missing.
 * No-op success if already resolvable on PATH / ~/.local/bin.
 */
export async function installGraphify(): Promise<InstallGraphifyResult> {
	const existing = resolveGraphifyBin();
	if (existing) {
		return { ok: true, bin: existing, status: getGraphifyStatus() };
	}

	const ran = await runToolCommand(
		["tool", "install", "graphifyy"],
		["install", "graphifyy"],
	);
	if (ran.error) return { ok: false, error: ran.error };
	const bin = resolveGraphifyBin();
	if (!ran.ok || !bin) {
		return {
			ok: false,
			error: `install graphifyy failed (exit ${ran.exitCode})`,
			stdout: ran.stdout,
			stderr: ran.stderr,
		};
	}
	return {
		ok: true,
		bin,
		stdout: ran.stdout,
		stderr: ran.stderr,
		status: await getGraphifyStatusDetailed(),
	};
}

/** Upgrade to the latest PyPI `graphifyy` (`uv tool upgrade` / `pipx upgrade`). */
export async function updateGraphify(): Promise<InstallGraphifyResult> {
	if (!resolveGraphifyBin()) {
		return { ok: false, error: "graphify is not installed" };
	}
	const ran = await runToolCommand(
		["tool", "upgrade", "graphifyy"],
		["upgrade", "graphifyy"],
	);
	if (ran.error) return { ok: false, error: ran.error };
	const bin = resolveGraphifyBin();
	if (!ran.ok) {
		return {
			ok: false,
			error: `upgrade graphifyy failed (exit ${ran.exitCode})`,
			stdout: ran.stdout,
			stderr: ran.stderr,
		};
	}
	return {
		ok: true,
		bin: bin ?? undefined,
		stdout: ran.stdout,
		stderr: ran.stderr,
		status: await getGraphifyStatusDetailed(),
	};
}

/** Remove the tool install (`uv tool uninstall` / `pipx uninstall`). */
export async function uninstallGraphify(): Promise<InstallGraphifyResult> {
	if (!resolveGraphifyBin()) {
		return { ok: true, status: await getGraphifyStatusDetailed() };
	}
	const ran = await runToolCommand(
		["tool", "uninstall", "graphifyy"],
		["uninstall", "graphifyy"],
	);
	if (ran.error) return { ok: false, error: ran.error };
	// Local-checkout bins (e.g. repo .venv) won't be removed by uv/pipx — report clearly.
	const still = resolveGraphifyBin();
	if (!ran.ok) {
		return {
			ok: false,
			error: `uninstall graphifyy failed (exit ${ran.exitCode})`,
			stdout: ran.stdout,
			stderr: ran.stderr,
		};
	}
	if (still) {
		return {
			ok: false,
			error: `graphify is still resolvable at ${still} (not an uv/pipx tool install)`,
			bin: still,
			stdout: ran.stdout,
			stderr: ran.stderr,
			status: await getGraphifyStatusDetailed(),
		};
	}
	return {
		ok: true,
		stdout: ran.stdout,
		stderr: ran.stderr,
		status: await getGraphifyStatusDetailed(),
	};
}
