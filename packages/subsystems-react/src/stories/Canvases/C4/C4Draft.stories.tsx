import React, { useMemo, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { C4Graph } from '../../../subsystem/C4Graph';
import type { C4ConstructGraph } from '../../../subsystem/C4Graph';
import type { C4Edge, C4Element, C4Model } from '../../../subsystem/c4';
import {
  DRILLDOWN_COMPONENTS,
  DRILLDOWN_PURL,
  DRILLDOWN_TRAILS,
} from '../../../subsystem/__fixtures__/c4Drilldown';

const meta = {
  title: 'Canvases/C4/C4Draft',
  component: C4Graph,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof C4Graph>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// The minimal C4: no accepted containers, no authored components.
//
// Every box is derived from the model itself:
//
//   - one *draft* container per runtime `process` key (members resolve by
//     exact process match, the rule accepted containers use);
//   - a file-less / external process becomes an external system, so lines
//     leaving the boundary have somewhere to land;
//   - lines are the fold of cross-boundary trail steps, labelled by
//     mechanism;
//   - each opened container hosts its member constructs directly, because no
//     C4 component layer exists to group them.
//
// Nothing here claims verification. This is what the API's `source=draft`
// projection looks like: a reading of the model, not a stored decision.
// ---------------------------------------------------------------------------

const SYSTEM = {
  id: 'system:draft',
  label: 'Gist share from Studio',
  repoKey: DRILLDOWN_PURL,
};

const byAlias = new Map(DRILLDOWN_COMPONENTS.map((c) => [c.alias, c]));

/** `local/disk` → `local-disk`; keeps ids readable in the story. */
function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
}

interface DraftElement {
  element: C4Element;
  members: string[];
}

const elements: C4Element[] = [];
const membersByElement = new Map<string, string[]>();
const elementOfAlias = new Map<string, string>();

const byProcess = new Map<string, string[]>();
for (const component of DRILLDOWN_COMPONENTS) {
  const process = component.process?.trim();
  if (!process) continue;
  const list = byProcess.get(process) ?? [];
  list.push(component.alias);
  byProcess.set(process, list);
}

const drafts: DraftElement[] = [];
for (const [process, members] of byProcess) {
  // A process with no grounded code behind it is not a deployable unit: it is
  // the model's way of naming something outside the boundary.
  const fileless = members.every((alias) => !byAlias.get(alias)?.file);
  const external =
    fileless || process.startsWith('external/') || process.startsWith('local/');

  if (external) {
    const element: C4Element = {
      kind: 'external-system',
      id: `external:${slug(process)}`,
      label: process,
      members,
      technology: byAlias.get(members[0] ?? '')?.framework ?? 'external',
      state: 'accepted',
      description: `${members.length} member${members.length === 1 ? '' : 's'} outside the boundary.`,
    };
    elements.push(element);
    drafts.push({ element, members });
    membersByElement.set(element.id, members);
  } else {
    const element: C4Element = {
      kind: 'container',
      id: `container:${slug(process)}`,
      label: process,
      containerKind: members.some((alias) => byAlias.get(alias)?.construct === 'store')
        ? 'data-store'
        : 'application',
      technology: byAlias.get(members[0] ?? '')?.framework ?? '',
      process,
      parentId: SYSTEM.id,
      state: 'accepted',
      description: `${members.length} component${members.length === 1 ? '' : 's'} derived from process ${process}.`,
    };
    elements.push(element);
    drafts.push({ element, members });
    membersByElement.set(element.id, members);
  }
  for (const alias of members) elementOfAlias.set(alias, elements[elements.length - 1]!.id);
}

const containers = drafts.filter((d) => d.element.kind === 'container');
const externals = drafts.filter((d) => d.element.kind === 'external-system');

// Fold cross-boundary trail steps into lines. Same rule the accepted-store
// projection uses; only the membership source differs.
const edges: C4Edge[] = (() => {
  const byKey = new Map<
    string,
    { source: string; target: string; mechanism: string; refs: Map<string, number[]> }
  >();
  for (const trail of DRILLDOWN_TRAILS) {
    trail.steps.forEach((step, index) => {
      const source = elementOfAlias.get(step.from);
      const target = elementOfAlias.get(step.to);
      if (!source || !target || source === target) return;
      const key = [source, target, step.mechanism].join('\0');
      let acc = byKey.get(key);
      if (!acc) {
        acc = { source, target, mechanism: step.mechanism, refs: new Map() };
        byKey.set(key, acc);
      }
      const steps = acc.refs.get(trail.id) ?? [];
      steps.push(index);
      acc.refs.set(trail.id, steps);
    });
  }
  return [...byKey.values()].map((acc) => ({
    id: `e:${slug(acc.source)}-${slug(acc.target)}-${acc.mechanism}`,
    source: acc.source,
    target: acc.target,
    label: acc.mechanism,
    protocol: acc.mechanism,
    mechanisms: [acc.mechanism],
    count: [...acc.refs.values()].reduce((n, steps) => n + steps.length, 0),
    trailRefs: [...acc.refs.entries()].map(([trailId, stepIndices]) => ({
      trailId,
      stepIndices,
    })),
  }));
})();

// No `componentOf`: the constructs nest directly under their container.
const constructGraphByContainer = new Map<string, C4ConstructGraph>();
for (const draft of containers) {
  const members = membersByElement.get(draft.element.id) ?? [];
  constructGraphByContainer.set(draft.element.id, {
    components: members
      .map((alias) => byAlias.get(alias))
      .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    trails: DRILLDOWN_TRAILS,
  });
}

const allContainerIds = containers.map((d) => d.element.id);

function Demo() {
  const [openIds, setOpenIds] = useState<string[]>(allContainerIds);

  const model = useMemo<C4Model>(
    () => ({
      view: 'container',
      system: SYSTEM,
      nodes: elements,
      edges,
      openContainerIds: openIds,
    }),
    [openIds],
  );

  const toggle = (id: string) =>
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].sort(),
    );

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '7px 12px',
          borderBottom: '1px solid #333',
          background: '#1b1b1b',
          color: '#aaa',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
        }}
      >
        <strong style={{ color: '#e3b341' }}>DRAFT</strong>
        <span>
          no accepted containers — {containers.length} derived from process keys,{' '}
          {externals.length} externals, {edges.length} lines
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => setOpenIds(allContainerIds)}>
            Open all
          </button>
          <button type="button" onClick={() => setOpenIds([])}>
            Collapse all
          </button>
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <C4Graph
          model={model}
          onToggleContainer={toggle}
          constructGraphByContainer={constructGraphByContainer}
        />
      </div>
    </div>
  );
}

export const DraftFromProcessKeys: Story = {
  render: () => <Demo />,
};
