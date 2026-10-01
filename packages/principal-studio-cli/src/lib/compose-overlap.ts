/**
 * Overlap of local subsystem models by code identity.
 *
 * Two models overlap when they both contain the same code component:
 * repo purl (fragment stripped), file, and symbol. That is the join key
 * `mergeSubsystemModels` uses. Externals, custom entities, and file-less
 * code stay model-scoped and do not glue models together.
 *
 * Connected components of that graph are the sets that cannot be split
 * without dropping a shared declaration. Components of size 1, and separate
 * components in the same repo, are already disjoint.
 */

import { purlRepoKey } from './purl-commits.js';

export interface OverlapComponent {
  alias?: string;
  construct?: string;
  file?: string;
  symbol?: string;
  purl?: string;
}

export interface OverlapModel {
  id: string;
  title: string;
  components: OverlapComponent[];
}

export interface OverlapIdentity {
  repoKey: string;
  file: string;
  symbol: string;
  modelIds: string[];
}

export interface OverlapModelRef {
  id: string;
  title: string;
  /** Code components this model contributes in this repo. */
  codeComponents: number;
}

export interface OverlapGroup {
  models: OverlapModelRef[];
  /** Code identities claimed by two or more models in the group. */
  shared: OverlapIdentity[];
  /**
   * Models whose removal splits this group into two or more pieces.
   * Empty for pairs: the shared identities are the whole glue.
   */
  cutModelIds: string[];
}

export interface OverlapRepo {
  repoKey: string;
  groups: OverlapGroup[];
  /** True when the repo's models fall into more than one disjoint group. */
  segregates: boolean;
}

export interface OverlapReport {
  repos: OverlapRepo[];
  /** Models that contribute no code identity in any repo. */
  unscoped: OverlapModelRef[];
}

interface CodeHit {
  repoKey: string;
  file: string;
  symbol: string;
  key: string;
}

const NO_REPO = '(no repo)';

function isNonCode(construct: string | undefined): boolean {
  return construct === 'external' || construct === 'custom_entity';
}

/** Code join key, or null when the component cannot overlap another model. */
export function codeIdentity(component: OverlapComponent): CodeHit | null {
  if (isNonCode(component.construct)) return null;
  const file = (component.file ?? '').trim();
  if (!file) return null;
  const repoKey = purlRepoKey(component.purl) ?? '';
  const symbol = (component.symbol ?? '').trim();
  return {
    repoKey: repoKey || NO_REPO,
    file,
    symbol,
    key: `code\0${repoKey}\0${file}\0${symbol}`,
  };
}

