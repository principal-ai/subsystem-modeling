import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { SequenceDiagramRenderer } from '../../components/SequenceDiagramRenderer';
import type { SequenceEvent, SequenceEdge } from '../../hooks/useSequenceLayout';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Components/SequenceDiagram',
  component: SequenceDiagramRenderer,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <div style={{ padding: 20, height: '100vh', boxSizing: 'border-box' }}>
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof SequenceDiagramRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

// ============================================================================
// Sample Data
// ============================================================================

/**
 * Simple authentication flow across two namespaces
 */
const simpleAuthFlow: { events: SequenceEvent[]; edges: SequenceEdge[] } = {
  events: [
    { id: '1', name: 'auth.validation.started', label: 'Validation Started' },
    { id: '2', name: 'database.query.findUser', label: 'Find User' },
    { id: '3', name: 'auth.validation.completed', label: 'Validation Completed' },
    { id: '4', name: 'auth.token.generated', label: 'Token Generated' },
  ],
  edges: [
    { id: 'e1', fromEvent: '1', toEvent: '2' },
    { id: 'e2', fromEvent: '2', toEvent: '3' },
    { id: 'e3', fromEvent: '3', toEvent: '4' },
  ],
};

/**
 * More complex flow with multiple actors
 */
const complexOrderFlow: { events: SequenceEvent[]; edges: SequenceEdge[] } = {
  events: [
    { id: '1', name: 'api.request.received', label: 'Request Received' },
    { id: '2', name: 'auth.session.validate', label: 'Validate Session' },
    { id: '3', name: 'order.validation.started', label: 'Validate Order' },
    { id: '4', name: 'inventory.check.availability', label: 'Check Stock' },
    { id: '5', name: 'order.validation.completed', label: 'Order Valid' },
    { id: '6', name: 'payment.charge.initiated', label: 'Initiate Charge' },
    { id: '7', name: 'payment.charge.completed', label: 'Charge Complete' },
    { id: '8', name: 'order.fulfillment.started', label: 'Start Fulfillment' },
    { id: '9', name: 'inventory.reserve.items', label: 'Reserve Items' },
    { id: '10', name: 'notification.email.sent', label: 'Confirmation Email' },
    { id: '11', name: 'api.response.sent', label: 'Response Sent' },
  ],
  edges: [
    { id: 'e1', fromEvent: '1', toEvent: '2' },
    { id: 'e2', fromEvent: '2', toEvent: '3' },
    { id: 'e3', fromEvent: '3', toEvent: '4' },
    { id: 'e4', fromEvent: '4', toEvent: '5' },
    { id: 'e5', fromEvent: '5', toEvent: '6' },
    { id: 'e6', fromEvent: '6', toEvent: '7' },
    { id: 'e7', fromEvent: '7', toEvent: '8' },
    { id: 'e8', fromEvent: '8', toEvent: '9' },
    { id: 'e9', fromEvent: '9', toEvent: '10' },
    { id: 'e10', fromEvent: '10', toEvent: '11' },
  ],
};

/**
 * Flow with hierarchical namespaces (sub-namespaces)
 */
const hierarchicalFlow: { events: SequenceEvent[]; edges: SequenceEdge[] } = {
  events: [
    { id: '1', name: 'auth.login.started', label: 'Login Started' },
    { id: '2', name: 'auth.login.validation.credentials', label: 'Check Credentials' },
    { id: '3', name: 'auth.login.validation.mfa', label: 'Check MFA' },
    { id: '4', name: 'auth.login.session.create', label: 'Create Session' },
    { id: '5', name: 'auth.login.completed', label: 'Login Completed' },
  ],
  edges: [
    { id: 'e1', fromEvent: '1', toEvent: '2' },
    { id: 'e2', fromEvent: '2', toEvent: '3' },
    { id: 'e3', fromEvent: '3', toEvent: '4' },
    { id: 'e4', fromEvent: '4', toEvent: '5' },
  ],
};

