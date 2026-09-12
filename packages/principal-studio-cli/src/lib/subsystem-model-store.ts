/**
 * Local subsystem-model store — same on-disk layout as Principal Studio:
 * `~/.principal/subsystem-models/<id>.json` + `_index.json`.
 *
 * Lets the CLI create/list models without Studio's HTTP bridge running.
 * Structural validation mirrors the Studio POST gate (construct / mechanism /
 * walkthroughs / detail provenance). File/symbol verification is Studio-only
 * for now and may be empty on CLI-created records until opened/updated there.
 */

import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { deriveGraphEdges } from '@principal-ai/subsystems-core';

const ROOT = join(homedir(), '.principal', 'subsystem-models');
const INDEX_PATH = join(ROOT, '_index.json');

export const SUBSYSTEM_EDGE_MECHANISMS = [
  'imports',
  'calls',
  'extends',
  'inherits',
  'implements',
  'mixes_in',
  'uses',
  'method',
  'references',
  'contains',
  'feeds',
  'produces',
  'writes',
  'reads',
  'watches',
  'registers-into',
] as const;

export const SUBSYSTEM_COMPONENT_CONSTRUCTS = [
  'class',
  'function',
  'method',
  'interface',
  'type_alias',
  'enum',
  'store',
  'external',
  'custom_entity',
] as const;

export const SUBSYSTEM_DECLARATION_PROVENANCES = ['verified', 'authored'] as const;

export interface SubsystemModelIndexEntry {
  id: string;
  title: string;
  description?: string;
  componentCount: number;
  edgeCount: number;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  fileName: string;
  source?: string;
  repo?: { owner: string; name: string };
  /** Host-only gist link mirrored from the record. */
  gist?: { id: string; fileName?: string };
}

interface IndexFile {
  version: number;
  entries: SubsystemModelIndexEntry[];
}

export interface StoredSubsystemModel {
  id: string;
  title: string;
  description?: string;
  components: unknown[];
  relations: unknown[];
  walkthroughs?: unknown[];
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  source?: string;
  repo?: { owner: string; name: string };
  repoRoot?: string;
  repoRoots?: Record<string, string>;
  /** Host-only GitHub gist link (not portable). */
  gist?: { id: string; fileName?: string };
  verification?: unknown;
}

export interface CreateSubsystemModelInput {
  title: string;
  description?: string;
  components: unknown[];
  relations: unknown[];
  walkthroughs?: unknown[];
  source?: string;
  repo?: { owner: string; name: string };
  repoRoot?: string;
  repoRoots?: Record<string, string>;
}

function graphId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 11);
  return `sg-${ts}-${rand}`;
}

function graphPath(id: string): string {
  return join(ROOT, `${id}.json`);
}

export function subsystemModelFilePath(id: string): string {
  return graphPath(id);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(ROOT, { recursive: true });
}

const SUBSYSTEM_RELATION_TYPES = [
  'imports', 'extends', 'inherits',
  'implements', 'mixes_in', 'method', 'references', 'contains',
] as const;

const SUBSYSTEM_WALKTHROUGH_MECHANISMS = [
  'calls', 'uses', 'feeds', 'produces', 'writes', 'reads', 'watches', 'registers-into',
] as const;

export function findRelationTypeProblems(relations: unknown): string[] {
  if (!Array.isArray(relations)) return ['relations must be an array'];
  const problems: string[] = [];
  for (const rel of relations) {
    const r = rel as { id?: unknown; from?: unknown; to?: unknown; relationType?: unknown } | null;
    if (typeof r?.id !== 'string' || !r.id.trim()) {
      problems.push(`relation ${JSON.stringify(r?.id ?? '<no id>')}: id is required`);
    }
    if (typeof r?.from !== 'string' || !r.from.trim()) {
      problems.push(`relation ${JSON.stringify(r?.id ?? '<no id>')}: from is required`);
    }
    if (typeof r?.to !== 'string' || !r.to.trim()) {
      problems.push(`relation ${JSON.stringify(r?.id ?? '<no id>')}: to is required`);
    }
    if (
      typeof r?.relationType !== 'string' ||
      !(SUBSYSTEM_RELATION_TYPES as readonly string[]).includes(r.relationType)
    ) {
      problems.push(
        `relation ${JSON.stringify(r?.id ?? '<no id>')}: unknown relationType ${JSON.stringify(r?.relationType)}`,
      );
    }
  }
  return problems;
}

