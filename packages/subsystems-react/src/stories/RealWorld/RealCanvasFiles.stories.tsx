import React, { useState, useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import '@xyflow/react/dist/style.css';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

// Import canvas files as URLs
import scopesCanvasUrl from '../../../../../.principal-views/architecture.scopes.canvas?url';
import spansCanvasUrl from '../../../../../.principal-views/architecture.spans.canvas?url';
import resourcesCanvasUrl from '../../../../../.principal-views/resources.canvas?url';
import matchingLogicCanvasUrl from '../../../../../.principal-views/matching-logic-current-state.canvas?url';
import validationCanvasUrl from '../../../../../.principal-views/validation/validation.otel.canvas?url';

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
  title: 'RealWorld/RealCanvasFiles',
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

// ============================================================================
// Architecture Canvas Files
// ============================================================================

/**
 * Scopes Canvas - Documents instrumentation scopes
 *
 * File: .principal-views/architecture.scopes.canvas
 * Type: otel-scope nodes
 * Purpose: Shows OpenTelemetry instrumentation scopes (getTracer calls)
 */
export const ScopesCanvas: Story = {
  render: () => (
    <CanvasLoader url={scopesCanvasUrl}>
      {(canvas) => <GraphRenderer canvas={canvas} />}
    </CanvasLoader>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Renders the actual **architecture.scopes.canvas** file from the project.

This canvas documents instrumentation scopes using \`otel-scope\` nodes with:
- Top-level \`type: "otel-scope"\`
- \`label\` for display name
- \`otel.scope\` for the scope identifier
- Circular node shape

**Use this to:**
- Preview how scope architecture canvases render
- Verify visual changes to scope nodes
- Test new features on real project files
        `,
      },
    },
  },
};

/**
 * Spans Canvas - Defines span naming conventions
 *
 * File: .principal-views/architecture.spans.canvas
 * Type: otel-span-convention nodes
 * Purpose: Documents span patterns and valid parent-child relationships
 */
export const SpansCanvas: Story = {
  render: () => (
    <CanvasLoader url={spansCanvasUrl}>
      {(canvas) => <GraphRenderer canvas={canvas} />}
    </CanvasLoader>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Renders the actual **architecture.spans.canvas** file from the project.

This canvas defines span naming conventions using \`otel-span-convention\` nodes with:
- Top-level \`type: "otel-span-convention"\`
- \`label\` for display name
- \`otel.spanPattern\` for matching pattern
- \`otel.spanKind\` for span kind
- Hexagon shape

**Use this to:**
- Preview how span convention canvases render
- Verify workflow chips display
- Test edge relationships between spans
        `,
      },
    },
  },
};

/**
 * Resources Canvas - Documents OTEL resources
 *
 * File: .principal-views/resources.canvas
 * Type: Mixed (text nodes and otel-resource nodes)
 * Purpose: Shows service resources and their instrumentation scopes
 */
export const ResourcesCanvas: Story = {
  render: () => (
    <CanvasLoader url={resourcesCanvasUrl}>
      {(canvas) => <GraphRenderer canvas={canvas} />}
    </CanvasLoader>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Renders the actual **resources.canvas** file from the project.

This canvas documents OTEL resources (service.name) and how they map to instrumentation scopes.

**Use this to:**
- Preview resource topology visualization
- Test resource node rendering
- Verify resource → scope relationships
        `,
      },
    },
  },
};

// ============================================================================
// Workflow/Event Canvas Files
// ============================================================================

/**
 * Validation Workflow Canvas - Event-driven workflow
 *
 * File: .principal-views/validation/validation.otel.canvas
 * Type: otel-event nodes
 * Purpose: Documents validation pipeline events and transitions
 */
export const ValidationOtelCanvas: Story = {
  render: () => (
    <CanvasLoader url={validationCanvasUrl}>
      {(canvas) => <GraphRenderer canvas={canvas} />}
    </CanvasLoader>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Renders the actual **validation.otel.canvas** file from the project.

This canvas shows the validation pipeline workflow using \`otel-event\` nodes with:
- Top-level \`type: "otel-event"\`
- \`label\` for display name
- \`event.name\` for the event identifier
- \`event.attributes\` for event schema
- Rectangle/rounded shapes

**Use this to:**
- Preview workflow event canvases
- Test event node rendering
- Verify event schema tooltips
        `,
      },
    },
  },
};

