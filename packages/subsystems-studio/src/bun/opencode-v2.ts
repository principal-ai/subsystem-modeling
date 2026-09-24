/**
 * OpenCode V2 (`opencode2`) detect / install for Studio's debug + Maintain path.
 *
 * Studio does not shell out to `npm`. Install/update downloads the platform
 * binary straight from the vendor's registry tarball and writes it to the
 * conventional location (`~/.opencode/bin/opencode2`). Installing under the
 * `opencode2` name (never `opencode`) keeps a user's V1 install untouched, and
 * avoids depending on PATH, which GUI launches do not receive.
 */

import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { OpencodeV2Status } from "../shared/contract";
import { compareSemver } from "./graphify-runner";

export const OPENCODE_V2_BIN_NAME = "opencode2";

/** Conventional install dir Studio can always resolve, regardless of PATH. */
export const OPENCODE_V2_INSTALL_DIR = join(homedir(), ".opencode", "bin");

/** Human-facing manual install hint surfaced in the debug tab. */
export const OPENCODE_V2_INSTALL_COMMAND =
	"curl -fsSL https://opencode.ai/v2/install | bash";

/** Vendor endpoint returning the current v2 release for the npm channel. */
const OPENCODE_V2_LATEST_ENDPOINT =
	"https://opencode.ai/update/api/latest/cli/npm";
const OPENCODE_V2_DEFAULT_SCOPE = "@opencode";
const OPENCODE_V2_REGISTRY = "https://registry.npmjs.org";

interface OpencodeRelease {
	version: string;
	/** Scope owning the `cli-<target>` platform packages, e.g. `@opencode`. */
	scope: string;
}

function installBinPath(): string {
	const name =
		process.platform === "win32"
			? `${OPENCODE_V2_BIN_NAME}.exe`
			: OPENCODE_V2_BIN_NAME;
	return join(OPENCODE_V2_INSTALL_DIR, name);
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
	const onPath =
		Bun.which(OPENCODE_V2_BIN_NAME) ??
		(process.platform === "win32"
			? Bun.which(`${OPENCODE_V2_BIN_NAME}.exe`)
			: null);
	if (onPath) return onPath;
	const conventional = installBinPath();
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
		// e.g. "0.0.0-beta-19271" or "opencode v2.0.15"
		const match = text.match(/(\d+\.\d+\.\d+(?:-[\w.-]+)?)/);
		return match?.[1] ?? (text.length > 0 ? text.split(/\s+/).pop()! : null);
	} catch {
		return null;
	}
}

/** Map the host OS/arch to the vendor's release target slug. Mirrors the
 *  detection in the official install script (baseline for non-AVX2 x64,
 *  musl for Alpine/glibc-less Linux). */
function detectTarget(): string {
	const os =
		process.platform === "darwin"
			? "darwin"
			: process.platform === "linux"
				? "linux"
				: process.platform === "win32"
					? "windows"
					: process.platform;
	const arch = process.arch;
	let target = `${os}-${arch}`;
	if (arch === "x64" && needsBaseline(os)) target += "-baseline";
	if (os === "linux" && isMusl()) target += "-musl";
	return target;
}

function needsBaseline(os: string): boolean {
	try {
		if (os === "linux") {
			return !/\bavx2\b/i.test(readFileSync("/proc/cpuinfo", "utf8"));
		}
		if (os === "darwin") {
			const proc = Bun.spawnSync({
				cmd: ["sysctl", "-n", "hw.optional.avx2_0"],
				stdout: "pipe",
				stderr: "ignore",
			});
			return proc.stdout.toString().trim() !== "1";
		}
	} catch {
		return false;
	}
	return false;
}

function isMusl(): boolean {
	try {
		if (existsSync("/etc/alpine-release")) return true;
		const proc = Bun.spawnSync({
			cmd: ["ldd", "--version"],
			stdout: "pipe",
			stderr: "pipe",
		});
		return /musl/i.test(`${proc.stdout.toString()}${proc.stderr.toString()}`);
	} catch {
		return false;
	}
}

async function fetchLatestRelease(): Promise<OpencodeRelease | null> {
	try {
		const res = await fetch(OPENCODE_V2_LATEST_ENDPOINT, {
			headers: { Accept: "application/json" },
			signal: AbortSignal.timeout(12_000),
		});
		if (!res.ok) return null;
		const data = (await res.json()) as {
			version?: unknown;
			metadata?: { package?: unknown };
		};
		if (typeof data.version !== "string" || !data.version) return null;
		const pkg = data.metadata?.package;
		const scope =
			typeof pkg === "string" && pkg.includes("/")
				? pkg.slice(0, pkg.lastIndexOf("/"))
				: "";
		return {
			version: data.version,
			scope: scope || OPENCODE_V2_DEFAULT_SCOPE,
		};
	} catch {
		return null;
	}
}

