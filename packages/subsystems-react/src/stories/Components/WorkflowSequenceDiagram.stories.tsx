import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { WorkflowSequenceDiagram } from '../../components/WorkflowSequenceDiagram';
import type { WorkflowScenario, Canvas } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Components/WorkflowSequenceDiagram',
  component: WorkflowSequenceDiagram,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
# WorkflowSequenceDiagram Component

A wrapper around \`SequenceDiagramRenderer\` that simplifies working with workflow scenarios.
Automatically converts workflow scenarios to sequence diagram format and optionally extracts
participant metadata from a canvas.

## Key Features

- **Simplified API**: Just pass a workflow scenario instead of manually creating events/edges
- **Canvas Integration**: Optionally provide a canvas to extract scope and participant metadata
- **Move vs Transform Events**: Automatically distinguishes between cross-participant (move) and internal (transform) events
- **Clickable Labels**: Edge labels are fully clickable and highlight when selected (no dots needed!)
- **Event Selection**: Click any label to select it - the label changes color to show selection
- **Empty State Handling**: Gracefully handles scenarios with no events

## Usage

\`\`\`tsx
<WorkflowSequenceDiagram
  scenario={workflowScenario}
  canvas={otelCanvas}
  height={600}
  onEventIndexChange={(index) => console.log('Selected event:', index)}
/>
\`\`\`
        `,
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <div style={{ height: '100vh' }}>
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof WorkflowSequenceDiagram>;

export default meta;
type Story = StoryObj<typeof meta>;

// ============================================================================
// Sample Scenarios
// ============================================================================

/**
 * Simple authentication workflow
 */
const simpleAuthScenario: WorkflowScenario = {
  id: 'simple-auth',
  name: 'Simple Authentication',
  description: 'Basic authentication flow with validation',
  template: {
    events: {
      'auth.request.received': {},
      'auth.validation.started': {},
      'database.user.lookup': {},
      'auth.validation.completed': {},
      'auth.token.generated': {},
    },
  },
};

/**
 * E-commerce order processing workflow
 */
const orderProcessingScenario: WorkflowScenario = {
  id: 'order-processing',
  name: 'Order Processing',
  description: 'Complete order processing with payment and inventory',
  template: {
    events: {
      'api.order.received': {},
      'auth.session.validate': {},
      'order.validation.started': {},
      'inventory.check.availability': {},
      'inventory.reserve.items': {},
      'order.validation.completed': {},
      'payment.charge.initiated': {},
      'payment.processor.authorize': {},
      'payment.charge.completed': {},
      'order.fulfillment.started': {},
      'notification.email.sent': {},
      'api.response.sent': {},
    },
  },
};

/**
 * Microservices workflow with multiple participants
 */
const microservicesScenario: WorkflowScenario = {
  id: 'microservices-flow',
  name: 'Microservices Communication',
  description: 'Inter-service communication pattern',
  template: {
    events: {
      'gateway.request.received': {},
      'gateway.route.determined': {},
      'userservice.user.fetch': {},
      'userservice.database.query': {},
      'userservice.response.prepared': {},
      'gateway.response.aggregated': {},
      'cache.data.stored': {},
      'gateway.response.sent': {},
    },
  },
};

/**
 * Error handling workflow
 */
const errorHandlingScenario: WorkflowScenario = {
  id: 'error-handling',
  name: 'Error Handling Flow',
  description: 'Workflow demonstrating error handling and recovery',
  template: {
    events: {
      'api.request.received': {},
      'service.processing.started': {},
      'service.validation.failed': {},
      'service.error.logged': {},
      'notification.alert.sent': {},
      'api.error.response.sent': {},
    },
  },
};

/**
 * Scenario with long namespace titles for stress-testing swimlane header rendering
 */
