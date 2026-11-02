import '@xyflow/react/dist/style.css';
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import {
  SubsystemDiagnosticToggle,
  type SubsystemDiagnosticStatus,
} from '../../../subsystem/DiagnosticToggle';

const meta = {
  title: 'Canvases/Subsystem/UI Isolation/Diagnostics',
  parameters: {
    layout: 'fullscreen',
  },
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

/** Every chip state side by side, for quick visual review. */
export const States: Story = {
  render: () => {
    const rows: Array<{ label: string; status: SubsystemDiagnosticStatus; issueCount?: number; fixableCount?: number; stale?: boolean; busy?: boolean }> = [
      { label: 'ok', status: 'ok' },
      { label: 'ok (stale)', status: 'ok', stale: true },
      { label: 'issues · 3', status: 'issues', issueCount: 3 },
      { label: 'gaps · 2', status: 'gaps', issueCount: 2 },
      { label: 'unknown (never checked)', status: 'unknown' },
      { label: 'issues (busy)', status: 'issues', issueCount: 3, busy: true },
      { label: 'issues · 7, 7 fixable', status: 'issues', issueCount: 7, fixableCount: 7 },
      { label: 'issues · 4, 2 fixable', status: 'issues', issueCount: 4, fixableCount: 2 },
      { label: 'issues · 2, fixable + stale', status: 'issues', issueCount: 2, fixableCount: 2, stale: true },
      { label: 'issues · 120, fixable capped', status: 'issues', issueCount: 120, fixableCount: 120 },
      { label: 'issues (busy) hides badge', status: 'issues', issueCount: 3, fixableCount: 3, busy: true },
    ];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 32 }}>
        {rows.map((row) => (
          <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ width: 220, fontFamily: 'monospace', fontSize: 12, opacity: 0.7 }}>
              {row.label}
            </span>
            <SubsystemDiagnosticToggle
              status={row.status}
              issueCount={row.issueCount}
              fixableCount={row.fixableCount}
              stale={row.stale}
              busy={row.busy}
              onToggle={() => {}}
            />
          </div>
        ))}
      </div>
    );
  },
};
