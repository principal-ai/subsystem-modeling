/**
 * One-shot renames for on-disk stores that lived under the old
 * `trail-viewer-*` filenames. Called before first read of each store.
 */

import { existsSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PRINCIPAL_DIR = join(homedir(), ".principal");

/** Rename `~/.principal/<legacy>` → `nextPath` when the new file is absent. */
export function migrateLegacyStoreFile(
	legacyFileName: string,
	nextPath: string,
): void {
	if (existsSync(nextPath)) return;
	const legacyPath = join(PRINCIPAL_DIR, legacyFileName);
	if (!existsSync(legacyPath)) return;
	try {
		renameSync(legacyPath, nextPath);
		console.log(
			`[principal-studio] migrated ${legacyFileName} → ${nextPath}`,
		);
	} catch (err) {
		console.warn(
			`[principal-studio] could not migrate ${legacyFileName}: ${(err as Error).message}`,
		);
	}
}
