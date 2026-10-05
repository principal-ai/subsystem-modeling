import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { C4NodeCard, NODE_W, NODE_H } from '../../../subsystem/C4NodeCard';
import type { C4Container, C4Component } from '../../../subsystem/c4';

const meta = {
  title: 'Subsystem/C4Graph/C4CardGrow',
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

// ---------------------------------------------------------------------------
// Isolated grow/shrink of one container card — no graph, no frames, no
// components. Toggling the expand affordance animates the card's own size
// between the box dimensions and an expanded rectangle, so the FLIP motion can
// be judged on its own.
// ---------------------------------------------------------------------------

const GROWN_W = 420;
const GROWN_H = 300;

const card: C4Container = {
  kind: 'container',
  id: 'container:studio-host',
  label: 'Subsystem Studio — host',
  containerKind: 'application',
  technology: 'Bun + Electrobun',
  description: 'Owns the model store on disk and serves the renderer over RPC.',
  state: 'accepted',
  parentId: 'system:acme',
};

const COMPONENTS: C4Component[] = [
  {
    kind: 'component',
    id: 'component:audit-verification',
    label: 'Audit & verification',
    container: card.id,
    technology: 'Bun',
    description: 'Checks a subsystem model and reports what is wrong.',
    state: 'accepted',
  },
  {
    kind: 'component',
    id: 'component:model-store',
    label: 'Model store I/O',
    container: card.id,
    technology: 'Bun fs',
    description: 'Reads and writes model JSON under ~/.principal.',
    state: 'accepted',
  },
];

function Demo() {
  const [open, setOpen] = useState(false);
  const [grown, setGrown] = useState(false);
  // True when the card has finished shrinking back to its box — only then is the
  // description shown again (it stays hidden through open *and* the shrink).
  const [settled, setSettled] = useState(true);
  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#12141a',
      }}
    >
      <div
        onTransitionEnd={(e) => {
          // The card's own size transition bubbles here.
          if (e.propertyName !== 'width') return;
          if (open) setGrown(true);
          else setSettled(true);
        }}
      >
        <C4NodeCard
          node={card}
          width={open ? GROWN_W : NODE_W}
          height={open ? GROWN_H : NODE_H}
          showDescription={settled}
          onExpand={() => {
            // Leaving the resting state: hide the description immediately.
            setSettled(false);
            if (open) setGrown(false);
            setOpen((v) => !v);
          }}
        >
          {grown && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                marginTop: 8,
                minHeight: 0,
              }}
            >
              {COMPONENTS.map((c) => (
                <C4NodeCard key={c.id} node={c} />
              ))}
            </div>
          )}
        </C4NodeCard>
      </div>
    </div>
  );
}

export const Grow: Story = {
  render: () => <Demo />,
};