const longTitlesScenario: WorkflowScenario = {
  id: 'long-titles',
  name: 'Long Swimlane Titles',
  description: 'Scenario designed to stress-test header rendering with long participant names',
  template: {
    events: {
      'authenticationAndAuthorizationService.request.received': {},
      'authenticationAndAuthorizationService.token.validated': {},
      'distributedTransactionCoordinator.transaction.started': {},
      'inventoryReservationAndAllocationManager.items.reserved': {},
      'paymentProcessingAndFraudDetectionGateway.charge.authorized': {},
      'paymentProcessingAndFraudDetectionGateway.charge.captured': {},
      'distributedTransactionCoordinator.transaction.committed': {},
      'notificationDispatchAndDeliveryService.confirmation.sent': {},
    },
  },
};

/**
 * Empty scenario for testing empty state
 */
const emptyScenario: WorkflowScenario = {
  id: 'empty',
  name: 'Empty Workflow',
  description: 'Scenario with no events',
  template: {
    events: {},
  },
};

/**
 * Sample canvas with OTEL event nodes for metadata extraction
 */
const sampleCanvas: Canvas = {
  nodes: [
    {
      id: 'auth-validation-started',
      type: 'otel-event',
      x: 0,
      y: 0,
      width: 200,
      height: 60,
      event: { name: 'auth.validation.started' },
      otel: { scope: 'auth' },
      label: 'Start Validation',
    },
    {
      id: 'database-lookup',
      type: 'otel-event',
      x: 0,
      y: 100,
      width: 200,
      height: 60,
      event: { name: 'database.user.lookup' },
      otel: { scope: 'database' },
      label: 'Lookup User',
    },
    {
      id: 'auth-validation-completed',
      type: 'otel-event',
      x: 0,
      y: 200,
      width: 200,
      height: 60,
      event: { name: 'auth.validation.completed' },
      otel: { scope: 'auth' },
      label: 'Validation Complete',
    },
  ],
  edges: [],
};

// ============================================================================
// Stories
// ============================================================================

/**
 * Diagnostic story to test click functionality
 * Shows click feedback with colored labels (no dots!)
 * Verifies the label text matches the selected event (no off-by-one errors)
 */