function connectedComponents(modelIds: string[], edges: Array<[string, string]>): string[][] {
  const adj = new Map<string, Set<string>>();
  for (const id of modelIds) adj.set(id, new Set());
  for (const [a, b] of edges) {
    if (a === b) continue;
    adj.get(a)?.add(b);
    adj.get(b)?.add(a);
  }
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const start of modelIds) {
    if (seen.has(start)) continue;
    const stack = [start];
    const group: string[] = [];
    seen.add(start);
    while (stack.length > 0) {
      const id = stack.pop()!;
      group.push(id);
      for (const next of adj.get(id) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    groups.push(group);
  }
  return groups;
}

function cutModels(modelIds: string[], edges: Array<[string, string]>): string[] {
  if (modelIds.length < 3) return [];
  const cuts: string[] = [];
  for (const drop of modelIds) {
    const rest = modelIds.filter((id) => id !== drop);
    const restEdges = edges.filter(([a, b]) => a !== drop && b !== drop);
    if (connectedComponents(rest, restEdges).length > 1) cuts.push(drop);
  }
  return cuts;
}

/**
 * Group models by repo, then by code-identity overlap.
 * Models that touch several repos appear in each of those repos.
 */
export function analyzeComposeOverlap(models: readonly OverlapModel[]): OverlapReport {
  const titleOf = new Map(models.map((m) => [m.id, m.title]));
  const hitsByRepo = new Map<string, Map<string, { hit: CodeHit; modelIds: string[] }>>();
  const codeCount = new Map<string, Map<string, number>>();
  const unscoped: OverlapModelRef[] = [];

  for (const model of models) {
    let coded = 0;
    for (const component of model.components) {
      const hit = codeIdentity(component);
      if (!hit) continue;
      coded++;
      let repoHits = hitsByRepo.get(hit.repoKey);
      if (!repoHits) {
        repoHits = new Map();
        hitsByRepo.set(hit.repoKey, repoHits);
      }
      const existing = repoHits.get(hit.key);
      if (existing) {
        if (!existing.modelIds.includes(model.id)) existing.modelIds.push(model.id);
      } else {
        repoHits.set(hit.key, { hit, modelIds: [model.id] });
      }
      let counts = codeCount.get(hit.repoKey);
      if (!counts) {
        counts = new Map();
        codeCount.set(hit.repoKey, counts);
      }
      counts.set(model.id, (counts.get(model.id) ?? 0) + 1);
    }
    if (coded === 0) {
      unscoped.push({ id: model.id, title: model.title, codeComponents: 0 });
    }
  }

  const repos: OverlapRepo[] = [];
  for (const [repoKey, identities] of hitsByRepo) {
    const counts = codeCount.get(repoKey) ?? new Map<string, number>();
    const modelIds = [...counts.keys()];
    const edges: Array<[string, string]> = [];
    for (const { modelIds: owners } of identities.values()) {
      if (owners.length < 2) continue;
      for (let i = 0; i < owners.length; i++) {
        for (let j = i + 1; j < owners.length; j++) {
          edges.push([owners[i]!, owners[j]!]);
        }
      }
    }
    const components = connectedComponents(modelIds, edges);
    const groups: OverlapGroup[] = components.map((ids) => {
      const idSet = new Set(ids);
      const shared: OverlapIdentity[] = [];
      for (const { hit, modelIds: owners } of identities.values()) {
        const inGroup = owners.filter((id) => idSet.has(id));
        if (inGroup.length < 2) continue;
        shared.push({
          repoKey: hit.repoKey,
          file: hit.file,
          symbol: hit.symbol,
          modelIds: inGroup,
        });
      }
      shared.sort(
        (a, b) =>
          b.modelIds.length - a.modelIds.length ||
          a.file.localeCompare(b.file) ||
          a.symbol.localeCompare(b.symbol),
      );
      const modelsInGroup = ids
        .map((id) => ({
          id,
          title: titleOf.get(id) ?? id,
          codeComponents: counts.get(id) ?? 0,
        }))
        .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
      return {
        models: modelsInGroup,
        shared,
        cutModelIds: cutModels(ids, edges.filter(([a, b]) => idSet.has(a) && idSet.has(b))),
      };
    });
    groups.sort((a, b) => b.models.length - a.models.length || (a.models[0]?.title ?? '').localeCompare(b.models[0]?.title ?? ''));
    repos.push({
      repoKey,
      groups,
      segregates: groups.length > 1,
    });
  }

  repos.sort((a, b) => {
    const an = a.groups.reduce((n, g) => n + g.models.length, 0);
    const bn = b.groups.reduce((n, g) => n + g.models.length, 0);
    return bn - an || a.repoKey.localeCompare(b.repoKey);
  });
  unscoped.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  return { repos, unscoped };
}

function identityLabel(identity: OverlapIdentity): string {
  const symbol = identity.symbol || '(no symbol)';
  return `${identity.file}  ${symbol}`;
}

/** Readable report. `sharedLimit` caps listed identities per group. */
export function formatComposeOverlap(report: OverlapReport, sharedLimit = 12): string {
  const lines: string[] = [];
  lines.push('Code-identity overlap. Externals and file-less nodes are ignored.');
  lines.push('A group is models that share declarations. Separate groups never share one.');
  lines.push('');
  if (report.repos.length === 0 && report.unscoped.length === 0) {
    lines.push('No stored models.');
    return lines.join('\n');
  }
  if (report.repos.length === 0) {
    lines.push('No model contributes a code component.');
  }
  for (const repo of report.repos) {
    const modelCount = repo.groups.reduce((n, g) => n + g.models.length, 0);
    const multi = repo.groups.filter((g) => g.models.length > 1).length;
    const alone = repo.groups.length - multi;
    lines.push(repo.repoKey);
    lines.push(
      `  ${modelCount} model(s), ${repo.groups.length} group(s) (${multi} glued, ${alone} alone)`,
    );
    lines.push(
      modelCount < 2
        ? '  One model. Nothing beside it to fall away from.'
        : repo.segregates
          ? '  Disjoint groups: yes. These groups share no code component.'
          : '  Disjoint groups: no. Every model in this repo is one overlap group.',
    );
    for (const [index, group] of repo.groups.entries()) {
      const kind = group.models.length > 1 ? 'glued' : 'alone';
      lines.push(`  group ${index + 1} (${group.models.length} model(s), ${kind})`);
      for (const model of group.models) {
        lines.push(`    - ${model.title}  ${model.id}  (${model.codeComponents} code)`);
      }
      if (group.shared.length > 0) {
        lines.push(`    shared ${group.shared.length}:`);
        for (const identity of group.shared.slice(0, sharedLimit)) {
          lines.push(
            `      ${identityLabel(identity)}  [${identity.modelIds.length} models]`,
          );
        }
        if (group.shared.length > sharedLimit) {
          lines.push(`      … ${group.shared.length - sharedLimit} more`);
        }
      }
      if (group.cutModelIds.length > 0) {
        const names = group.cutModelIds
          .map((id) => group.models.find((m) => m.id === id)?.title ?? id)
          .join(', ');
        lines.push(`    cut models (removing one splits the group): ${names}`);
      } else if (group.models.length >= 3) {
        lines.push('    no cut model: removing any one model leaves the group connected.');
      }
    }
    lines.push('');
  }
  if (report.unscoped.length > 0) {
    lines.push(`No code identity (${report.unscoped.length}):`);
    for (const model of report.unscoped) {
      lines.push(`  - ${model.title}  ${model.id}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}
