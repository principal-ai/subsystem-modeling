/**
 * Multi-repo path handling for subsystem graphs.
 *
 * A component's `file` is relative to ITS OWN repo root — the repo identified
 * by its `purl` (`pkg:github/<owner>/<name>[#<path>]`) — never to the machine.
 * When a graph spans several repos the sidebar tree needs synthetic
 * `<owner>/<name>/` prefixes to keep same-named paths apart; hosts resolve
 * each file against `repoRoots[purlRepo] ?? repoRoot`.
 */

/** Normalize a purl to its repo key: fragment and surrounding whitespace stripped. */
export function purlRepoKey(purl: string | undefined): string | undefined {
  if (!purl) return undefined;
  const base = purl.split('#')[0]?.trim();
  return base || undefined;
}

/** `owner/name` from a purl (`pkg:github/acme/widget#x/y.ts` → `acme/widget`). */
export function purlOwnerName(purl: string | undefined): string | undefined {
  const key = purlRepoKey(purl);
  if (!key) return undefined;
  // pkg:<type>/<owner>/<name> → take the last two segments.
  const parts = key.split('/').filter(Boolean);
  if (parts.length < 2) return undefined;
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

export interface TreeEntry {
  /** Path as shown in the sidebar tree (repo-prefixed when multi-repo). */
  displayPath: string;
  /** The component's own file value — what hosts resolve + drawers open. */
  file: string;
}

export interface TreePathMapping {
  entries: TreeEntry[];
  /** True when components span more than one repo (prefixes are shown). */
  multiRepo: boolean;
  /** displayPath → file. */
  toFile: Map<string, string>;
  /** file → displayPath (first component wins). */
  toDisplay: Map<string, string>;
}

/**
 * Build the sidebar tree's path set from components. Single-repo graphs (and
 * purl-less components) keep bare `file` values; mixed-repo graphs prefix each
 * entry with its purl's `owner/name` so the tree groups by repo.
 */
export function buildTreePathMapping(components: ReadonlyArray<{ file?: string; purl?: string }>): TreePathMapping {
  const withFiles = components.filter((c) => c.file);
  const repos = new Set(
    withFiles.map((c) => purlRepoKey(c.purl)).filter((k): k is string => !!k),
  );
  const multiRepo = repos.size > 1;

  const entries: TreeEntry[] = [];
  const toFile = new Map<string, string>();
  const toDisplay = new Map<string, string>();
  for (const c of withFiles) {
    const ownerName = multiRepo ? purlOwnerName(c.purl) : undefined;
    const displayPath = ownerName ? `${ownerName}/${c.file}` : c.file!;
    if (toFile.has(displayPath)) continue;
    entries.push({ displayPath, file: c.file! });
    toFile.set(displayPath, c.file!);
    if (!toDisplay.has(c.file!)) toDisplay.set(c.file!, displayPath);
  }
  return { entries, multiRepo, toFile, toDisplay };
}

// ---------------------------------------------------------------------------
// Per-repo tree grouping — one sidebar tree per repo, each under its own
// styled header (owner avatar + repo name).
// ---------------------------------------------------------------------------

export interface RepoGroup {
  /** Purl repo key (`pkg:github/owner/name`) — undefined for purl-less components. */
  repoKey?: string;
  /** `owner` segment of the purl, when present. */
  owner?: string;
  /** Repository name segment of the purl, when present. */
  repo?: string;
  /** The group's files, bare `file` values (each tree scopes its own paths). */
  entries: TreeEntry[];
}

/**
 * Group components by repo for the multi-tree sidebar. Groups preserve
 * first-appearance order; purl-less components land in a trailing unbadged
 * group. Entries carry bare `file` values — separate trees scope their own
 * path sets, so no synthetic prefixes are needed.
 */
export function buildRepoGroups(components: ReadonlyArray<{ file?: string; purl?: string }>): {
  multiRepo: boolean;
  groups: RepoGroup[];
} {
  const withFiles = components.filter((c) => c.file);
  const repos = new Set(
    withFiles.map((c) => purlRepoKey(c.purl)).filter((k): k is string => !!k),
  );
  const multiRepo = repos.size > 1;

  const byKey = new Map<string, RepoGroup>();
  const order: Array<string | undefined> = [];
  for (const c of withFiles) {
    const key = purlRepoKey(c.purl);
    let group = byKey.get(key ?? '');
    if (!group) {
      const ownerName = key ? purlOwnerName(c.purl) : undefined;
      const [owner, repo] = ownerName?.split('/') ?? [];
      group = { repoKey: key, owner, repo, entries: [] };
      byKey.set(key ?? '', group);
      order.push(key);
    }
    if (!group.entries.some((e) => e.file === c.file)) {
      group.entries.push({ displayPath: c.file!, file: c.file! });
    }
  }
  return { multiRepo, groups: order.map((k) => byKey.get(k ?? '')!) };
}

/** GitHub owner-avatar URL for a purl, or undefined for non-github hosts. */
export function repoAvatarUrl(purl: string | undefined): string | undefined {
  const key = purlRepoKey(purl);
  const match = key?.match(/^pkg:github\/([^/]+)\//);
  return match ? `https://github.com/${match[1]}.png?size=64` : undefined;
}
