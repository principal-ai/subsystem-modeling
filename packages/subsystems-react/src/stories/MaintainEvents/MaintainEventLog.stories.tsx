/**
 * Maintain Event Log — presentational live agent-run event feed.
 *
 * The `Live` story replays a fixture derived from a real OpenCode V2 agent
 * session (`packages/subsystems-core/src/opencode/__fixtures__/session-events.json`),
 * mapped to the live-feed vocabulary (`session.next.*` / `session.status`) and
 * summarized the same way the host's `/api/event` subscription is
 * (`summarizeEvent` in `subsystems-studio/src/bun/opencode-v2-live.ts`).
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import {
  MaintainEventLog,
  type MaintainEventLogEvent,
} from '../../components/maintain-events';
import liveEvents from '../data/maintain-live-events.json';

const events = liveEvents as MaintainEventLogEvent[];

const meta = {
  title: 'Agent Sessions/Maintain Event Log',
  component: MaintainEventLog,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <div
          style={{
            height: '100vh',
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
    title: 'Maintain events',
    agent: 'construct-verifier',
    sessionId: 'ses_056b1f037ffeu1d00DzvJBrHq9',
    status: 'running',
    events,
    total: events.length,
  },
} satisfies Meta<typeof MaintainEventLog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {};

export const WaitingForSession: Story = {
  args: { sessionId: undefined, events: [], total: 0, status: 'starting' },
};

export const WaitingForEvents: Story = {
  args: { events: [], total: 0 },
};

export const WithError: Story = {
  args: { error: 'live event stream dropped — reconnecting and reconciling with server state' },
};