// ============================================================================
// General Canvas Files
// ============================================================================

/**
 * Matching Logic Canvas - Planning/documentation canvas
 *
 * File: .principal-views/matching-logic-current-state.canvas
 * Type: Regular canvas (text nodes with pv extensions)
 * Purpose: Documents implementation status and architecture planning
 */
export const MatchingLogicCanvas: Story = {
  render: () => (
    <CanvasLoader url={matchingLogicCanvasUrl}>
      {(canvas) => <GraphRenderer canvas={canvas} />}
    </CanvasLoader>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Renders the actual **matching-logic-current-state.canvas** file from the project.

This is a regular \`.canvas\` file used for architecture planning and implementation tracking.
Uses standard JSON Canvas \`text\` nodes with \`pv\` extensions for:
- Custom node types (\`pv.nodeType\`)
- Visual styling (\`pv.shape\`, \`pv.fill\`, \`pv.stroke\`)
- References to code files (\`pv.references\`)

**Use this to:**
- Preview general-purpose canvas files
- Test pv extension rendering
- Verify backward compatibility with old format
        `,
      },
    },
  },
};

// ============================================================================
// Combined View - All Canvas Files Side by Side
// ============================================================================

/**
 * All Canvas Files - Side by side comparison
 */
export const AllCanvasTypes: Story = {
  render: () => {
    const [canvases, setCanvases] = useState<{
      scopes?: ExtendedCanvas;
      spans?: ExtendedCanvas;
      resources?: ExtendedCanvas;
      validation?: ExtendedCanvas;
      matching?: ExtendedCanvas;
    }>({});

    useEffect(() => {
      Promise.all([
        loadCanvas(scopesCanvasUrl),
        loadCanvas(spansCanvasUrl),
        loadCanvas(resourcesCanvasUrl),
        loadCanvas(validationCanvasUrl),
        loadCanvas(matchingLogicCanvasUrl),
      ]).then(([scopes, spans, resources, validation, matching]) => {
        setCanvases({ scopes, spans, resources, validation, matching });
      });
    }, []);

    if (!canvases.scopes) {
      return <div style={{ padding: 20 }}>Loading all canvases...</div>;
    }

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', padding: '20px' }}>
        <div>
          <h3 style={{ marginTop: 0 }}>Scopes Canvas</h3>
          <div style={{ height: '300px', border: '1px solid #ccc' }}>
            <GraphRenderer canvas={canvases.scopes} />
          </div>
        </div>
        <div>
          <h3 style={{ marginTop: 0 }}>Spans Canvas</h3>
          <div style={{ height: '300px', border: '1px solid #ccc' }}>
            {canvases.spans && <GraphRenderer canvas={canvases.spans} />}
          </div>
        </div>
        <div>
          <h3 style={{ marginTop: 0 }}>Resources Canvas</h3>
          <div style={{ height: '300px', border: '1px solid #ccc' }}>
            {canvases.resources && <GraphRenderer canvas={canvases.resources} />}
          </div>
        </div>
        <div>
          <h3 style={{ marginTop: 0 }}>Validation (OTEL Events)</h3>
          <div style={{ height: '300px', border: '1px solid #ccc' }}>
            {canvases.validation && <GraphRenderer canvas={canvases.validation} />}
          </div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ marginTop: 0 }}>Matching Logic (Regular Canvas)</h3>
          <div style={{ height: '400px', border: '1px solid #ccc' }}>
            {canvases.matching && <GraphRenderer canvas={canvases.matching} />}
          </div>
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: `
Shows all canvas file types rendered side by side for comparison.

This view helps:
- Compare visual styling across different canvas types
- Test layout consistency
- Verify theme application
- Spot visual regressions quickly
        `,
      },
    },
  },
};
