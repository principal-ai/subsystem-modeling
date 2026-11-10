/**
 * Read-only adapters for the on-disk stores Subsystems Studio writes.
 *
 * The CLI audit runs with Studio closed, so it reads the same augmentations,
 * C4 elements, and report files directly. These are transport adapters only —
 * the audit policy itself lives in `@principal-ai/subsystems-core/audit`.
 */

import { existsSync, promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  purlRepoKey,
  sanitizePurlDirName,
  type AuditCallSiteClaim,
  type C4AuditElement,
  type SubsystemModelAuditReport,
} from '@principal-ai/subsystems-core/audit';
import { resolveRepoRootForPurlKey } from './purl-commits.js';
import { subsystemModelFilePath } from './subsystem-model-store.js';

function principalHome(): string {
  const override = process.env['PRINCIPAL_SUBSYSTEM_MODELS_HOME']?.trim();
  return override ? override : homedir();
}

/**
 * Augmentations live under the real home in Studio (no env override), so the
 * CLI reads the same files. Only the model/report stores honor
 * PRINCIPAL_SUBSYSTEM_MODELS_HOME.
 */
function augmentationsRoot(): string {
  const override = process.env['PRINCIPAL_GRAPHIFY_AUGMENTATIONS_HOME']?.trim();
  return override || join(homedir(), '.principal', 'graphify-augmentations');
}

function c4ElementsRoot(): string {
  const override = process.env['PRINCIPAL_C4_ELEMENTS_HOME']?.trim();
  return override || join(homedir(), '.principal', 'c4-elements');
}

function auditsRoot(): string {
  return join(principalHome(), '.principal', 'subsystem-model-audits');
}

// ---------------------------------------------------------------------------
// augmentations
// ---------------------------------------------------------------------------

interface SignatureParamClaim {
  name?: string;
  type: string;
  optional?: boolean;
}

interface SignatureClaim {
  parameters: SignatureParamClaim[];
  returnType?: string;
}

interface SpanClaim {
  startLine: number;
  endLine: number;
  contentHash: string;
}

interface CallSiteClaim {
  lines: { start: number; end: number };
  contentHash: string;
  target: { file: string; symbol: string };
  mechanism: string;
}

interface AugmentationRecord {
  status?: string;
  file?: string;
  symbol?: string;
  claims?: {
    construct?: string;
    signature?: SignatureClaim;
    module?: { module?: string };
    callSite?: CallSiteClaim;
    span?: SpanClaim;
  };
  evidence?: string[];
  resolvedAt?: string;
  provenance?: { at?: string };
}

function augmentationKey(file: string, symbol: string): string {
  const f = file.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  const s = symbol.trim();
  return `${f}::${s}`;
}

async function readAugmentations(purl: string): Promise<AugmentationRecord[]> {
  const key = purlRepoKey(purl) ?? purl.trim();
  if (!key) return [];
  const path = join(augmentationsRoot(), `${sanitizePurlDirName(key)}.json`);
  try {
    const raw = await fs.readFile(path, 'utf8');
    const doc = JSON.parse(raw) as { augmentations?: unknown };
    return Array.isArray(doc.augmentations)
      ? (doc.augmentations as AugmentationRecord[])
      : [];
  } catch {
    return [];
  }
}

/** Newest accepted augmentation for file#symbol, matching Studio's ordering. */
async function acceptedFor(
  purl: string,
  file: string,
  symbol: string,
): Promise<AugmentationRecord[]> {
  if (!file?.trim() || !symbol?.trim()) return [];
  const want = augmentationKey(file, symbol);
  const doc = await readAugmentations(purl);
  return doc
    .filter(
      (a) =>
        a.status === 'accepted' &&
        typeof a.file === 'string' &&
        typeof a.symbol === 'string' &&
        augmentationKey(a.file, a.symbol) === want,
    )
    .sort((a, b) => {
      const at = a.resolvedAt ?? a.provenance?.at ?? '';
      const bt = b.resolvedAt ?? b.provenance?.at ?? '';
      return bt.localeCompare(at);
    });
}

function normalizeSpan(raw: SpanClaim | undefined): SpanClaim | null {
  if (!raw || typeof raw !== 'object') return null;
  const { startLine, endLine, contentHash } = raw;
  if (
    typeof startLine !== 'number' ||
    !Number.isFinite(startLine) ||
    typeof endLine !== 'number' ||
    !Number.isFinite(endLine) ||
    startLine < 1 ||
    endLine < startLine
  )
    return null;
  if (typeof contentHash !== 'string' || !contentHash.trim()) return null;
  return { startLine, endLine, contentHash: contentHash.trim() };
}

