import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import {
  DecorationPanel,
  type DecorationPanelProps,
} from '../../subsystem/DecorationPanel';
import {
  decorationTrailKey,
  type SubsystemDecoration,
} from '../../subsystem/decoration';

/**
 * PROTOTYPE: the decoration container as a reading surface.
 *
 * The fixture deliberately spans two models (desktop + sync service) and
 * includes one draft trail + draft structure, to show that a decoration is
 * additive and unverified — the base models stay untouched.
 */
const meta = {
  title: 'Components/DecorationPanel',
  component: DecorationPanel,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof DecorationPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const decoration: SubsystemDecoration = {
  version: 1,
  id: 'dec-local-first-sync',
  title: 'Local-first sync',
  description: [
    'How a drawing reaches disk **and** the sync service, in the order a reader should follow it.',
    '',
    '- The desktop stays the source of truth for the open tab.',
    '- The service is a projection; it never blocks the save.',
    '',
    '> This is a reading path, not a verified model claim.',
  ].join('\n'),
  trails: [
    {
      kind: 'base',
      modelId: 'sg-desktop',
      trailId: 'tl-save',
      stepAnchors: [{ stepKey: 'fixture', note: 'Write first; the sync hop is optional.' }],
    },
    { kind: 'base', modelId: 'sg-server', trailId: 'tl-persist' },
    {
      kind: 'draft',
      modelId: 'sg-desktop',
      trail: {
        id: 'tl-planned-sync',
        title: 'Planned sync (draft)',
        steps: [
          {
            from: 'tab',
            to: 'sync-agent',
            mechanism: 'produces',
            file: 'src/components/DrawingTabContent.tsx',
            purl: 'pkg:github/principal-ai/desktop-app#src/components/DrawingTabContent.tsx',
            symbol: 'DrawingTabContent.emitSaved',
          },
          {
            from: 'sync-agent',
            to: 'sync-service',
            mechanism: 'calls',
            file: 'src/sync/syncAgent.ts',
            purl: 'pkg:github/principal-ai/desktop-app#src/sync/syncAgent.ts',
            symbol: 'SyncAgent.push',
          },
        ],
      },
    },
  ],
  draft: {
    components: [
      {
        alias: 'sync-agent',
        name: 'SyncAgent',
        construct: 'class',
        purpose: 'queues a saved drawing for the sync service',
        process: 'draw-host',
      },
      {
        alias: 'sync-service',
        name: 'SyncService',
        construct: 'external',
        purpose: 'remote projection of saved drawings',
      },
    ],
    edges: [
      { from: 'tab', to: 'sync-agent', mechanism: 'produces' },
      { from: 'sync-agent', to: 'sync-service', mechanism: 'calls' },
    ],
  },
  provenance: {
    source: 'author',
    author: 'you',
    at: '2026-10-20T12:00:00.000Z',
  },
};

const resolveTrail: NonNullable<DecorationPanelProps['resolveTrail']> = (ref) => {
  if (ref.kind === 'draft') return undefined;
  const key = decorationTrailKey(ref);
  if (key === 'sg-desktop:tl-save') return { title: 'Save drawing', stepCount: 4 };
  if (key === 'sg-server:tl-persist') return { title: 'Persist file', stepCount: 5 };
  return undefined;
};

const modelLabels = new Map([
  ['sg-desktop', 'desktop-app'],
  ['sg-server', 'sync-service'],
]);

function Demo() {
  const [active, setActive] = useState(true);
  const [selected, setSelected] = useState<string>('none');

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0f1115' }}>
      <div style={{ width: 420, height: '100%', borderRight: '1px solid #2a2f3a' }}>
        <DecorationPanel
          decoration={decoration}
          active={active}
          onToggleActive={setActive}
          resolveTrail={resolveTrail}
          modelLabels={modelLabels}
          onSelectTrail={(ref) => setSelected(decorationTrailKey(ref))}
          onSelectDraftComponent={(component) => setSelected(component.alias)}
        />
      </div>
      <div
        style={{
          flex: 1,
          padding: 24,
          color: '#9aa4b2',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        <div>active: {String(active)}</div>
        <div>selected: {selected}</div>
      </div>
    </div>
  );
}

export const TwoModels: Story = {
  render: () => <Demo />,
};
