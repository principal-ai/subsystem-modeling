import '@xyflow/react/dist/style.css';
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemIssueList } from '../../../subsystem/IssueList';
import { ISSUES, TRAIL_STEP_ISSUES } from './issuesFixtures';

const meta = {
  title: 'Canvases/Subsystem/UI Isolation/Issues',
  component: SubsystemIssueList,
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
} satisfies Meta<typeof SubsystemIssueList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The catalogue, grouped by verification layer. */
export const List: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', width: 380, height: '100vh', borderRight: '1px solid #333' }}>
      <SubsystemIssueList
        issues={ISSUES}
        onSelectIssue={() => {}}
        onApplyFix={() => {}}
      />
    </div>
  ),
};

/** All four layers clean — the happy state. */
export const AllGood: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', width: 380, height: '100vh', borderRight: '1px solid #333' }}>
      <SubsystemIssueList issues={[]} />
    </div>
  ),
};

/** Trail step verification: shows unconfirmed and stale call site findings. */
export const TrailStepVerification: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', width: 380, height: '100vh', borderRight: '1px solid #333' }}>
      <SubsystemIssueList
        issues={TRAIL_STEP_ISSUES}
        focusCategory="trail"
        onSelectIssue={() => {}}
      />
    </div>
  ),
};
