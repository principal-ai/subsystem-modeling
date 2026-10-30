import type { C4Element, C4Model } from './c4';
import type { SubsystemDecoration } from './decoration';

/**
 * Project a decoration's C4 additions without mutating the base architecture.
 * Hosts resolve trail highlighting and construct membership separately.
 * Invalid additions fail rather than replacing base elements or drawing dangling lines.
 */
export function applyDecorationC4(
  base: C4Model,
  decoration: SubsystemDecoration,
  active = true,
): C4Model {
  const draft = decoration.draft?.c4;
  if (!active || !draft) return base;

  const ids = new Set([base.system.id, ...base.nodes.map((node) => node.id)]);
  const additions: C4Element[] = (draft.elements ?? []).map((element) => {
    if (ids.has(element.id)) throw new Error(`Duplicate C4 element id: ${element.id}`);
    ids.add(element.id);
    return {
      ...element,
      state: 'proposed',
      ...(element.kind === 'container' ? { parentId: element.parentId ?? base.system.id } : {}),
    };
  });
  const nodes = [...base.nodes, ...additions];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const element of additions) {
    if (element.kind === 'component') {
      if (byId.get(element.container)?.kind !== 'container') {
        throw new Error(`Missing C4 container for ${element.id}: ${element.container}`);
      }
      if (element.parentId && element.parentId !== element.container) {
        throw new Error(`Conflicting C4 parent for ${element.id}`);
      }
    } else if (element.kind === 'container' && element.parentId !== base.system.id) {
      throw new Error(`Unknown C4 system for ${element.id}: ${element.parentId}`);
    } else if (
      (element.kind === 'external-system' || element.kind === 'person') &&
      element.parentId
    ) {
      throw new Error(`External C4 element cannot have a parent: ${element.id}`);
    }
  }

  const edgeIds = new Set(base.edges.map((edge) => edge.id));
  for (const edge of draft.edges ?? []) {
    if (edgeIds.has(edge.id)) throw new Error(`Duplicate C4 edge id: ${edge.id}`);
    edgeIds.add(edge.id);
    if (!byId.has(edge.source) || !byId.has(edge.target)) {
      throw new Error(`Missing C4 endpoint for edge: ${edge.id}`);
    }
  }
  return {
    ...base,
    nodes,
    edges: [...base.edges, ...(draft.edges ?? []).map((edge) => ({ ...edge, draft: true }))],
  };
}