/**
 * Flow with same-namespace sequential events
 */
const sameNamespaceFlow: { events: SequenceEvent[]; edges: SequenceEdge[] } = {
  events: [
    { id: '1', name: 'processor.step1', label: 'Step 1' },
    { id: '2', name: 'processor.step2', label: 'Step 2' },
    { id: '3', name: 'processor.step3', label: 'Step 3' },
    { id: '4', name: 'external.callback', label: 'External Callback' },
    { id: '5', name: 'processor.step4', label: 'Step 4' },
  ],
  edges: [
    { id: 'e1', fromEvent: '1', toEvent: '2' },
    { id: 'e2', fromEvent: '2', toEvent: '3' },
    { id: 'e3', fromEvent: '3', toEvent: '4' },
    { id: 'e4', fromEvent: '4', toEvent: '5' },
  ],
};

// ============================================================================
// Stories
// ============================================================================

/**
 * Basic two-namespace flow showing authentication
 */
export const SimpleFlow: Story = {
  args: {
    events: simpleAuthFlow.events,
    edges: simpleAuthFlow.edges,
    height: 500,
  },
};

/**
 * Complex multi-actor e-commerce order flow
 */
export const ComplexFlow: Story = {
  args: {
    events: complexOrderFlow.events,
    edges: complexOrderFlow.edges,
    height: 700,
  },
};

/**
 * Flow with hierarchical namespaces. By default, lanes group at the first
 * dotted segment — drill in via `openedNamespaces` (see `WithDrillDown`).
 */
export const HierarchicalNamespaces: Story = {
  args: {
    events: hierarchicalFlow.events,
    edges: hierarchicalFlow.edges,
    height: 500,
  },
};

/**
 * Flow testing same-namespace edge rendering
 */
export const SameNamespaceEdges: Story = {
  args: {
    events: sameNamespaceFlow.events,
    edges: sameNamespaceFlow.edges,
    height: 500,
  },
};

/**
 * Interactive drill-down. Click ▶ on a lane header to split it into
 * its sub-namespaces; click ‹ on a child lane to step back out.
 */
export const WithDrillDown: Story = {
  render: () => {
    const [opened, setOpened] = useState<string[]>([]);

    const handleToggle = (namespace: string) => {
      setOpened((prev) =>
        prev.includes(namespace)
          ? prev.filter((n) => n !== namespace)
          : [...prev, namespace]
      );
    };

    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <strong>Opened namespaces:</strong>{' '}
          {opened.length ? opened.join(', ') : 'none'}
          <br />
          <small>▶ on a lane header drills in. ‹ on a child lane steps back out.</small>
        </div>
        <SequenceDiagramRenderer
          events={hierarchicalFlow.events}
          edges={hierarchicalFlow.edges}
          height={500}
          layoutOptions={{ openedNamespaces: opened }}
          onToggleNamespace={handleToggle}
        />
      </div>
    );
  },
};

/**
 * Custom layout options - wider lanes and more spacing
 */
export const CustomLayout: Story = {
  args: {
    events: simpleAuthFlow.events,
    edges: simpleAuthFlow.edges,
    height: 500,
    layoutOptions: {
      laneWidth: 250,
      laneGap: 80,
      eventSpacing: 100,
    },
  },
};

/**
 * Compact layout for smaller diagrams
 */
export const CompactLayout: Story = {
  args: {
    events: simpleAuthFlow.events,
    edges: simpleAuthFlow.edges,
    height: 400,
    layoutOptions: {
      laneWidth: 150,
      laneGap: 30,
      eventSpacing: 50,
    },
  },
};

/**
 * Empty state
 */
export const EmptyDiagram: Story = {
  args: {
    events: [],
    edges: [],
    height: 300,
  },
};

/**
 * Single event (edge case)
 */
export const SingleEvent: Story = {
  args: {
    events: [{ id: '1', name: 'system.startup', label: 'System Startup' }],
    edges: [],
    height: 300,
  },
};
