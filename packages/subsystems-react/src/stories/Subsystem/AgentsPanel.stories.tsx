/**
 * Agents Panel — the graph sidebar's Agents view: the Maintain pipeline with
 * the router's next stage runnable. The host supplies the rows and the pick.
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemAgentsPanel, type SubsystemAgent } from '../../subsystem/AgentsPanel';

const AGENTS: SubsystemAgent[] = [
  { id: 'construct-fixer', label: 'construct-fixer', lane: 'construct', mode: 'issues' },
  { id: 'package-module-fixer', label: 'package-module-fixer', lane: 'static-topology', mode: 'issues' },
  { id: 'construct-verifier', label: 'construct-verifier', lane: 'construct', mode: 'verify' },
  { id: 'package-module-verifier', label: 'package-module-verifier', lane: 'static-topology', mode: 'verify' },
  { id: 'runtime-topology-verifier', label: 'runtime-topology-verifier', lane: 'dynamic-topology', mode: 'verify' },
];

const meta = {
  title: 'Subsystem/Agents Panel',
  component: SubsystemAgentsPanel,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <div
          style={{
            height: '60vh',
            display: 'flex',
            flexDirection: 'column',
            background: defaultEditorTheme.colors.background,
            color: defaultEditorTheme.colors.text,
          }}
        >
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
  args: {
    agents: AGENTS,
    nextAgentId: 'package-module-fixer',
    running: false,
    onRun: () => {},
  },
} satisfies Meta<typeof SubsystemAgentsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NextStageRunnable: Story = {};

export const Running: Story = {
  args: { running: true },
};

export const FullyVerified: Story = {
  args: { nextAgentId: null },
};
