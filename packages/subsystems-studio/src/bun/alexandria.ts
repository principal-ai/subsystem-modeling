/**
 * Resolve a tour's repo identity (`owner/name`) to a local checkout on disk via
 * the Alexandria project registry (`~/.alexandria/projects.json`) — the same
 * registry the Principal desktop app writes when you open a repo.
 *
 * Tours render against a whole working tree, but a cached tour only carries the
 * GitHub `owner/repo` it was authored against, never a local path. Alexandria is
 * the system of record that maps that identity back to wherever the repo is
 * cloned, so we read it here rather than guessing or scanning the filesystem.
 *
 * We talk to `ProjectRegistryStore` directly with a tiny node:fs-backed
 * `FileSystemAdapter`. The library ships a richer Node adapter under the `/node`
 * subpath, but that one pulls in `globby` (which the viewer doesn't depend on),
 * and the registry only needs plain file I/O — so we supply our own.
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import {
	basename,
	dirname,
	extname,
	isAbsolute,
	join,
	relative,
} from "node:path";
import {
	ProjectRegistryStore,
	type FileSystemAdapter,
	type ValidatedRepositoryPath,
} from "@principal-ai/alexandria-core-library";

/**
 * Minimal synchronous `FileSystemAdapter`. `ProjectRegistryStore` only reads and
 * writes `~/.alexandria/projects.json`, but the interface is broad, so the
 * less-used methods get straightforward node:fs/path implementations too.
 */
class NodeFsAdapter implements FileSystemAdapter {
	exists(path: string): boolean {
		return existsSync(path);
	}
	readFile(path: string): string {
		return readFileSync(path, "utf8");
	}
	writeFile(path: string, content: string): void {
		writeFileSync(path, content, "utf8");
	}
	deleteFile(path: string): void {
		unlinkSync(path);
	}
	readBinaryFile(path: string): Uint8Array {
		return new Uint8Array(readFileSync(path));
	}
	writeBinaryFile(path: string, content: Uint8Array): void {
		writeFileSync(path, content);
	}
	createDir(path: string): void {
		mkdirSync(path, { recursive: true });
	}
	readDir(path: string): string[] {
		return readdirSync(path);
	}
	deleteDir(path: string): void {
		rmSync(path, { recursive: true, force: true });
	}
	isDirectory(path: string): boolean {
		try {
			return statSync(path).isDirectory();
		} catch {
			return false;
		}
	}
	join(...paths: string[]): string {
		return join(...paths);
	}
	relative(from: string, to: string): string {
		return relative(from, to);
	}
	dirname(path: string): string {
		return dirname(path);
	}
	basename(path: string, ext?: string): string {
		return basename(path, ext);
	}
	extname(path: string): string {
		return extname(path);
	}
	isAbsolute(path: string): boolean {
		return isAbsolute(path);
	}
	normalizeRepositoryPath(inputPath: string): string {
		return inputPath;
	}
	findProjectRoot(inputPath: string): string {
		return inputPath;
	}
	getRepositoryName(repositoryPath: string): string {
		return basename(repositoryPath);
	}
}

let store: ProjectRegistryStore | null = null;
function registry(): ProjectRegistryStore {
	if (!store) store = new ProjectRegistryStore(new NodeFsAdapter(), homedir());
	return store;
}

/**
 * Pull `owner/name` out of a GitHub remote URL — SSH (`git@github.com:o/r.git`)
 * or HTTPS (`https://github.com/o/r.git`). Deliberately hand-rolled rather than
 * reusing `extractPurlFromRemoteUrl`, which returns `null` for repo names that
 * contain a dot (e.g. `Backlog.md`) because it treats the dot as an extension
 * boundary. The capture is non-greedy up to an optional trailing `.git`, so the
 * full name — dots included — survives.
 */
export function githubIdentityFromRemoteUrl(
	url: string,
): { owner: string; name: string } | null {
	const match = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/i);
	if (!match) return null;
	return { owner: match[1], name: match[2] };
}

/**
 * Load all registered repo paths from the Alexandria registry.
 * Returns a Map of filesystem path -> { root, remoteUrl, owner, repo }.
 * Empty map if the registry doesn't exist or is unreadable.
 */
export function loadAlexandriaRepos(): Map<string, { root: string; remoteUrl?: string; owner?: string; repo?: string }> {
	const map = new Map<string, { root: string; remoteUrl?: string; owner?: string; repo?: string }>();
	try {
		const entries = registry().listProjects();
		for (const entry of entries) {
			let owner: string | undefined;
			let repoName: string | undefined;
			const gh = entry.github;
			if (gh?.owner && gh?.name) {
				owner = gh.owner;
				repoName = gh.name;
			} else if (entry.remoteUrl) {
				const identity = githubIdentityFromRemoteUrl(entry.remoteUrl);
				if (identity) {
					owner = identity.owner;
					repoName = identity.name;
				}
			}
			repoName = repoName ?? entry.name;
			map.set(entry.path, { root: entry.path, remoteUrl: entry.remoteUrl, owner, repo: repoName });
		}
	} catch {}
	return map;
}

/**
 * Register a project in the Alexandria registry so future normalization
 * lookups find it via the prefix-match cache instead of walking the fs.
 * Idempotent — same path already registered is a no-op.
 */
export function registerProjectInAlexandria(gitRoot: string, remoteUrl?: string): void {
	try {
		registry().registerProject(gitRoot as ValidatedRepositoryPath, remoteUrl);
	} catch {}
}

export function resolveRepoRootFromAlexandria(
	owner: string,
	name: string,
): string | null {
	const wantOwner = owner.toLowerCase();
	const wantName = name.toLowerCase();

	let entries: Array<{ path: string; remoteUrl?: string }>;
	try {
		entries = registry().listProjects();
	} catch {
		return null;
	}

	for (const entry of entries) {
		if (!entry.remoteUrl) continue;
		const identity = githubIdentityFromRemoteUrl(entry.remoteUrl);
		if (
			identity?.owner.toLowerCase() === wantOwner &&
			identity?.name.toLowerCase() === wantName &&
			existsSync(entry.path)
		) {
			return entry.path;
		}
	}
	return null;
}