export function findWalkthroughProblems(walkthroughs: unknown): string[] {
  if (walkthroughs === undefined) return [];
  if (!Array.isArray(walkthroughs)) return ['walkthroughs must be an array'];
  const problems: string[] = [];
  for (const wt of walkthroughs) {
    const w = wt as { id?: unknown; title?: unknown; steps?: unknown } | null;
    const label = JSON.stringify(w?.id ?? '<no id>');
    if (typeof w?.id !== 'string' || !w.id.trim()) {
      problems.push(`walkthrough ${label}: id is required`);
      continue;
    }
    if (typeof w?.title !== 'string' || !w.title.trim()) {
      problems.push(`walkthrough ${label}: title is required`);
    }
    if (!Array.isArray(w.steps)) {
      problems.push(`walkthrough ${label}: steps array is required`);
      continue;
    }
    w.steps.forEach((step, i) => {
      const s = step as {
        from?: unknown;
        to?: unknown;
        mechanism?: unknown;
        file?: unknown;
        line?: unknown;
      } | null;
      if (typeof s?.from !== 'string' || !s.from.trim()) {
        problems.push(`walkthrough ${label}: step ${i} from is required`);
      }
      if (typeof s?.to !== 'string' || !s.to.trim()) {
        problems.push(`walkthrough ${label}: step ${i} to is required`);
      }
      if (
        typeof s?.mechanism !== 'string' ||
        !(SUBSYSTEM_WALKTHROUGH_MECHANISMS as readonly string[]).includes(s.mechanism)
      ) {
        problems.push(`walkthrough ${label}: step ${i} unknown mechanism ${JSON.stringify(s?.mechanism)}`);
      }
      if (typeof s?.file !== 'string' || !s.file.trim()) {
        problems.push(`walkthrough ${label}: step ${i} file is required`);
      } else if (typeof s?.line !== 'number' || !Number.isInteger(s.line) || s.line < 1) {
        problems.push(`walkthrough ${label}: step ${i} line must be a positive 1-based integer`);
      }
    });
  }
  return problems;
}

export function findComponentConstructProblems(components: unknown): string[] {
  if (!Array.isArray(components)) return [];
  const problems: string[] = [];
  for (const component of components) {
    const c = component as { id?: unknown; construct?: unknown } | null;
    if (
      typeof c?.construct === 'string' &&
      (SUBSYSTEM_COMPONENT_CONSTRUCTS as readonly string[]).includes(c.construct)
    ) {
      continue;
    }
    problems.push(
      `component ${JSON.stringify(c?.id ?? '<no id>')}: invalid construct ${JSON.stringify(c?.construct)} — allowed: ${SUBSYSTEM_COMPONENT_CONSTRUCTS.join(', ')}. A module is its own subsystem: anchor to a concrete export (symbol + file), or publish it as a separate graph and reference it.`,
    );
  }
  return problems;
}

export function findDeclarationProvenanceProblems(components: unknown): string[] {
  if (!Array.isArray(components)) return [];
  const problems: string[] = [];
  for (const component of components) {
    const c = component as Record<string, unknown> | null;
    if (!c || typeof c !== 'object') continue;
    if (!c['declaration']) continue;
    const p = c['declarationProvenance'];
    if (p === undefined) continue;
    if (
      typeof p === 'string' &&
      (SUBSYSTEM_DECLARATION_PROVENANCES as readonly string[]).includes(p)
    ) {
      continue;
    }
    problems.push(
      `component ${JSON.stringify(String(c['id'] ?? '<no id>'))}: invalid declarationProvenance ${JSON.stringify(p)} — allowed: ${SUBSYSTEM_DECLARATION_PROVENANCES.join(', ')}. Hand-authored declarations must be "authored"; "verified" is reserved for tool-extracted data.`,
    );
  }
  return problems;
}

export function normalizeDeclarationProvenance(components: unknown): void {
  if (!Array.isArray(components)) return;
  for (const component of components) {
    const c = component as Record<string, unknown> | null;
    if (!c || typeof c !== 'object') continue;

    const declaration = c['declaration'] as Record<string, unknown> | undefined;
    if (!declaration || typeof declaration !== 'object') {
      delete c['declarationProvenance'];
      continue;
    }
    const p = c['declarationProvenance'];
    if (p !== 'verified' && p !== 'authored') c['declarationProvenance'] = 'authored';
    const kind = declaration['kind'];
    const arrays: Record<string, string[]> = {
      function: ['parameters', 'callers', 'callees'],
      method: ['parameters'],
      class: ['methods', 'properties', 'extends', 'implements', 'instantiations', 'references'],
      type: ['properties', 'usedBy', 'implementors'],
      module: ['imports', 'exports', 'symbols'],
      custom_entity: ['attributes'],
      store: ['properties'],
    };
    for (const key of arrays[String(kind)] ?? []) {
      if (!Array.isArray(declaration[key])) declaration[key] = [];
    }
  }
}