export const ClickDiagnostic: Story = {
  render: () => {
    const [selectedIndex, setSelectedIndex] = useState<number | undefined>(undefined);
    const [clickCount, setClickCount] = useState(0);
    const [lastClickTime, setLastClickTime] = useState<string>('Never');

    const handleClick = (index: number) => {
      console.log('Click detected! Event index:', index);
      setSelectedIndex(index);
      setClickCount(prev => prev + 1);
      setLastClickTime(new Date().toLocaleTimeString());
    };

    const eventNames = Object.keys(simpleAuthScenario.template.events);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div
          style={{
            padding: '16px',
            background: '#1a1a1a',
            color: '#00ff00',
            fontFamily: 'monospace',
            borderBottom: '2px solid #00ff00',
            marginBottom: 16,
          }}
        >
          <h3 style={{ margin: '0 0 12px 0', color: '#00ff00' }}>🔍 CLICK DIAGNOSTIC MODE</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
            <div>Total Clicks: <strong>{clickCount}</strong></div>
            <div>Last Click: <strong>{lastClickTime}</strong></div>
            <div>Selected Index: <strong>{selectedIndex !== undefined ? selectedIndex : 'None'}</strong></div>
            <div>Selected Event: <strong>{selectedIndex !== undefined ? eventNames[selectedIndex] : 'None'}</strong></div>
          </div>
          <div style={{ marginTop: 12, padding: '8px', background: '#2a2a2a', borderRadius: 4 }}>
            💡 <strong>Click any label</strong> - it will highlight with colored background!
            Watch the label change color and verify it matches the event shown above.
          </div>
          {selectedIndex !== undefined && (
            <div style={{ marginTop: 8, padding: '8px', background: '#1e5a1e', borderRadius: 4, fontSize: 14 }}>
              ✅ <strong>Selected:</strong> "{eventNames[selectedIndex]?.split('.').pop()}" (the highlighted label should match!)
            </div>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <WorkflowSequenceDiagram
            scenario={simpleAuthScenario}
            height="100%"
            selectedEventIndex={selectedIndex}
            onEventIndexChange={handleClick}
            layoutOptions={{
              eventSpacing: 100,
            }}
          />
        </div>
      </div>
    );
  },
};

/**
 * Basic workflow scenario without canvas
 */
export const BasicScenario: Story = {
  args: {
    scenario: simpleAuthScenario,
    height: '100%',
    layoutOptions: {
      eventSpacing: 80,
    },
  },
};

/**
 * Workflow with canvas metadata for enhanced labels
 */
export const WithCanvasMetadata: Story = {
  args: {
    scenario: simpleAuthScenario,
    canvas: sampleCanvas,
    height: '100%',
    layoutOptions: {
      eventSpacing: 80,
    },
  },
};

/**
 * Complex workflow with many events and participants
 */
export const ComplexWorkflow: Story = {
  args: {
    scenario: orderProcessingScenario,
    height: '100%',
    layoutOptions: {
      laneWidth: 200,
      eventSpacing: 70,
    },
  },
};

/**
 * Microservices communication pattern
 */
export const MicroservicesPattern: Story = {
  args: {
    scenario: microservicesScenario,
    height: '100%',
    layoutOptions: {
      laneWidth: 220,
      eventSpacing: 75,
    },
  },
};

/**
 * Error handling workflow
 */
export const ErrorHandling: Story = {
  args: {
    scenario: errorHandlingScenario,
    height: '100%',
    layoutOptions: {
      eventSpacing: 80,
    },
  },
};

/**
 * Empty scenario showing graceful handling of no events
 */
export const EmptyState: Story = {
  args: {
    scenario: emptyScenario,
    height: '100%',
  },
};

/**
 * Long swimlane titles - stress-tests header rendering with very long participant names.
 * Use this to verify text wrapping, truncation, and overflow behavior in lane headers.
 */
export const LongSwimlaneTitles: Story = {
  args: {
    scenario: longTitlesScenario,
    height: '100%',
    layoutOptions: {
      eventSpacing: 80,
      headerHeight: 100,
    },
  },
};

/**
 * Interactive example with event selection
 * Click on any event in the sequence diagram to select it
 * NOTE: Event click areas are small (14x14px by default) - use larger nodes for better UX
 */
export const WithEventSelection: Story = {
  render: () => {
    const [selectedIndex, setSelectedIndex] = useState<number | undefined>(undefined);

    // Get event names from the scenario
    const eventNames = Object.keys(simpleAuthScenario.template.events);
    const selectedEventName = selectedIndex !== undefined ? eventNames[selectedIndex] : null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div
          style={{
            padding: '16px',
            background: '#2c3e50',
            color: '#ecf0f1',
            borderBottom: '3px solid #3498db',
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 16, marginBottom: 8 }}>
            <strong>💡 Click on any event dot in the diagram below</strong>
          </div>
          <div style={{ fontSize: 14, opacity: 0.9 }}>
            <strong>Selected Event:</strong>{' '}
            {selectedIndex !== undefined ? (
              <span style={{ color: '#3498db', fontFamily: 'monospace' }}>
                [{selectedIndex}] {selectedEventName}
              </span>
            ) : (
              <span style={{ opacity: 0.6 }}>None - Click an event to select</span>
            )}
          </div>
          {selectedIndex !== undefined && (
            <button
              onClick={() => setSelectedIndex(undefined)}
              style={{
                marginTop: 8,
                padding: '6px 16px',
                cursor: 'pointer',
                background: '#e74c3c',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                fontSize: 13,
              }}
            >
              Clear Selection
            </button>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <WorkflowSequenceDiagram
            scenario={simpleAuthScenario}
            height="100%"
            selectedEventIndex={selectedIndex}
            onEventIndexChange={setSelectedIndex}
            layoutOptions={{
              eventSpacing: 80,
              nodeWidth: 14,
              nodeHeight: 14,
            }}
          />
        </div>
      </div>
    );
  },
};

/**
 * Interactive selection example
 * Click labels to see them highlight with colored background
 */
export const InteractiveSelection: Story = {
  render: () => {
    const [selectedIndex, setSelectedIndex] = useState<number | undefined>(0);

    // Get event names from the scenario
    const eventNames = Object.keys(orderProcessingScenario.template.events);
    const selectedEventName = selectedIndex !== undefined ? eventNames[selectedIndex] : null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div
          style={{
            padding: '16px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            borderBottom: '4px solid #5a67d8',
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 16, marginBottom: 8 }}>
            <strong>✨ Clickable Labels Demo</strong>
          </div>
          <div style={{ fontSize: 14, marginBottom: 8 }}>
            Labels highlight with colored background when selected - clean and intuitive!
          </div>
          <div style={{ fontSize: 14, opacity: 0.9 }}>
            <strong>Selected:</strong>{' '}
            {selectedIndex !== undefined ? (
              <span style={{ color: '#ffd700', fontFamily: 'monospace', fontWeight: 'bold' }}>
                Event {selectedIndex + 1} - {selectedEventName}
              </span>
            ) : (
              <span style={{ opacity: 0.7 }}>Click any label</span>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <WorkflowSequenceDiagram
            scenario={orderProcessingScenario}
            height="100%"
            selectedEventIndex={selectedIndex}
            onEventIndexChange={setSelectedIndex}
            layoutOptions={{
              eventSpacing: 80,
            }}
          />
        </div>
      </div>
    );
  },
};

/**
 * Comparison: Edge Labels (Default) vs Node Labels (Optional)
 * Both are clickable! This shows different visualization styles.
 */
export const EdgeLabelsVsNodeLabels: Story = {
  render: () => {
    const [selectedLeft, setSelectedLeft] = useState<number | undefined>(undefined);
    const [selectedRight, setSelectedRight] = useState<number | undefined>(undefined);

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '100%', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{
            padding: '12px',
            background: '#3498db',
            color: 'white',
            borderBottom: '3px solid #2980b9',
            marginBottom: 12,
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 15 }}>📊 Edge Labels (Default)</h3>
            <div style={{ fontSize: 13 }}>
              Selected: {selectedLeft !== undefined ? `Event ${selectedLeft + 1}` : 'None'}
            </div>
            <div style={{ fontSize: 12, marginTop: 4, opacity: 0.9 }}>
              Traditional UML style - labels on arrows
            </div>
          </div>
          <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 4 }}>
            <WorkflowSequenceDiagram
              scenario={simpleAuthScenario}
              height="100%"
              selectedEventIndex={selectedLeft}
              onEventIndexChange={setSelectedLeft}
              showEventLabels={false}
              layoutOptions={{
                eventSpacing: 100,
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{
            padding: '12px',
            background: '#9b59b6',
            color: 'white',
            borderBottom: '3px solid #8e44ad',
            marginBottom: 12,
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 15 }}>🏷️ Node Labels (Alternative)</h3>
            <div style={{ fontSize: 13 }}>
              Selected: {selectedRight !== undefined ? `Event ${selectedRight + 1}` : 'None'}
            </div>
            <div style={{ fontSize: 12, marginTop: 4, opacity: 0.9 }}>
              Labels directly on events - alternative style
            </div>
          </div>
          <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 4 }}>
            <WorkflowSequenceDiagram
              scenario={simpleAuthScenario}
              height="100%"
              selectedEventIndex={selectedRight}
              onEventIndexChange={setSelectedRight}
              showEventLabels={true}
              layoutOptions={{
                eventSpacing: 100,
                nodeWidth: 80,
                nodeHeight: 50,
              }}
            />
          </div>
        </div>
      </div>
    );
  },
};

