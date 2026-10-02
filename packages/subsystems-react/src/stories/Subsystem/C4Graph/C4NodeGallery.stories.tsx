import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme, useTheme } from '@principal-ade/industry-theme';
import { C4NodeCard, nodeStyle, nodeSubtitle, nodeTag, nodeMissing, NODE_W } from '../../../subsystem/C4NodeCard';
import type { C4Node, C4ElementType } from '../../../subsystem/toC4';

// ---------------------------------------------------------------------------
// A card gallery: every C4 box variant, outside the graph.
//
// The graph answers "what does this system look like". This answers "what does
// a box MEAN" — which encoding maps to which C4 concept, and which gaps the
// notation still wants filled.
//
// Rendering the card directly (not through React Flow) is the point: the node
// is a plain presentational component, so it can be reviewed and diffed
// without a layout engine in the way.
// ---------------------------------------------------------------------------

const meta = {
  title: 'Subsystem/C4Graph/C4NodeGallery',
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// --- sample nodes ---------------------------------------------------------

function node(over: Partial<C4Node> & { id: string; label: string }): C4Node {
  return {
    kind: 'container',
    members: [],
    constructs: [],
    isStore: false,
    ...over,
  };
}

const CONFIRMED = {
  id: 'container:studio-host',
  label: 'Studio Host',
  type: 'application' as C4ElementType,
  technology: 'Bun + Electrobun',
  description: 'Runs the audit pipeline, owns the model store, serves the RPC surface.',
  state: 'accepted' as const,
};

const VARIANTS: Array<{ group: string; note: string; node: C4Node }> = [
  // `id` on each variant is its caption key, not a component field.
  // --- confirmation state: the axis that matters most --------------------
  {
    group: 'Confirmation state',
    note: 'The whole point of the association layer. Solid = a person signed off. Dashed = an agent asked, nobody answered. Muted = raw derivation, never reviewed.',
    node: node({
      id: 'a1',
      label: 'subsystems-studio/host',
      key: 'subsystems-studio/host',
      members: ['a', 'b', 'c'],
      constructs: ['function', 'store'],
      decoration: CONFIRMED,
    }),
  },
  {
    group: '',
    note: '',
    node: node({
      id: 'a2',
      label: 'subsystems-core/types',
      key: 'subsystems-core/types',
      members: ['x', 'y'],
      constructs: ['interface', 'type_alias'],
      decoration: {
        id: 'container:subsystems-core/types',
        label: 'subsystems-core/types',
        type: 'library',
        state: 'proposed',
      },
    }),
  },
  {
    group: '',
    note: '',
    node: node({
      id: 'a3',
      label: 'principal-studio-cli',
      key: 'principal-studio-cli',
      members: ['cli-create'],
      constructs: ['function'],
    }),
  },
  {
    group: '',
    note: '',
    node: node({
      id: 'a4',
      label: 'graphify/extract',
      key: 'graphify/extract',
      members: ['extract'],
      constructs: ['function'],
      decoration: {
        id: 'container:graphify/extract',
        label: 'graphify/extract',
        type: 'application',
        state: 'rejected',
      },
    }),
  },
  {
    group: '',
    note: '',
    node: node({ id: 'a5', label: 'Studio Host', key: 'p1 + p2', sourceKeys: ['p1', 'p2'], members: ['a'], constructs: ['function'], decoration: CONFIRMED }),
  },

  // --- C4 element type ----------------------------------------------------
  {
    group: 'C4 element type',
    note: 'C4 requires a type on every element. The document has no such field, so this is always a confirmation.',
    node: node({
      id: 'b1',
      label: 'Subsystem model store',
      members: ['s1'],
      constructs: ['store'],
      decoration: { id: 'container:ds', label: 'Subsystem model store', type: 'data-store', technology: 'JSON files on disk', state: 'accepted', description: 'Every stored model plus its index.' },
    }),
  },
  {
    group: '',
    note: '',
    node: node({
      id: 'b2',
      label: 'Audit correction queue',
      members: ['s2'],
      constructs: ['store'],
      decoration: { id: 'container:q', label: 'Audit correction queue', type: 'queue', technology: 'agent session transport', state: 'accepted', description: 'Proposals awaiting a human decision.' },
    }),
  },
  {
    group: '',
    note: '',
    node: node({
      id: 'b3',
      label: 'subsystems-core',
      members: ['i1', 'i2'],
      constructs: ['interface', 'function'],
      decoration: { id: 'container:lib', label: 'subsystems-core', type: 'library', technology: 'TypeScript', state: 'accepted', description: 'Schema and validation. Not a deployable unit.' },
    }),
  },
  {
    group: '',
    note: '',
    node: node({
      id: 'b4',
      label: 'OpenCode v2 service',
      kind: 'external',
      members: ['oc2'],
      constructs: ['external'],
      decoration: { id: 'external:oc2', label: 'OpenCode v2 service', type: 'software-system', technology: 'HTTP', state: 'accepted', description: 'Runs maintain agent sessions.' },
    }),
  },
  {
    group: '',
    note: '',
    node: node({
      id: 'b5',
      label: 'Maintain operator',
      kind: 'actor',
      members: ['a'],
      constructs: ['custom_entity'],
      decoration: { id: 'actor:a', label: 'Maintain operator', type: 'person', state: 'proposed', description: 'Reviews and accepts correction proposals.' },
    }),
  },

  // --- the gaps C4 keeps asking about ------------------------------------
  {
    group: 'Notation gaps',
    note: 'C4 requires technology and description on every container. A confirmed box that never got either says so on its face rather than looking finished.',
    node: node({
      id: 'c1',
      label: 'site/web',
      key: 'site/web',
      members: ['w1', 'w2', 'w3'],
      constructs: ['function'],
      decoration: { id: 'container:site/web', label: 'site/web', type: 'application', state: 'accepted' },
    }),
  },
  {
    group: '',
    note: '',
    node: node({
      id: 'c2',
      label: 'subsystems-studio/renderer',
      key: 'subsystems-studio/renderer',
      members: ['r1', 'r2'],
      constructs: ['function'],
      decoration: { id: 'container:renderer', label: 'subsystems-studio/renderer', type: 'application', technology: 'React', state: 'accepted' },
    }),
  },

  // --- component level ---------------------------------------------------
  {
    group: 'Component level',
    note: 'Same card, one level down. A component has no type requirement — it inherits from its container.',
    node: node({
      id: 'd1',
      label: 'buildBoundaryLayoutGroups',
      kind: 'component',
      members: ['b1'],
      constructs: ['function'],
      component: { alias: 'b1', name: 'buildBoundaryLayoutGroups', construct: 'function', file: 'src/subsystem/model.ts', purl: 'pkg:x#src/subsystem/model.ts' },
    }),
  },
];

function Section({ title, note }: { title?: string; note?: string }) {
  if (!title) return null;
  return (
    <div style={{ marginBottom: 10, maxWidth: 720 }}>
      <h2 style={{ margin: '0 0 3px', fontSize: 15, color: '#e8e8ea' }}>{title}</h2>
      {note ? <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: '#9a9aa0' }}>{note}</p> : null}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start', marginBottom: 6 }}>
      {children}
    </div>
  );
}

