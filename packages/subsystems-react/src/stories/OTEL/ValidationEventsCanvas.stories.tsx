import React, { useState, useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import '@xyflow/react/dist/style.css';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

// Import the CLI events canvas
import validationEventsCanvasUrl from '../../../../../.principal-views/principal-view-cli.events.canvas?url';

// Helper to load canvas from URL
async function loadCanvas(url: string): Promise<ExtendedCanvas> {
  const response = await fetch(url);
  return await response.json();
}

// Wrapper component that loads canvas data
function CanvasLoader({ url, children }: { url: string; children: (canvas: ExtendedCanvas) => React.ReactNode }) {
  const [canvas, setCanvas] = useState<ExtendedCanvas | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCanvas(url)
      .then(setCanvas)
      .catch((err) => setError(err.message));
  }, [url]);

  if (error) {
    return <div style={{ padding: 20, color: 'red' }}>Error loading canvas: {error}</div>;
  }

  if (!canvas) {
    return <div style={{ padding: 20 }}>Loading canvas...</div>;
  }

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      {children(canvas)}
    </div>
  );
}

const meta = {
  title: 'OTEL/ValidationEventsCanvas',
  component: GraphRenderer,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <div style={{ width: '100vw', height: '100vh' }}>
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof GraphRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Validation Event Namespace Canvas
 *
 * File: .principal-views/validation/validation.events.canvas
 * Type: event-namespace nodes
 * Purpose: Shows the vocabulary of events emitted during validation workflows
 */
export const EventNamespaceVocabulary: Story = {
  render: () => (
    <CanvasLoader url={validationEventsCanvasUrl}>
      {(canvas) => <GraphRenderer canvas={canvas} showBackground={false} editable={true} />}
    </CanvasLoader>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Renders the **validation.events.canvas** file - an event namespace vocabulary canvas.

## Event Namespace Canvas Concept

Unlike span canvases (which show user workflows) or OTEL event canvases (which show individual events),
this canvas shows the **vocabulary of event namespaces** and their adjacency relationships.

### Structure

**Nodes = Event Namespaces**
- \`analysis\` - Analysis pipeline lifecycle events
- \`validation\` - Validation lifecycle events (started, complete, error)
- \`file\` - File parsing events
- \`type\` - Type detection events
- etc.

Each namespace node documents all events within that namespace with their attributes.

**Edges = Adjacency**
- Edges represent when events from one namespace appear adjacent to events from another namespace in workflow scenarios
- Example: \`analysis → filetree\` because \`analysis.started → filetree.built\` in scenarios
- Example: \`file → validation\` because \`file.parsed → validation.error\` in scenarios

### Purpose

This canvas serves as:
1. **Event vocabulary documentation** - What events can be emitted
2. **Flow visualization** - How events from different namespaces connect
3. **Implementation guide** - What attributes each event requires
4. **Validation source** - Canvas edges must match actual workflow scenario adjacencies

### Conventions

As defined in \`.principal-views/architecture.events.md\`:
- Events follow \`{namespace}.{action}.{detail}\` naming
- Edges represent direct adjacency only (not transitive)
- Canvas is validated against workflow scenario files
- Namespaces group code-level implementation events (vs user-level workflow spans)

**Use this to:**
- Preview event namespace canvas rendering
- Understand event flow architecture
- Document which events your code emits
- Validate event relationships match actual code
        `,
      },
    },
  },
};

/**
 * Event Namespace Canvas with Annotations
 *
 * Shows the canvas with additional context about what each namespace contains
 */
export const WithNamespaceDetails: Story = {
  render: () => (
    <CanvasLoader url={validationEventsCanvasUrl}>
      {(canvas) => (
        <div style={{ display: 'flex', height: '100vh' }}>
          <div style={{ flex: 1 }}>
            <GraphRenderer canvas={canvas} showBackground={false} editable={true} />
          </div>
          <div style={{
            width: '350px',
            padding: '20px',
            backgroundColor: '#f5f5f5',
            overflowY: 'auto',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}>
            <h2 style={{ marginTop: 0, fontSize: '18px' }}>Event Namespaces</h2>
            <p style={{ fontSize: '14px', color: '#666' }}>
              Each node represents a namespace grouping related events.
            </p>

            <div style={{ marginTop: '20px' }}>
              <h3 style={{ fontSize: '14px', marginBottom: '8px' }}>Discovery Phase</h3>
              <ul style={{ fontSize: '13px', lineHeight: '1.6', paddingLeft: '20px' }}>
                <li><strong>analysis</strong> - Pipeline start</li>
                <li><strong>filetree</strong> - Repository scanning</li>
                <li><strong>packages</strong> - Package discovery</li>
                <li><strong>canvases</strong> - Canvas file discovery</li>
                <li><strong>executions</strong> - Execution file discovery</li>
                <li><strong>library</strong> - Component library loading</li>
                <li><strong>discovery</strong> - Phase completion</li>
              </ul>
            </div>

            <div style={{ marginTop: '20px' }}>
              <h3 style={{ fontSize: '14px', marginBottom: '8px' }}>Validation Phase</h3>
              <ul style={{ fontSize: '13px', lineHeight: '1.6', paddingLeft: '20px' }}>
                <li><strong>validation</strong> - Lifecycle (started, complete, error)</li>
                <li><strong>file</strong> - Parsing operations</li>
                <li><strong>type</strong> - Type detection</li>
                <li><strong>canvas</strong> - Canvas validation</li>
                <li><strong>workflow</strong> - Workflow validation</li>
                <li><strong>execution</strong> - Execution validation</li>
                <li><strong>rules</strong> - Lint rule execution</li>
                <li><strong>results</strong> - Result aggregation</li>
              </ul>
            </div>

            <div style={{ marginTop: '20px', padding: '12px', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
              <h4 style={{ fontSize: '13px', marginTop: 0 }}>Adjacency Edges</h4>
              <p style={{ fontSize: '12px', margin: 0, color: '#856404' }}>
                Edges show when events from one namespace appear next to events from another namespace
                in workflow scenarios. These are validated against actual execution traces.
              </p>
            </div>
          </div>
        </div>
      )}
    </CanvasLoader>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Same canvas with a side panel showing namespace details and explanations.

This view helps:
- Understand what each namespace contains
- See the phase groupings (discovery vs validation)
- Learn the event namespace canvas concept
        `,
      },
    },
  },
};
