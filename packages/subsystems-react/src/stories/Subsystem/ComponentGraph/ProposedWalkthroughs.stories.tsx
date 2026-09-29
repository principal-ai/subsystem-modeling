import React from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent, SubsystemWalkthrough } from '../../../subsystem/model';

const meta = {
  title: 'Subsystem/ComponentGraph/ProposedWalkthroughs',
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

const PURL = 'pkg:github/principal-ai/subsystem-modeling';

const components: SubsystemComponent[] = [
  {
    alias: 'audit',
    name: 'auditSubsystemModel',
    construct: 'function',
    file: 'src/bun/verify-subsystem-component.ts',
    purl: PURL,
    symbol: 'auditSubsystemModel',
    purpose: 'Deterministic dry-run audit of a stored model',
    role: 'entry',
    process: 'studio/host',
  },
  {
    alias: 'maintain',
    name: 'runMaintainModel',
    construct: 'function',
    file: 'src/bun/maintain-model.ts',
    purl: PURL,
    symbol: 'runMaintainModel',
    purpose: 'Existing maintain agent runner',
    process: 'studio/host',
  },
  {
    alias: 'lifecycle',
    name: 'OpenCodeV2Lifecycle',
    construct: 'function',
    file: '',
    purl: PURL,
    symbol: 'OpenCodeV2Lifecycle',
    purpose: 'Proposed Studio host: detect / install / update / ensure',
    proposed: true,
    process: 'studio/host',
  },
  {
    alias: 'cache',
    name: 'LifecycleProbeCache',
    construct: 'store',
    file: '',
    purl: PURL,
    symbol: 'LifecycleProbeCache',
    purpose: 'Proposed cache of probe results',
    proposed: true,
    process: 'studio/host',
  },
  {
    alias: 'cli',
    name: '@opencode-ai/cli',
    construct: 'external',
    file: '',
    purl: 'pkg:npm/@opencode-ai/cli@beta',
    symbol: '',
    purpose: 'Real external OpenCode CLI',
    role: 'service',
  },
];

const walkthroughs: SubsystemWalkthrough[] = [
  {
    id: 'wt-audit',
    title: 'Audit a model',
    steps: [
      {
        from: 'audit',
        to: 'maintain',
        mechanism: 'calls',
        file: 'src/bun/verify-subsystem-component.ts',
        line: 1,
        symbol: 'auditSubsystemModel',
        annotation: 'Live-only walkthrough — no proposed badge.',
      },
    ],
  },
  {
    id: 'wt-install',
    title: 'Install OpenCode V2',
    steps: [
      {
        from: 'audit',
        to: 'maintain',
        mechanism: 'calls',
        file: 'src/bun/verify-subsystem-component.ts',
        line: 1,
        symbol: 'auditSubsystemModel',
      },
      {
        from: 'maintain',
        to: 'lifecycle',
        mechanism: 'uses',
        file: 'src/bun/maintain-model.ts',
        line: 1,
        symbol: 'runMaintainModel',
        annotation: 'Hop onto the proposed lifecycle — step index is tinted.',
      },
      {
        from: 'lifecycle',
        to: 'cli',
        mechanism: 'calls',
        file: 'src/bun/maintain-model.ts',
        line: 1,
        symbol: 'OpenCodeV2Lifecycle.ensure',
      },
    ],
  },
  {
    id: 'wt-warm',
    title: 'Warm the probe cache',
    steps: [
      {
        from: 'lifecycle',
        to: 'cache',
        mechanism: 'writes',
        file: 'src/bun/maintain-model.ts',
        line: 1,
        symbol: 'LifecycleProbeCache.set',
        annotation: 'Both endpoints are proposed.',
      },
    ],
  },
];

function ProposedWalkthroughsDemo() {
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={components}
        walkthroughs={walkthroughs}
        title="proposed-work marker"
        description="Walkthroughs that touch a **proposed** component get their title tinted darkgoldenrod in the flows panel; expand a row and each hop onto a proposed component is tinted too (index and title). Nodes for proposed components already draw dashed darkgoldenrod on the canvas."
      />
    </div>
  );
}

export const ProposedWorkflows: Story = {
  render: () => <ProposedWalkthroughsDemo />,
};
