/**
 * Authored C4 sketches — the types shared by the sketch view and the host
 * stores.
 *
 * These live in `subsystems-react` so the pure view and its Storybook fixtures
 * can use them without importing Studio's cross-process contract.
 */

import type { C4Model } from './c4';

/**
 * A C4 sketch — an authored, unverified architecture hypothesis.
 *
 * Unlike the accepted element store (approved containers only) and a model
 * projection (derived from `process` keys), a sketch carries containers,
 * components, externals, persons, AND edges. It can exist before any subsystem
 * model does. Element state is forced to `proposed` by the host store: a sketch
 * never claims acceptance.
 */
export interface C4Sketch {
  id: string;
  title: string;
  /** Repos the sketch claims to describe; can be empty for greenfield. */
  repoKeys: string[];
  /** Authored nodes + edges. */
  model: C4Model;
  author?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight row for listing sketches without their nodes/edges. */
export interface C4SketchSummary {
  id: string;
  title: string;
  repoKeys: string[];
  author?: string;
  createdAt: string;
  updatedAt: string;
  counts: {
    containers: number;
    components: number;
    externals: number;
    persons: number;
    edges: number;
  };
}

/** Which C4 source a model projection or tab reads. */
export type SubsystemC4Source = 'auto' | 'accepted' | 'draft';

/**
 * A drawable C4 projection for one subsystem model.
 *
 * `accepted` uses the repo's approved containers; `draft` derives provisional
 * containers from the model's `process` keys. `memberships` is element id →
 * component aliases, so a view can build construct graphs without re-deriving
 * the join.
 */
export interface SubsystemC4Projection {
  model: C4Model;
  source: 'accepted' | 'draft';
  memberships: Record<string, string[]>;
  counts: {
    containers: number;
    externals: number;
    edges: number;
    components: number;
    unassignedComponents: number;
    unbackedProcesses: number;
  };
  repos: string[];
  /** Aliases of components that state no `process`. */
  unassignedComponents: string[];
  /** Container-shaped process keys no accepted container claims (accepted source only). */
  unbackedProcesses: string[];
}
