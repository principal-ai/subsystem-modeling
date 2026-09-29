import React, { useMemo, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { C4Graph } from '../../../subsystem/C4Graph';
import { toC4, type C4View } from '../../../subsystem/toC4';
import { c4FixtureModel } from './c4Fixture';

const meta = {
  title: 'Subsystem/C4Graph/C4Container',
  component: C4Graph,
  parameters: {
    layout: 'fullscreen',
  },
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
// C4 projection of a real composite: 60 stored subsystem models over one repo,
// merged by the host, then derived into system → container/component boxes with
// externals + actors outside. Toggle the C4 level; click a box to see the
// source components it rolled up.
// ---------------------------------------------------------------------------

function C4Demo() {
  const [view, setView] = useState<C4View>('container');
  const [selected, setSelected] = useState<string | null>(null);
  const model = useMemo(() => toC4(c4FixtureModel, { view, systemLabel: 'Subsystem Modeling' }), [view]);

  const counts = {
    containers: model.nodes.filter((n) => n.kind === 'container').length,
    components: model.nodes.filter((n) => n.kind === 'component').length,
    externals: model.nodes.filter((n) => n.kind === 'external').length,
    actors: model.nodes.filter((n) => n.kind === 'actor').length,
    flows: model.edges.filter((e) => e.kind === 'flow').length,
  };

  const button = (label: string, value: C4View) => (
    <button
      type="button"
      onClick={() => setView(value)}
      style={{
        fontFamily: 'monospace',
        fontSize: 12,
        padding: '2px 10px',
        borderRadius: 4,
        cursor: 'pointer',
        border: '1px solid #555',
        background: view === value ? '#1D9E75' : 'transparent',
        color: view === value ? '#020B12' : '#ddd',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <C4Graph model={model} title="Subsystem Modeling" onSelectNode={setSelected} />
      </div>
      <div
        style={{
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          fontFamily: 'monospace',
          fontSize: 12,
          color: '#aaa',
          borderTop: '1px solid #333',
        }}
      >
        <span style={{ display: 'flex', gap: 6 }}>
          view: {button('container', 'container')} {button('component', 'component')}
        </span>
        <span>
          {counts.containers} containers · {counts.components} components · {counts.externals} externals ·{' '}
          {counts.actors} actors
        </span>
        <span>{counts.flows} flow edges</span>
        <span>selected: {selected ?? '(none)'}</span>
      </div>
    </div>
  );
}

export const C4: Story = {
  args: { model: toC4(c4FixtureModel, { view: 'container', systemLabel: 'Subsystem Modeling' }) },
  render: () => <C4Demo />,
};
