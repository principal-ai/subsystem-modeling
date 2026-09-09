/**
 * Studio self-update — installed npm version vs registry latest, plus relaunch
 * via `npx @principal-ai/subsystems-studio@latest` after releasing the IPC
 * socket so the new process does not hand off to this one.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { StudioVersionStatus } from "../shared/contract";
import { compareSemver } from "./graphify-runner";
import { releaseIpcForRelaunch } from "./ipc";

export const STUDIO_NPM_PACKAGE = "@principal-ai/subsystems-studio";

export type { StudioVersionStatus };

function startDir(): string {
	try {
		return dirname(fileURLToPath(import.meta.url));
	} catch {
		return process.cwd();
	}
}

/** Walk up from the host entry looking for this package's package.json. */
export function findStudioPackageRoot(): string | null {
	let dir = startDir();
	for (let i = 0; i < 12; i++) {
		const pkgPath = join(dir, "package.json");
		if (existsSync(pkgPath)) {
			try {
				const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
					name?: string;
					version?: string;
				};
				if (pkg.name === STUDIO_NPM_PACKAGE) return dir;
			} catch {
				// keep walking
			}
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

function detectChannel(packageRoot: string | null): StudioVersionStatus["channel"] {
	if (!packageRoot) return "unknown";
	// Source checkout has TypeScript host sources; published npm packs only bin + bundles.
	if (existsSync(join(packageRoot, "src", "bun", "index.ts"))) return "source";
	if (existsSync(join(packageRoot, "bundles"))) return "npm";
	return "unknown";
}

export function readInstalledStudioVersion(): {
	version: string | null;
	packageRoot: string | null;
	channel: StudioVersionStatus["channel"];
} {
	const packageRoot = findStudioPackageRoot();
	const channel = detectChannel(packageRoot);
	if (!packageRoot) {
		return { version: null, packageRoot: null, channel };
	}
	try {
		const pkg = JSON.parse(
			readFileSync(join(packageRoot, "package.json"), "utf8"),
		) as { version?: string };
		return {
			version: typeof pkg.version === "string" ? pkg.version : null,
			packageRoot,
			channel,
		};
	} catch {
		return { version: null, packageRoot, channel };
	}
}

export async function fetchLatestStudioVersion(): Promise<string | null> {
	try {
		const res = await fetch(`https://registry.npmjs.org/${STUDIO_NPM_PACKAGE}/latest`, {
			headers: { Accept: "application/json" },
			signal: AbortSignal.timeout(12_000),
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { version?: string };
		return typeof data.version === "string" ? data.version : null;
	} catch {
		return null;
	}
}

export function getStudioVersionStatus(): StudioVersionStatus {
	const { version, channel } = readInstalledStudioVersion();
	return {
		installedVersion: version,
		latestVersion: null,
		updateAvailable: null,
		channel,
		busy: false,
	};
}

export async function getStudioVersionStatusDetailed(): Promise<StudioVersionStatus> {
	const base = getStudioVersionStatus();
	const latestVersion = await fetchLatestStudioVersion();
	let updateAvailable: boolean | null = null;
	if (base.installedVersion && latestVersion) {
		updateAvailable = compareSemver(latestVersion, base.installedVersion) > 0;
	}
	return { ...base, latestVersion, updateAvailable };
}

export interface UpdateStudioResult {
	ok: boolean;
	error?: string;
	started?: boolean;
	status?: StudioVersionStatus;
}

/**
 * Download the latest Studio via npx and relaunch it. Releases the IPC socket
 * first so the new process becomes the server instead of focusing this one.
 */
export function startStudioUpdate(): UpdateStudioResult {
	const status = getStudioVersionStatus();
	if (status.channel === "source") {
		return {
			ok: false,
			error:
				"This Studio is running from a source checkout. Pull/build locally, or launch the published package to use in-app update.",
			status,
		};
	}

	const npx = Bun.which("npx") ?? "npx";
	try {
		releaseIpcForRelaunch();
		// Sleep before npx so this process can exit and free the IPC socket /
		// HTTP port; otherwise the new instance would hand off to us.
		const child = spawn(
			"/bin/sh",
			["-c", `sleep 1 && exec "${npx}" -y ${STUDIO_NPM_PACKAGE}@latest`],
			{
				detached: true,
				stdio: "ignore",
				env: process.env,
			},
		);
		child.unref();
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
			status: { ...status, busy: false },
		};
	}

	// Quit after returning the RPC response so the renderer sees `started`.
	setTimeout(() => {
		process.exit(0);
	}, 250);

	return {
		ok: true,
		started: true,
		status: { ...status, busy: true },
	};
}
