import React, { useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemEdgeView } from '../../../subsystem/model';
import { components, relations, walkthroughFromHops } from './fixtures';

const meta = {
  title: 'Subsystem/ComponentGraph/EdgeViews',
  component: SubsystemComponentGraph,
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
} satisfies Meta<typeof SubsystemComponentGraph>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// A graph that carries BOTH vocabularies between overlapping node pairs:
//   svc --references--> reader (topology)
//   svc --calls--> reader      (runtime hop)
//   store --references--> db   (topology)
//   store --calls--> db        (runtime hop)
// so switching the label view visibly changes which labels appear.
// ---------------------------------------------------------------------------
const labelViewComponents = components([
  ['api', 'ApiHandler', 'function', 'src/api/handler.ts', 'pkg:github/principal-ai/agent-monitoring', 'HTTP entry point', 'handleRequest'],
  ['svc', 'SessionService', 'class', 'src/session/SessionService.ts', 'pkg:github/principal-ai/agent-monitoring', 'owns session persistence', 'SessionService'],
  ['reader', 'SessionReader', 'class', 'src/session/SessionReader.ts', 'pkg:github/principal-ai/agent-monitoring', 'normalizes raw records', 'SessionReader'],
  ['store', 'SessionStore', 'class', 'src/session/SessionStore.ts', 'pkg:github/principal-ai/agent-monitoring', 'retained session state', 'SessionStore'],
  ['event', 'SessionEvent', 'interface', 'src/types/SessionEvent.ts', 'pkg:github/principal-ai/agent-monitoring', 'output event shape', 'SessionEvent'],
  ['db', 'PostgresStore', 'external', 'src/db/PostgresStore.ts', 'pkg:github/principal-ai/agent-monitoring', 'external persistence driver', 'PostgresStore'],
]);

const labelViewRelations = relations([
  ['svc', 'reader', 'method'],
  ['svc', 'event', 'method'],
  ['store', 'db', 'method'],
  ['reader', 'event', 'method'],
]);

const labelViewWalkthroughs = [
  walkthroughFromHops('tl-capture', 'Capture session', [
    ['api', 'svc', 'calls', 'src/api/handler.ts', 42],
    ['svc', 'store', 'writes', 'src/session/SessionService.ts', 88],
    ['store', 'db', 'calls', 'src/session/SessionStore.ts', 120],
    ['svc', 'event', 'produces', 'src/session/SessionService.ts', 95],
  ]),
  walkthroughFromHops('tl-normalize', 'Normalize records', [
    ['svc', 'reader', 'calls', 'src/session/SessionService.ts', 61],
    ['reader', 'event', 'produces', 'src/session/SessionReader.ts', 77],
  ]),
];

const VIEWS: { value: SubsystemEdgeView; label: string }[] = [
  { value: 'relations', label: 'Relations' },
  { value: 'walkthroughs', label: 'Walkthroughs' },
];

function EdgeViewDemo() {
  const [view, setView] = useState<SubsystemEdgeView>('relations');
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 12px',
          borderBottom: '1px solid #333',
          fontFamily: 'monospace',
          fontSize: 12,
          color: '#ddd',
        }}
      >
        <span style={{ color: '#888' }}>edge view</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => setView(v.value)}
              style={{
                padding: '3px 10px',
                borderRadius: 4,
                border: '1px solid #444',
                background: view === v.value ? '#0893d2' : 'transparent',
                color: view === v.value ? '#fff' : '#bbb',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <input
            type="checkbox"
            checked={showEdgeLabels}
            onChange={(e) => setShowEdgeLabels(e.target.checked)}
          />
          showEdgeLabels
        </label>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SubsystemComponentGraph
          components={labelViewComponents}
          relations={labelViewRelations}
          walkthroughs={labelViewWalkthroughs}
          title="edge views"
          description="The relation and walkthrough vocabularies are disjoint and never shown together. Toggle the view: **Relations** draws `svc --references--> reader`; **Walkthroughs** draws `svc --calls--> reader`. The model is the same either way."
          showEdgeLabels={showEdgeLabels}
          edgeView={view}
        />
      </div>
    </div>
  );
}

/** Interactive toggle between the `relations` and `walkthroughs` edge views. */
export const ToggleEdgeView: Story = {
  render: () => <EdgeViewDemo />,
};

/** Storybook-controls variant of the same toggle. */
export const ViewControl: Story = {
  render: (args) => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        components={labelViewComponents}
        relations={labelViewRelations}
        walkthroughs={labelViewWalkthroughs}
        showEdgeLabels={args.showEdgeLabels}
        edgeView={args.edgeView}
      />
    </div>
  ),
  args: {
    showEdgeLabels: true,
    edgeView: 'relations',
  },
  argTypes: {
    showEdgeLabels: { control: 'boolean' },
    edgeView: { control: 'inline-radio', options: ['relations', 'walkthroughs'] },
  },
};