/**
 * Comparison of default lanes vs fully-drilled lanes
 */
export const DefaultVsDrilled: Story = {
  render: () => {
    const allTopSegments = Array.from(
      new Set(
        Object.keys(orderProcessingScenario.template.events ?? {})
          .map((name) => name.split('.')[0])
          .filter(Boolean)
      )
    );

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '100%', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 12px 0' }}>Default (top-level lanes)</h3>
          <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 4 }}>
            <WorkflowSequenceDiagram
              scenario={orderProcessingScenario}
              height="100%"
              layoutOptions={{ laneWidth: 180, eventSpacing: 60 }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 12px 0' }}>All top-level lanes drilled</h3>
          <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 4 }}>
            <WorkflowSequenceDiagram
              scenario={orderProcessingScenario}
              height="100%"
              layoutOptions={{
                openedNamespaces: allTopSegments,
                laneWidth: 180,
                eventSpacing: 60,
              }}
            />
          </div>
        </div>
      </div>
    );
  },
};

/**
 * Custom layout options - compact view
 */
export const CompactLayout: Story = {
  args: {
    scenario: simpleAuthScenario,
    height: '100%',
    layoutOptions: {
      laneWidth: 150,
      laneGap: 30,
      eventSpacing: 50,
    },
  },
};

/**
 * Custom layout options - spacious view
 */
