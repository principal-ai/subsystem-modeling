import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import type { AgentSessionEvent, V1RawEvent } from '@principal-ai/agent-monitoring';
import {
  SessionEventFeed,
  SessionEventFeedGrouped,
  type SessionEventFeedRow,
} from '../../components/session-events';
import rawSession from '../data/opencode-session-raw-events.json';

const meta = {
  title: 'OTEL/RawEventCards',
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
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// =============================================================================
// Fixture → rows
// =============================================================================

const fixture = rawSession as {
  session: { id: string; title: string; slug: string; timeCreated: number };
  events: V1RawEvent[];
  normalized: Array<Record<string, unknown>>;
  accumulated: Array<AgentSessionEvent | null>;
};

const rows: SessionEventFeedRow[] = fixture.events
  .map((raw, i) => ({
    seq: raw.seq,
    type: raw.type,
    raw,
    normalized: fixture.normalized[i],
    accumulated: fixture.accumulated[i],
  }))
  .sort((a, b) => a.seq - b.seq);

export const Feed: Story = {
  render: () => <SessionEventFeed title={fixture.session.title} rows={rows} />,
};

export const Grouped: Story = {
  render: () => <SessionEventFeedGrouped title={fixture.session.title} rows={rows} />,
};
