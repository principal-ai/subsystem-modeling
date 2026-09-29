/**
 * Maintain Live Panel — the collapsible half-height live-agent-run panel that
 * `SubsystemComponentGraph` renders over its canvas via the `liveEvents` prop.
 *
 * The fixture replays a real OpenCode V2 agent session
 * (`packages/subsystems-core/src/opencode/__fixtures__/session-events.json`),
 * mapped to the live-feed vocabulary and summarized like the host's
 * `/api/event` subscription.
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import {
  MaintainLivePanel,
  type MaintainEventLogEvent,
} from '../../components/maintain-events';
import liveEvents from '../data/maintain-live-events.json';

const events = liveEvents as MaintainEventLogEvent[];

const meta = {
  title: 'Agent Sessions/Maintain Live Panel',
  component: MaintainLivePanel,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <div
          style={{
            position: 'relative',
            height: '100vh',
            overflow: 'hidden',
            background: defaultEditorTheme.colors.background,
            color: defaultEditorTheme.colors.text,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              color: defaultEditorTheme.colors.textMuted,
              fontFamily: defaultEditorTheme.fonts.monospace,
              fontSize: 13,
            }}
          >
            graph canvas
          </div>
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
  args: {
    title: 'Maintain events',
    agent: 'construct-verifier',
    sessionId: 'ses_056b1f037ffeu1d00DzvJBrHq9',
    status: 'running',
    events,
    total: events.length,
  },
} satisfies Meta<typeof MaintainLivePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {};

export const Collapsed: Story = {
  args: { defaultCollapsed: true },
};

export const WaitingForEvents: Story = {
  args: { events: [], total: 0 },
};