export function isRepoRoots(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((v) => typeof v === 'string');
}

/** Structural problems that would make Studio reject a POST (empty = valid). */
export function findCreateProblems(body: Record<string, unknown>): string[] {
  const problems: string[] = [];
  if (!body['title'] || typeof body['title'] !== 'string') {
    problems.push('title is required');
  }
  if (!Array.isArray(body['components'])) {
    problems.push('components array is required');
  }
  if (!Array.isArray(body['relations'])) {
    problems.push('relations array is required');
  }
  if (problems.length > 0) return problems;
  return [
    ...findComponentConstructProblems(body['components']),
    ...findDeclarationProvenanceProblems(body['components']),
    ...findRelationTypeProblems(body['relations']),
    ...findWalkthroughProblems(body['walkthroughs']),
  ];
}

function indexEntryFor(record: StoredSubsystemModel): SubsystemModelIndexEntry {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    componentCount: record.components.length,
    edgeCount: deriveGraphEdges({
      relations: record.relations as Parameters<typeof deriveGraphEdges>[0]['relations'],
      walkthroughs: record.walkthroughs as Parameters<typeof deriveGraphEdges>[0]['walkthroughs'],
    }).length,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastOpenedAt: record.lastOpenedAt,
    fileName: `${record.id}.json`,
    source: record.source,
    repo: record.repo,
    gist: record.gist,
  };
}

async function readIndex(): Promise<SubsystemModelIndexEntry[]> {
  try {
    const raw = await fs.readFile(INDEX_PATH, 'utf8');
    const idx = JSON.parse(raw) as IndexFile;
    if (idx.version === 1) return idx.entries;
  } catch {
    // missing / corrupt → rebuild
  }
  return rebuildIndex();
}

async function writeIndex(entries: SubsystemModelIndexEntry[]): Promise<void> {
  await ensureDir();
  const idx: IndexFile = { version: 1, entries };
  await fs.writeFile(INDEX_PATH, JSON.stringify(idx, null, 2), 'utf8');
}

async function upsertIndexEntry(entry: SubsystemModelIndexEntry): Promise<void> {
  const entries = await readIndex();
  const idx = entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  await writeIndex(entries);
}

async function rebuildIndex(): Promise<SubsystemModelIndexEntry[]> {
  await ensureDir();
  const entries: SubsystemModelIndexEntry[] = [];
  let files;
  try {
    files = await fs.readdir(ROOT, { withFileTypes: true });
  } catch {
    return entries;
  }
  for (const f of files) {
    if (!f.isFile() || !f.name.endsWith('.json') || f.name === '_index.json') continue;
    try {
      const raw = await fs.readFile(join(ROOT, f.name), 'utf8');
      const graph = JSON.parse(raw) as StoredSubsystemModel;
      entries.push(indexEntryFor(graph));
    } catch {
      // skip corrupt files
    }
  }
  entries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  await writeIndex(entries);
  return entries;
}

export async function listSubsystemModels(): Promise<SubsystemModelIndexEntry[]> {
  return readIndex();
}

export async function getSubsystemModel(id: string): Promise<StoredSubsystemModel | null> {
  try {
    const raw = await fs.readFile(graphPath(id), 'utf8');
    return JSON.parse(raw) as StoredSubsystemModel;
  } catch {
    return null;
  }
}

export async function createSubsystemModel(
  doc: CreateSubsystemModelInput,
): Promise<StoredSubsystemModel> {
  await ensureDir();
  normalizeDeclarationProvenance(doc.components);
  const now = new Date().toISOString();
  const record: StoredSubsystemModel = {
    ...doc,
    id: graphId(),
    createdAt: now,
    updatedAt: now,
  };
  await fs.writeFile(graphPath(record.id), JSON.stringify(record, null, 2), 'utf8');
  await upsertIndexEntry(indexEntryFor(record));
  return record;
}

/** Patch an existing record (e.g. stamp a host gist ref after share). */
export async function updateSubsystemModel(
  id: string,
  patch: Partial<
    Pick<
      StoredSubsystemModel,
      | 'title'
      | 'description'
      | 'components'
      | 'relations'
      | 'walkthroughs'
      | 'source'
      | 'repo'
      | 'repoRoot'
      | 'repoRoots'
      | 'gist'
    >
  >,
): Promise<StoredSubsystemModel | null> {
  const existing = await getSubsystemModel(id);
  if (!existing) return null;
  if (patch.components !== undefined) normalizeDeclarationProvenance(patch.components);
  const updated: StoredSubsystemModel = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(graphPath(id), JSON.stringify(updated, null, 2), 'utf8');
  await upsertIndexEntry(indexEntryFor(updated));
  return updated;
}
