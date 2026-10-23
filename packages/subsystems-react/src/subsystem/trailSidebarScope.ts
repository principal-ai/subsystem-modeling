import type { SubsystemComponent, SubsystemTrail } from './model';
import type { SubsystemIssue } from './IssueList';
import { buildTreePathMapping, purlOwnerName, purlRepoKey, type TreePathMapping } from './paths';

export interface TrailSidebarScope {
  trail: SubsystemTrail | null;
  treePaths: TreePathMapping;
  issues: SubsystemIssue[];
}

/** Scope sidebar content to a trail's endpoints and authored source sites. */
export function buildTrailSidebarScope(
  components: SubsystemComponent[],
  trails: SubsystemTrail[] | undefined,
  issues: SubsystemIssue[] | undefined,
  trailId: string | null,
): TrailSidebarScope {
  const trail = trails?.find((item) => item.id === trailId) ?? null;
  if (!trail) {
    return { trail: null, treePaths: buildTreePathMapping(components), issues: issues ?? [] };
  }
  const aliases = new Set(trail.steps.flatMap((step) => [step.from, step.to]));
  const participants = components.filter((component) => aliases.has(component.alias));
  const files: Array<{ file?: string; purl?: string }> = [...participants];
  for (const step of trail.steps) {
    files.push(step);
    if (step.target) files.push(step.target);
  }
  const modules = new Set(participants.map((component) => component.module?.trim()).filter(Boolean));
  const processes = new Set(participants.map((component) => component.process).filter(Boolean));
  const repos = new Set(files.flatMap((file) =>
    [purlRepoKey(file.purl), purlOwnerName(file.purl)].filter((key): key is string => !!key),
  ));
  const scopedIssues = (issues ?? []).filter((issue) => {
    const target = issue.target;
    if (!target) return false;
    const key = target.id ?? target.label;
    switch (target.kind) {
      case 'component': {
        const component = components.find((candidate) =>
          candidate.alias === target.id || candidate.alias === target.label ||
          candidate.name === target.label || candidate.symbol === target.label,
        );
        return component != null && aliases.has(component.alias);
      }
      case 'trail':
        return target.id != null ? target.id === trail.id : target.label === trail.title;
      case 'step':
        return target.id === trail.id && target.stepIndex != null &&
          Number.isInteger(target.stepIndex) && trail.steps[target.stepIndex] != null;
      case 'module':
        return modules.has(key);
      case 'process':
        return processes.has(key);
      case 'repo':
        return repos.has(purlRepoKey(key) ?? key);
      default:
        return false;
    }
  });
  return { trail, treePaths: buildTreePathMapping(files), issues: scopedIssues };
}