export async function fetchLatestOpencode2Version(): Promise<string | null> {
	return (await fetchLatestRelease())?.version ?? null;
}

export function getOpencodeV2Status(): OpencodeV2Status {
	const bin = resolveOpencode2Bin();
	const installedVersion = bin ? readOpencode2Version(bin) : null;
	return {
		installed: bin !== null,
		bin,
		conventionalBin: installBinPath(),
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

/** Download the platform tarball and drop the binary at the conventional path
 *  as `opencode2`. Never touches a V1 `opencode`. */
async function downloadAndInstall(
	version: string,
	scope: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const target = detectTarget();
	const pkgBase = `cli-${target}`;
	const url = `${OPENCODE_V2_REGISTRY}/${scope}/${pkgBase}/-/${pkgBase}-${version}.tgz`;

	const tar = Bun.which("tar");
	if (!tar) {
		return { ok: false, error: "'tar' is required but was not found on PATH" };
	}

	let workDir: string;
	try {
		workDir = await mkdtemp(join(tmpdir(), "opencode2-install-"));
	} catch (err) {
		return {
			ok: false,
			error: `could not create temp dir: ${(err as Error).message}`,
		};
	}

	try {
		const archivePath = join(workDir, `${pkgBase}-${version}.tgz`);
		let res: Response;
		try {
			res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
		} catch (err) {
			return { ok: false, error: `download failed: ${(err as Error).message}` };
		}
		if (!res.ok) {
			return {
				ok: false,
				error: `download failed (${res.status}) for ${scope}/${pkgBase}@${version}`,
			};
		}
		// Read the body first: `Bun.write(path, response)` stalls on large
		// streamed responses, whereas buffering then writing is reliable.
		const bytes = await res.arrayBuffer();
		await Bun.write(archivePath, bytes);

		const extract = Bun.spawn({
			cmd: [tar, "-xzf", archivePath, "-C", workDir],
			stdio: ["ignore", "pipe", "pipe"],
		});
		const [out, err] = await Promise.all([
			new Response(extract.stdout).text(),
			new Response(extract.stderr).text(),
		]);
		if ((await extract.exited) !== 0) {
			return {
				ok: false,
				error: `extract failed: ${(err || out).trim() || "tar error"}`,
			};
		}

		const binaryName = process.platform === "win32" ? "opencode.exe" : "opencode";
		const extracted = join(workDir, "package", "bin", binaryName);
		if (!existsSync(extracted)) {
			return {
				ok: false,
				error: `archive did not contain package/bin/${binaryName}`,
			};
		}

		mkdirSync(OPENCODE_V2_INSTALL_DIR, { recursive: true });
		const dest = installBinPath();
		copyFileSync(extracted, dest);
		chmodSync(dest, 0o755);
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	} finally {
		await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
	}
}

async function performInstall(
	action: "install" | "update",
): Promise<InstallOpencodeV2Result> {
	const release = await fetchLatestRelease();
	if (!release) {
		return {
			ok: false,
			error: "could not determine the latest OpenCode V2 version",
		};
	}
	const result = await downloadAndInstall(release.version, release.scope);
	if (!result.ok) {
		return { ok: false, error: `${action} failed: ${result.error}` };
	}
	const bin = resolveOpencode2Bin();
	if (!bin) {
		return {
			ok: false,
			error: `${action} completed but opencode2 is not resolvable at ${installBinPath()}`,
		};
	}
	return { ok: true, bin, status: await getOpencodeV2StatusDetailed() };
}

/**
 * Install OpenCode V2 to the conventional location when missing.
 * No-op success if `opencode2` is already resolvable.
 */
export async function installOpencodeV2(): Promise<InstallOpencodeV2Result> {
	const existing = resolveOpencode2Bin();
	if (existing) {
		return { ok: true, bin: existing, status: await getOpencodeV2StatusDetailed() };
	}
	return performInstall("install");
}

/** Re-download the latest release over an existing `opencode2`. */
export async function updateOpencodeV2(): Promise<InstallOpencodeV2Result> {
	if (!resolveOpencode2Bin()) {
		return { ok: false, error: "opencode2 is not installed" };
	}
	return performInstall("update");
}
