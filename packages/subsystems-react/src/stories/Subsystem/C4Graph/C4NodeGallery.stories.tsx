import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme, useTheme } from '@principal-ade/industry-theme';
import {
  C4NodeCard,
  nodeStyle,
  nodeSubtitle,
  nodeTag,
  nodeTopLabel,
  nodeShape,
  nodeSize,
  nodeMissing,
  NODE_W,
} from '../../../subsystem/C4NodeCard';
import type { C4Element } from '../../../subsystem/c4';

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
//
// Every card here is an authored `C4Element` — the shape a C4 box draws with,
// produces from an authored element, with the per-kind fields already resolved
// to the one shape the card draws with.
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

function node(over: Record<string, unknown> & { id: string; label: string }): C4Element {
  return {
    kind: 'container',
    containerKind: 'application',
    technology: '',
    state: 'proposed',
    members: [],
    constructs: [],
    ...over,
  } as C4Element;
}

const VARIANTS: Array<{ group: string; note: string; node: C4Element }> = [
  // `id` on each variant is its caption key, not a component field.

  // --- confirmation state: the axis that matters most --------------------
  {
    group: 'Confirmation state',
    note: 'Solid = a person signed off. Dashed = an agent asked and nobody answered. This is the only field that changes how a box is drawn, so it is the only one a confirm UI needs to move.',
    node: node({
      id: 'a1',
      label: 'Subsystem Studio — host',
      members: ['a', 'b', 'c'],
      constructs: ['function', 'store'],
      containerKind: 'application',
      technology: 'Bun + Electrobun',
      description: 'Runs the audit pipeline, owns the model store, serves the RPC surface.',
      state: 'accepted',
    }),
  },
  {
    group: '',
    note: '',
    node: node({
      id: 'a2',
      label: 'subsystems-react (proposed container?)',
      members: ['x', 'y'],
      constructs: ['function', 'interface'],
      containerKind: 'application',
      technology: 'React',
      state: 'proposed',
    }),
  },
  {
    group: '',
    note: '',
    node: node({
      id: 'a3',
      label: 'Subsystem Modeling CLI',
      members: ['cli-create'],
      constructs: ['function'],
      containerKind: 'application',
      technology: 'Node',
      description: 'Creates and updates models from the terminal.',
      state: 'accepted',
    }),
  },
  {
    group: '',
    note: 'Rejected elements are not drawn at all. This card exists to prove the fallback branch exists, not because a diagram ever shows one.',
    node: node({
      id: 'a4',
      label: 'graphify/extract',
      members: ['extract'],
      constructs: ['function'],
      containerKind: 'application',
      technology: 'Bun',
      state: 'rejected',
    }),
  },
  {
    group: '',
    note: 'A box that consolidated two derived keys says so — the inputs are hidden once merged, and silently losing them would be a lie about provenance.',
    node: node({
      id: 'a5',
      label: 'Subsystem Studio — host',
      derivedFrom: ['subsystems-studio/host', 'principal-studio/host'],
      members: ['a'],
      constructs: ['function'],
      containerKind: 'application',
      technology: 'Bun + Electrobun',
      state: 'accepted',
    }),
  },

  // --- the four kinds ------------------------------------------------------
  {
    group: 'The four kinds',
    note: 'C4 has a closed vocabulary: software system, container, component, code. Outside the boundary it adds people. There is no "library" kind — c4model says a module typically is not an element at all, so a library is a review comment, not a fifth box.',
    node: node({
      id: 'b1',
      label: 'Subsystem model store',
      members: ['s1'],
      constructs: ['store'],
      containerKind: 'data-store',
      technology: 'JSON files on disk',
      description: 'Every stored model plus its index.',
      state: 'accepted',
    }),
  },
  {
    group: '',
    note: 'A queue or topic is a data store, not its own kind. C4 says an individual queue is a bucket of messages — a data store — and that the message bus itself is not a container at all. The queue-ness lives in the label and technology.',
    node: node({
      id: 'b2',
      label: 'Audit correction queue',
      members: ['s2'],
      constructs: ['store'],
      containerKind: 'data-store',
      technology: 'agent session transport',
      description: 'Proposals awaiting a human decision.',
      state: 'accepted',
    }),
  },
  {
    group: '',
    note: 'A component reads as a square, but is drawn wider than it is tall (8:7, from COMPONENT_ASPECT) — equal sides get perceived as tall, so the optical correction is what makes it land. Further than a textbook 5% on purpose: height is a minimum, so a long description grows the drawn box, and the correction has to hold against the rendered height. Not a smaller rectangle: border weight also drops to 1px and the text centres, so the level survives grayscale and reads on a single card.',
    node: node({
      id: 'b3',
      label: 'Boundary layout builder',
      kind: 'component',
      parentId: 'container:shared-ui',
      members: ['h1', 'h2'],
      constructs: ['function'],
      technology: 'React + ELK',
      description: 'Turns claims into nested compound frames.',
      state: 'accepted',
    }),
  },
  {
    group: '',
    note: 'An external system keeps the rectangle but goes dashed — it is outside the boundary, which is a different statement from "inside, and unconfirmed".',
    node: node({
      id: 'b4',
      label: 'OpenCode v2 service',
      kind: 'external-system',
      members: ['oc2'],
      constructs: ['external'],
      technology: 'HTTP',
      description: 'Runs maintain agent sessions.',
      state: 'accepted',
    }),
  },
  {
    group: '',
    note: '',
    node: node({
      id: 'b5',
      label: 'Maintain operator',
      kind: 'person',
      members: ['a'],
      constructs: ['custom_entity'],
      description: 'Reviews and accepts correction proposals.',
      state: 'proposed',
    }),
  },

  // --- the gaps C4 keeps asking about ------------------------------------
  {
    group: 'Notation gaps',
    note: 'C4 requires technology and description on every container. A box that never got either says so on its face rather than looking finished — and `technology` is required by the type, so the only way to have the gap is an empty string.',
    node: node({
      id: 'c1',
      label: 'In-memory renderer state',
      members: ['w1', 'w2', 'w3'],
      constructs: ['store'],
      containerKind: 'application',
      technology: '',
      state: 'accepted',
    }),
  },
  {
    group: '',
    note: '',
    node: node({
      id: 'c2',
      label: 'Subsystem Studio — renderer',
      members: ['r1', 'r2'],
      constructs: ['function'],
      containerKind: 'application',
      technology: 'React 19',
      state: 'accepted',
    }),
  },

  // --- the pair that was confusing, side by side ------------------------
  {
    group: 'Container vs component',
    note: 'The case that started this. Same border colour and same state, previously identical. Now a wide rectangle says "container" and a square says "component", so the level is readable before the text is.',
    node: node({
      id: 'e1',
      label: 'Subsystem Studio — host',
      members: ['a', 'b', 'c'],
      constructs: ['function', 'store'],
      containerKind: 'application',
      technology: 'Bun + Electrobun',
      description: 'Runs the audit pipeline.',
      state: 'accepted',
    }),
  },
  {
    group: '',
    note: '',
    node: node({
      id: 'e2',
      label: 'Studio Host',
      kind: 'component',
      parentId: 'container:studio-host',
      members: ['h1'],
      constructs: ['function'],
      technology: 'Bun',
      description: 'Resolves the model root and registers repos.',
      state: 'accepted',
      component: {
        alias: 'h1',
        name: 'StudioHost',
        construct: 'function',
        file: 'packages/subsystems-studio/src/bun/index.ts',
        purl: 'pkg:x#packages/subsystems-studio/src/bun/index.ts',
      },
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
      {/* Caption spans the container box so every card's caption starts at the
          same x — otherwise the narrower square column looks misaligned. */}
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

const KINDS = ['container', 'component', 'external-system', 'person'] as const;

function Gallery() {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? '#9a9aa0';

  const legend: Array<[string, string]> = [
    ['accepted', nodeStyle(node({ id: 'x', label: '', state: 'accepted' }), theme).color],
    ['proposed', nodeStyle(node({ id: 'x', label: '', state: 'proposed' }), theme).color],
    ['rejected', nodeStyle(node({ id: 'x', label: '', state: 'rejected' }), theme).color],
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

      <div style={{ fontFamily: 'monospace', fontSize: 11, marginBottom: 26, lineHeight: 1.9 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <span style={{ color: '#e8e8ea' }}>KIND — shape and border weight</span>
        </div>
        <div style={{ color: muted, marginTop: 2 }}>
          Top-left is the technology’s brand mark — shown only when we hold the official SVG — and its
          name. Top-right is a container’s C4 sort, application vs data-store. The line under the label
          is the description.
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 4 }}>
          {KINDS.map((kind) => {
            const s = nodeShape(node({ id: 'x', label: '', kind }));
            const size = nodeSize(node({ id: 'x', label: '', kind }));
            const color = nodeStyle(node({ id: 'x', label: '', kind }), theme).color;
            const weight = kind === 'component' ? 1 : 2;
            // Drawn at the real aspect ratio — the whole signal is square vs
            // rectangle, so a legend that flattened both would lie.
            return (
              <span key={kind} style={{ display: 'flex', alignItems: 'center', gap: 6, color: muted }}>
                <span
                  style={{
                    width: 28,
                    height: Math.round((28 * size.height) / size.width),
                    borderRadius: Math.min(s.radius, 9),
                    border: `${weight} ${nodeStyle(node({ id: 'x', label: '', kind }), theme).dash} ${color}`,
                    display: 'inline-block',
                  }}
                />
                {kind}
              </span>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 14 }}>
          <span style={{ color: '#e8e8ea' }}>CONFIRMATION — colour and dash, never the shape</span>
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 4 }}>
          {legend.map(([name, color]) => (
            <span key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, color: muted }}>
              <span style={{ width: 22, height: 0, borderTop: `3px solid ${color}`, display: 'inline-block' }} />
              {name}
            </span>
          ))}
        </div>
      </div>

      <Row>
        {VARIANTS.map((v) => {
          const showHeader = v.group && v.group !== currentGroup;
          if (v.group) currentGroup = v.group;
          return (
            <React.Fragment key={v.node.id}>
              {showHeader && (
                <div style={{ width: '100%' }}>
                  <Section title={v.group} note={v.note} />
                </div>
              )}
              <Case
                caption={[
                  v.node.id,
                  `"${nodeTag(v.node)}"`,
                  v.node.kind === 'container' ? v.node.containerKind : null,
                  v.node.state,
                  `${nodeShape(v.node).kind} ${nodeSize(v.node).width}×${nodeSize(v.node).height}`,
                  nodeTopLabel(v.node),
                  nodeSubtitle(v.node),
                  nodeMissing(v.node).length ? `missing ${nodeMissing(v.node).join('+')}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
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