/** Label under a card, so a reviewer can name the case they are looking at. */
function Case({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start' }}>
      {children}
      <span
        style={{
          fontFamily: 'monospace',
          fontSize: 10,
          lineHeight: 1.4,
          color: '#6a6a70',
          width: NODE_W,
        }}
      >
        {caption}
      </span>
    </div>
  );
}

function Gallery() {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? '#9a9aa0';

  const legend: Array<[string, string]> = [
    ['accepted', nodeStyle({ id: 'x', kind: 'container', label: '', members: [], constructs: [], isStore: false, decoration: CONFIRMED } as C4Node, theme).color],
    ['proposed', nodeStyle({ id: 'x', kind: 'container', label: '', members: [], constructs: [], isStore: false, decoration: { id: 'y', state: 'proposed' } } as C4Node, theme).color],
    ['unconfirmed', nodeStyle({ id: 'x', kind: 'container', label: '', members: [], constructs: [], isStore: false } as C4Node, theme).color],
  ];

  let currentGroup = '';
  return (
    <div style={{ padding: 28, background: theme.colors.background, minHeight: '100vh' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, color: theme.colors.text }}>C4 node gallery</h1>
      <p style={{ margin: '0 0 22px', fontSize: 13, color: muted, maxWidth: 720, lineHeight: 1.5 }}>
        Every box the graph can draw, rendered on its own. The graph answers “what does this system
        look like”; this answers “what does a box mean”. No layout engine, no edges — just the
        encoding.
      </p>

      <div style={{ display: 'flex', gap: 16, fontFamily: 'monospace', fontSize: 11, marginBottom: 26 }}>
        {legend.map(([name, color]) => (
          <span key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, color: muted }}>
            <span style={{ width: 22, height: 0, borderTop: `3px solid ${color}`, display: 'inline-block' }} />
            {name}
          </span>
        ))}
      </div>

      <Row>
        {VARIANTS.map((v) => {
          const showHeader = v.group && v.group !== currentGroup;
          if (v.group) currentGroup = v.group;
          return (
            <React.Fragment key={v.id ?? v.node.id}>
              {showHeader && (
                <div style={{ width: '100%' }}>
                  <Section title={v.group} note={v.note} />
                </div>
              )}
              <Case
                caption={`${v.node.id} · tag "${nodeTag(v.node)}" · ${nodeSubtitle(v.node)}${
                  nodeMissing(v.node).length ? ` · missing ${nodeMissing(v.node).join('+')}` : ''
                }`}
              >
                <C4NodeCard node={v.node} />
              </Case>
            </React.Fragment>
          );
        })}
      </Row>

      <div style={{ marginTop: 22, maxWidth: 720 }}>
        <Section
          title="Selected"
          note="A selected node overrides its confirmation styling, so a click target reads differently from the graph around it."
        />
        <C4NodeCard node={VARIANTS[0]!.node} selected />
      </div>
    </div>
  );
}

export const All: Story = {
  render: () => <Gallery />,
};