export const SpaciousLayout: Story = {
  args: {
    scenario: simpleAuthScenario,
    height: '100%',
    layoutOptions: {
      laneWidth: 250,
      laneGap: 100,
      eventSpacing: 120,
    },
  },
};

/**
 * Without controls for embedded use
 */
export const WithoutControls: Story = {
  args: {
    scenario: simpleAuthScenario,
    height: '100%',
    showControls: false,
    layoutOptions: {
      eventSpacing: 80,
    },
  },
};

/**
 * With background grid
 */
export const WithBackground: Story = {
  args: {
    scenario: simpleAuthScenario,
    height: '100%',
    showBackground: true,
    layoutOptions: {
      eventSpacing: 80,
    },
  },
};

/**
 * Full-featured example with all options
 * Demonstrates event navigation, selection, and visual customization
 */
export const FullFeatured: Story = {
  render: () => {
    const [selectedIndex, setSelectedIndex] = useState<number>(0);
    const [showControls, setShowControls] = useState(true);
    const [showBackground, setShowBackground] = useState(false);

    const eventNames = Object.keys(orderProcessingScenario.template.events);
    const totalEvents = eventNames.length;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div
          style={{
            padding: '16px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            borderBottom: '4px solid #5a67d8',
            marginBottom: 16,
          }}
        >
          <div style={{ marginBottom: 12, fontSize: 15 }}>
            <strong>📍 Current Event:</strong>{' '}
            <span style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: 3 }}>
              {selectedIndex + 1} / {totalEvents}
            </span>
            {' - '}
            <span style={{ fontFamily: 'monospace' }}>{eventNames[selectedIndex]}</span>
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setSelectedIndex(Math.max(0, selectedIndex - 1))}
                disabled={selectedIndex === 0}
                style={{
                  padding: '8px 16px',
                  cursor: selectedIndex === 0 ? 'not-allowed' : 'pointer',
                  background: selectedIndex === 0 ? '#ccc' : '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 13,
                  fontWeight: 'bold',
                }}
              >
                ← Previous
              </button>
              <button
                onClick={() => setSelectedIndex(Math.min(totalEvents - 1, selectedIndex + 1))}
                disabled={selectedIndex === totalEvents - 1}
                style={{
                  padding: '8px 16px',
                  cursor: selectedIndex === totalEvents - 1 ? 'not-allowed' : 'pointer',
                  background: selectedIndex === totalEvents - 1 ? '#ccc' : '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 13,
                  fontWeight: 'bold',
                }}
              >
                Next →
              </button>
            </div>

            <div style={{ borderLeft: '2px solid rgba(255,255,255,0.3)', paddingLeft: 16, display: 'flex', gap: 12 }}>
              <label style={{ cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={showControls}
                  onChange={(e) => setShowControls(e.target.checked)}
                  style={{ marginRight: 6 }}
                />
                Show Controls
              </label>
              <label style={{ cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={showBackground}
                  onChange={(e) => setShowBackground(e.target.checked)}
                  style={{ marginRight: 6 }}
                />
                Show Background
              </label>
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.9, background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: 4 }}>
            💡 <strong>Tip:</strong> Click directly on any event dot in the diagram to jump to it!
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <WorkflowSequenceDiagram
            scenario={orderProcessingScenario}
            height="100%"
            selectedEventIndex={selectedIndex}
            onEventIndexChange={setSelectedIndex}
            showControls={showControls}
            showBackground={showBackground}
            layoutOptions={{
              laneWidth: 200,
              eventSpacing: 70,
            }}
          />
        </div>
      </div>
    );
  },
};