function normalizeSignature(raw: SignatureClaim | undefined): SignatureClaim | null {
  if (!raw || typeof raw !== 'object') return null;
  const parameters: SignatureParamClaim[] = [];
  for (const p of Array.isArray(raw.parameters) ? raw.parameters : []) {
    if (!p || typeof p !== 'object') continue;
    const name = typeof p.name === 'string' ? p.name.trim() : '';
    const type = typeof p.type === 'string' ? p.type.trim() : '';
    if (!name && !type) continue;
    const param: SignatureParamClaim = { type };
    if (name) param.name = name;
    if (p.optional === true) param.optional = true;
    parameters.push(param);
  }
  const returnType =
    typeof raw.returnType === 'string' && raw.returnType.trim()
      ? raw.returnType.trim()
      : undefined;
  if (parameters.length === 0 && !returnType) return null;
  return returnType ? { parameters, returnType } : { parameters };
}

function normalizeModuleClaim(
  raw: { module?: string } | undefined,
): { module: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const moduleKey =
    typeof raw.module === 'string'
      ? raw.module.trim().replace(/\\/g, '/')
      : '';
  return moduleKey ? { module: moduleKey } : null;
}

function normalizeCallSite(raw: CallSiteClaim | undefined): CallSiteClaim | null {
  if (!raw || typeof raw !== 'object') return null;
  const lines = raw.lines;
  if (
    !lines ||
    typeof lines.start !== 'number' ||
    typeof lines.end !== 'number' ||
    lines.start < 1 ||
    lines.end < lines.start
  )
    return null;
  if (typeof raw.contentHash !== 'string' || !raw.contentHash.trim())
    return null;
  const target = raw.target;
  if (
    !target ||
    typeof target.file !== 'string' ||
    typeof target.symbol !== 'string'
  )
    return null;
  const targetFile = target.file.trim().replace(/\\/g, '/');
  const targetSymbol = target.symbol.trim();
  if (!targetFile || !targetSymbol) return null;
  if (typeof raw.mechanism !== 'string' || !raw.mechanism.trim()) return null;
  return {
    lines: { start: lines.start, end: lines.end },
    contentHash: raw.contentHash.trim(),
    target: { file: targetFile, symbol: targetSymbol },
    mechanism: raw.mechanism.trim(),
  };
}

export interface VerifyAugmentation {
  claims: {
    span?: SpanClaim;
    construct?: string;
    signature?: SignatureClaim;
  };
  evidence?: string[];
}

export async function findAcceptedSpanAugmentation(input: {
  purl: string;
  file: string;
  symbol: string;
}): Promise<VerifyAugmentation | null> {
  for (const a of await acceptedFor(input.purl, input.file, input.symbol)) {
    const span = normalizeSpan(a.claims?.span);
    if (span)
      return { claims: { span }, evidence: a.evidence };
  }
  return null;
}

export async function findAcceptedConstructAugmentation(input: {
  purl: string;
  file: string;
  symbol: string;
}): Promise<VerifyAugmentation | null> {
  for (const a of await acceptedFor(input.purl, input.file, input.symbol)) {
    const construct = a.claims?.construct?.trim();
    if (construct)
      return { claims: { construct }, evidence: a.evidence };
  }
  return null;
}

export async function findAcceptedSignatureAugmentation(input: {
  purl: string;
  file: string;
  symbol: string;
}): Promise<VerifyAugmentation | null> {
  for (const a of await acceptedFor(input.purl, input.file, input.symbol)) {
    const signature = normalizeSignature(a.claims?.signature);
    if (signature)
      return { claims: { signature }, evidence: a.evidence };
  }
  return null;
}

