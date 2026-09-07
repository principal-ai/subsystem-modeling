/**
 * Node stub for `bun:sqlite` when bundling the CLI.
 * agent-monitoring's CursorSessionReader imports bun:sqlite; on Node we
 * map that to better-sqlite3 (already an external runtime dep of the CLI).
 */
module.exports = {
	Database: require('better-sqlite3'),
};
