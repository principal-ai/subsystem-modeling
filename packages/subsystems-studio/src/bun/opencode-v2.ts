/**
 * OpenCode V2 (`opencode2`) detect / install for Studio's debug + Maintain path.
 *
 * V2 ships as `@opencode-ai/cli@beta` and does not replace V1 `opencode`.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OpencodeV2Status } from "../shared/contract";
import { compareSemver } from "./graphify-runner";

export const OPENCODE_V2_NPM_PACKAGE = "@opencode-ai/cli";
export const OPENCODE_V2_NPM_TAG = "beta";
export const OPENCODE_V2_BIN_NAME = "opencode2";

export const OPENCODE_V2_INSTALL_COMMAND = `npm install -g ${OPENCODE_V2_NPM_PACKAGE}@${OPENCODE_V2_NPM_TAG}`;

function conventionalOpencode2Bin(): string {
	return join(homedir(), ".opencode", "bin", OPENCODE_V2_BIN_NAME);
}

/** Resolve the opencode2 binary: env → PATH → ~/.opencode/bin/opencode2. */
export function resolveOpencode2Bin(bin?: string): string | null {
	const explicit = bin?.trim() || process.env["OPENCODE2_BIN"]?.trim();
	if (explicit) {
		if (explicit.includes("/") || explicit.includes("\\")) {
			return existsSync(explicit) ? explicit : null;
		}
		return Bun.which(explicit) ?? null;
	}
	const onPath = Bun.which(OPENCODE_V2_BIN_NAME);
	if (onPath) return onPath;
	const conventional = conventionalOpencode2Bin();
	return existsSync(conventional) ? conventional : null;
}

export function readOpencode2Version(bin: string): string | null {
	try {
		const proc = Bun.spawnSync({
			cmd: [bin, "--version"],
			stdout: "pipe",
			stderr: "pipe",
		});
		if (proc.exitCode !== 0) return null;
		const text = proc.stdout.toString().trim();
		// e.g. "0.0.0-beta-19271" or "opencode2 0.0.0-beta-19271"
		const match = text.match(/(\d+\.\d+\.\d+(?:-[\w.-]+)?)/);
		return match?.[1] ?? (text.length > 0 ? text.split(/\s+/).pop()! : null);
	} catch {
		return null;
	}
}

export async function fetchLatestOpencode2Version(): Promise<string | null> {
	try {
		const res = await fetch(
			`https://registry.npmjs.org/${OPENCODE_V2_NPM_PACKAGE}/${OPENCODE_V2_NPM_TAG}`,
			{
				headers: { Accept: "application/json" },
				signal: AbortSignal.timeout(12_000),
			},
		);
		if (!res.ok) return null;
		const data = (await res.json()) as { version?: string };
		return typeof data.version === "string" ? data.version : null;
	} catch {
		return null;
	}
}

export function getOpencodeV2Status(): OpencodeV2Status {
	const bin = resolveOpencode2Bin();
	const installedVersion = bin ? readOpencode2Version(bin) : null;
	return {
		installed: bin !== null,
		bin,
		conventionalBin: conventionalOpencode2Bin(),
		installCommand: OPENCODE_V2_INSTALL_COMMAND,
		installedVersion,
		latestVersion: null,
		updateAvailable: null,
		cliBusy: null,
	};
}

export async function getOpencodeV2StatusDetailed(): Promise<OpencodeV2Status> {
	const base = getOpencodeV2Status();
	const latestVersion = await fetchLatestOpencode2Version();
	let updateAvailable: boolean | null = null;
	if (base.installedVersion && latestVersion) {
		updateAvailable = compareSemver(latestVersion, base.installedVersion) > 0;
	} else if (!base.installed && latestVersion) {
		updateAvailable = true;
	}
	return { ...base, latestVersion, updateAvailable };
}

export interface InstallOpencodeV2Result {
	ok: boolean;
	bin?: string;
	error?: string;
	stdout?: string;
	stderr?: string;
	status?: OpencodeV2Status;
}

async function runNpmInstallGlobal(): Promise<{
	ok: boolean;
	stdout: string;
	stderr: string;
	exitCode: number;
	error?: string;
}> {
	const npm = Bun.which("npm");
	if (!npm) {
		return {
			ok: false,
			stdout: "",
			stderr: "",
			exitCode: 1,
			error: "npm not found on PATH — install Node.js/npm, or run: curl -fsSL https://opencode.ai/v2/install | bash",
		};
	}
	const proc = Bun.spawn({
		cmd: [
			npm,
			"install",
			"-g",
			`${OPENCODE_V2_NPM_PACKAGE}@${OPENCODE_V2_NPM_TAG}`,
		],
		stdio: ["ignore", "pipe", "pipe"],
		env: { ...process.env },
	});
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const exitCode = await proc.exited;
	return { ok: exitCode === 0, stdout, stderr, exitCode };
}

/**
 * Install OpenCode V2 globally via npm when missing.
 * No-op success if `opencode2` is already resolvable.
 */
export async function installOpencodeV2(): Promise<InstallOpencodeV2Result> {
	const existing = resolveOpencode2Bin();
	if (existing) {
		return { ok: true, bin: existing, status: await getOpencodeV2StatusDetailed() };
	}

	const ran = await runNpmInstallGlobal();
	if (ran.error) return { ok: false, error: ran.error };

	const bin = resolveOpencode2Bin();
	if (!ran.ok || !bin) {
		return {
			ok: false,
			error: `install ${OPENCODE_V2_NPM_PACKAGE}@${OPENCODE_V2_NPM_TAG} failed (exit ${ran.exitCode})`,
			stdout: ran.stdout,
			stderr: ran.stderr,
		};
	}
	return {
		ok: true,
		bin,
		stdout: ran.stdout,
		stderr: ran.stderr,
		status: await getOpencodeV2StatusDetailed(),
	};
}

/** Upgrade the global beta package when already installed. */
export async function updateOpencodeV2(): Promise<InstallOpencodeV2Result> {
	if (!resolveOpencode2Bin()) {
		return { ok: false, error: "opencode2 is not installed" };
	}
	const ran = await runNpmInstallGlobal();
	if (ran.error) return { ok: false, error: ran.error };
	const bin = resolveOpencode2Bin();
	if (!ran.ok) {
		return {
			ok: false,
			error: `update ${OPENCODE_V2_NPM_PACKAGE}@${OPENCODE_V2_NPM_TAG} failed (exit ${ran.exitCode})`,
			stdout: ran.stdout,
			stderr: ran.stderr,
		};
	}
	return {
		ok: true,
		bin: bin ?? undefined,
		stdout: ran.stdout,
		stderr: ran.stderr,
		status: await getOpencodeV2StatusDetailed(),
	};
}