export async function findAcceptedModuleAugmentation(input: {
  purl: string;
  file: string;
  symbol: string;
  module: string;
}): Promise<unknown | null> {
  const want = normalizeModuleClaim({ module: input.module });
  if (!want) return null;
  for (const a of await acceptedFor(input.purl, input.file, input.symbol)) {
    const claim = normalizeModuleClaim(a.claims?.module);
    if (
      claim &&
      claim.module.replace(/^\.\//, '') ===
        want.module.replace(/^\.\//, '')
    )
      return a;
  }
  return null;
}

export async function findAcceptedCallSiteAugmentation(input: {
  purl: string;
  file: string;
  symbol: string;
  targetFile: string;
  targetSymbol: string;
  mechanism: string;
}): Promise<{ claims: { callSite?: AuditCallSiteClaim } } | null> {
  if (!input.targetFile?.trim() || !input.targetSymbol?.trim()) return null;
  if (!input.mechanism?.trim()) return null;
  const wantTargetFile = input.targetFile.trim().replace(/\\/g, '/');
  const wantTargetSymbol = input.targetSymbol.trim();
  const wantMechanism = input.mechanism.trim();
  for (const a of await acceptedFor(input.purl, input.file, input.symbol)) {
    const claim = normalizeCallSite(a.claims?.callSite);
    if (
      claim &&
      claim.target.file === wantTargetFile &&
      claim.target.symbol === wantTargetSymbol &&
      claim.mechanism === wantMechanism
    ) {
      return {
        claims: {
          callSite: {
            lines: claim.lines,
            contentHash: claim.contentHash,
          },
        },
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// C4 elements
// ---------------------------------------------------------------------------

/** Read one repo's accepted C4 element set. Absent file reads as empty. */
export async function readC4Elements(
  repoKey: string,
): Promise<{ elements: readonly C4AuditElement[] }> {
  const key = purlRepoKey(repoKey) ?? repoKey.trim();
  const path = join(c4ElementsRoot(), `${sanitizePurlDirName(key)}.json`);
  try {
    const raw = await fs.readFile(path, 'utf8');
    const doc = JSON.parse(raw) as { elements?: unknown };
    const elements: C4AuditElement[] = [];
    for (const raw of Array.isArray(doc.elements) ? doc.elements : []) {
      if (!raw || typeof raw !== 'object') continue;
      const e = raw as Record<string, unknown>;
      if (typeof e.id !== 'string' || typeof e.kind !== 'string') continue;
      const state = e.state;
      if (
        state !== 'accepted' &&
        state !== 'proposed' &&
        state !== 'rejected'
      )
        continue;
      elements.push({
        id: e.id,
        kind: e.kind,
        state,
        ...(typeof e.process === 'string' ? { process: e.process } : {}),
        ...(typeof e.label === 'string' ? { label: e.label } : {}),
      });
    }
    return { elements };
  } catch {
    return { elements: [] };
  }
}

// ---------------------------------------------------------------------------
// report persistence + provenance
// ---------------------------------------------------------------------------

export async function persistAuditReport(
  graphId: string,
  report: SubsystemModelAuditReport,
  fingerprint: string,
): Promise<void> {
  const dir = auditsRoot();
  await fs.mkdir(dir, { recursive: true });
  const record = {
    version: 1,
    graphId,
    fingerprint,
    savedAt: new Date().toISOString(),
    report,
  };
  await fs.writeFile(
    join(dir, `${graphId}.json`),
    `${JSON.stringify(record, null, 2)}\n`,
    'utf8',
  );
}

/** Stamp provenance without bumping `updatedAt` (which is the edit marker). */
export async function stampVerifiedCommits(
  graphId: string,
  commits: Record<string, unknown>,
): Promise<void> {
  const path = subsystemModelFilePath(graphId);
  try {
    const doc = JSON.parse(await fs.readFile(path, 'utf8')) as Record<
      string,
      unknown
    >;
    doc.verifiedAtCommits = commits;
    await fs.writeFile(path, JSON.stringify(doc, null, 2), 'utf8');
  } catch {
    /* best-effort provenance */
  }
}

/** True when every referenced file is committed and unmodified. */
export async function referencedFilesClean(
  components: ReadonlyArray<{
    alias?: string;
    file?: string;
    purl?: string;
  }>,
  trails?: ReadonlyArray<{
    steps?: ReadonlyArray<{
      file?: string;
      purl?: string;
      from?: string;
      to?: string;
    }>;
  }>,
): Promise<boolean> {
  const byAlias = new Map(
    components.filter((c) => c.alias).map((c) => [c.alias!, c]),
  );
  const grouped = new Map<string, Set<string>>();
  const add = (purl: string | undefined, file: string | undefined): void => {
    const key = purlRepoKey(purl);
    if (!key || !file) return;
    const set = grouped.get(key) ?? new Set<string>();
    set.add(file);
    grouped.set(key, set);
  };
  for (const c of components) add(c.purl, c.file);
  for (const tl of trails ?? []) {
    for (const step of tl.steps ?? []) {
      const purl =
        step.purl ??
        byAlias.get(step.from ?? '')?.purl ??
        byAlias.get(step.to ?? '')?.purl;
      add(purl, step.file);
    }
  }

  for (const [key, files] of grouped) {
    const root = resolveRepoRootForPurlKey(key);
    if (!root) continue;
    const paths = [...files].filter((f) => f.length > 0);
    if (paths.length === 0) continue;
    const status = spawnSync(
      'git',
      ['-C', root, 'status', '--porcelain=v1', '--', ...paths],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    if (status.status !== 0) return false;
    if ((status.stdout ?? '').trim() !== '') return false;
  }
  return true;
}

/** Mechanical file-presence check for the whole model. */
export async function verifyModelFiles(model: {
  components: ReadonlyArray<{ alias: string; file?: string; purl?: string }>;
}): Promise<{
  missing: Array<{ componentAlias: string }>;
  missingCount: number;
}> {
  const missing: Array<{ componentAlias: string }> = [];
  for (const c of model.components) {
    if (!c.file) continue;
    const key = purlRepoKey(c.purl);
    const root = key ? resolveRepoRootForPurlKey(key) : undefined;
    if (!root) continue; // unresolved checkout, not a missing file
    if (!existsSync(join(root, c.file))) {
      missing.push({ componentAlias: c.alias });
    }
  }
  return { missing, missingCount: missing.length };
}
