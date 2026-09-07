/**
 * Mirror of graphify/ids.py — NFKC + casefold-ish + non-word → `_`.
 *
 * Definition node ids are `makeId(fileStem, ...symbolParts)`. Stub ids are
 * intentionally different (name-only / `ref_…`); this module is for the
 * definition path used by component anchoring.
 */

/** Normalize one id string to graphify's canonical form. */
export function normalizeGraphifyId(s: string): string {
	let out = s.normalize("NFKC");
	// JS has no Unicode casefold; lowercasing + second NFKC is close enough
	// for the Latin/ASCII identifiers we resolve in practice.
	out = out.toLowerCase().normalize("NFKC");
	out = out.replace(/[^\w]+/gu, "_");
	out = out.replace(/_+/g, "_");
	return out.replace(/^_|_$/g, "");
}

/** Build a canonical node id from path/symbol parts (graphify `make_id`). */
export function makeGraphifyId(...parts: string[]): string {
	const joined = parts
		.filter((p) => typeof p === "string" && p.length > 0)
		.map((p) => p.replace(/^[_.]+|[_.]+$/g, ""))
		.filter(Boolean)
		.join("_");
	return normalizeGraphifyId(joined);
}

/**
 * File stem used as the node-id prefix (graphify `_file_stem`):
 * full path with extension dropped, posix separators.
 */
export function graphifyFileStem(file: string): string {
	const posix = file.replace(/\\/g, "/").replace(/^\.\//, "");
	const lastSlash = posix.lastIndexOf("/");
	const base = lastSlash >= 0 ? posix.slice(lastSlash + 1) : posix;
	const dir = lastSlash >= 0 ? posix.slice(0, lastSlash + 1) : "";
	if (!base || base === ".") return "";
	const dot = base.lastIndexOf(".");
	const stemBase = dot > 0 ? base.slice(0, dot) : base;
	return `${dir}${stemBase}`;
}

/** Normalize a repo-relative path for source_file comparison. */
export function normalizeSourcePath(file: string): string {
	return file.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}
