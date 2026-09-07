import React, { useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent, SubsystemComponentEdge } from '../../../subsystem/model';
import { components, edges } from './fixtures';

const meta = {
  title: 'Subsystem/ComponentGraph/Basics',
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
// Minimal: two nodes, one edge — the simplest possible label layout test.
// ---------------------------------------------------------------------------
const twoNodeComponents = components([
  ['src', 'TranscriptParser', 'class', 'transcript.ts', 'pkg:github/principal-ai/agent-monitoring', 'parses session records'],
  ['dst', 'SessionReader', 'class', 'SessionReader.ts', 'pkg:github/principal-ai/agent-monitoring', 'normalizes sessions into events'],
]);

const twoNodeEdges = edges([
  ['src', 'dst', 'imports'],
]);

function TwoNodeDemo({ showEdgeLabels = true }: { showEdgeLabels?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SubsystemComponentEdge | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={twoNodeComponents}
        edges={twoNodeEdges}
        onSelect={(id) => setSelected(id)}
        onEdgeSelect={(e) => setSelectedEdge(e)}
        showEdgeLabels={showEdgeLabels}
      />
      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        {selectedEdge
          ? `edge: ${selectedEdge.from} --${selectedEdge.mechanism}--> ${selectedEdge.to}`
          : selected
            ? `selected: ${selected}`
            : 'click a component or edge to select it'}
      </div>
    </div>
  );
}

export const TwoNodeSingleEdge: Story = {
  render: () => <TwoNodeDemo />,
};

export const TwoNodeNoLabels: Story = {
  render: () => <TwoNodeDemo showEdgeLabels={false} />,
};

// ---------------------------------------------------------------------------
// Playground: control the number of nodes in left and right layers.
// All left nodes connect to all right nodes (fan-in / fan-out).
// ---------------------------------------------------------------------------
function PlaygroundDemo({ leftCount, rightCount, showEdgeLabels }: { leftCount: number; rightCount: number; showEdgeLabels: boolean }) {
  const comps: SubsystemComponent[] = [];
  const edgeList: SubsystemComponentEdge[] = [];

  for (let i = 0; i < leftCount; i++) {
    comps.push({
      id: `l${i}`,
      name: `Left${i}`,
      construct: 'class',
      file: `left${i}.ts`,
      purl: 'pkg:github/principal-ai/playground',
      purpose: `left layer node ${i}`,
    });
  }
  for (let i = 0; i < rightCount; i++) {
    comps.push({
      id: `r${i}`,
      name: `Right${i}`,
      construct: 'class',
      file: `right${i}.ts`,
      purl: 'pkg:github/principal-ai/playground',
      purpose: `right layer node ${i}`,
    });
  }

  let ei = 0;
  for (let i = 0; i < leftCount; i++) {
    for (let j = 0; j < rightCount; j++) {
      edgeList.push({ id: `e${ei++}`, from: `l${i}`, to: `r${j}`, mechanism: 'imports' });
    }
  }

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph components={comps} edges={edgeList} showEdgeLabels={showEdgeLabels} />
    </div>
  );
}

export const Playground: Story = {
  render: (args) => <PlaygroundDemo {...args} />,
  args: {
    leftCount: 1,
    rightCount: 1,
    showEdgeLabels: true,
  },
  argTypes: {
    leftCount: { control: { type: 'number', min: 0, max: 6, step: 1 } },
    rightCount: { control: { type: 'number', min: 0, max: 6, step: 1 } },
    showEdgeLabels: { control: 'boolean' },
  },
};

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
export const Empty: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph components={[]} edges={[]} />
    </div>
  ),
};
