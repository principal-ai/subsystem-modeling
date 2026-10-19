/**
 * Layout direction — the canvas toggle flips the layered layout between
 * left-to-right and top-to-bottom.
 *
 * The flip is sequenced: edges fade out, ELK re-lays out while the nodes slide
 * to their new slots, then the edges fade back in. Old routes never cut across
 * the new layout mid-flight.
 */
import React, { useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemLayoutDirection } from '../../../subsystem/model';
import { components, graphSpecFromSteps } from './fixtures';

const meta = {
  title: 'Canvases/Subsystem/LayoutDirection',
  component: SubsystemComponentGraph,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof SubsystemComponentGraph>;

export default meta;
type Story = StoryObj<typeof meta>;

// A graph with enough layers to make the axis obvious: two producers fan into
// a service, which writes to a store and produces an event.
const layoutComponents = components([
  ['api', 'ApiHandler', 'function', 'src/api/handler.ts', 'pkg:github/principal-ai/agent-monitoring', 'HTTP entry point', 'handleRequest'],
  ['cli', 'CliHandler', 'function', 'src/cli/handler.ts', 'pkg:github/principal-ai/agent-monitoring', 'command entry point', 'handleCommand'],
  ['svc', 'SessionService', 'class', 'src/session/SessionService.ts', 'pkg:github/principal-ai/agent-monitoring', 'owns session persistence', 'SessionService'],
  ['store', 'SessionStore', 'class', 'src/session/SessionStore.ts', 'pkg:github/principal-ai/agent-monitoring', 'retained session state', 'SessionStore'],
  ['event', 'SessionEvent', 'interface', 'src/types/SessionEvent.ts', 'pkg:github/principal-ai/agent-monitoring', 'output event shape', 'SessionEvent'],
]);

const layoutSpec = graphSpecFromSteps([
  ['api', 'svc', 'calls', 'src/api/handler.ts', 42],
  ['cli', 'svc', 'calls', 'src/cli/handler.ts', 18],
  ['svc', 'store', 'writes', 'src/session/SessionService.ts', 88],
  ['svc', 'event', 'produces', 'src/session/SessionService.ts', 95],
]);

function DirectionDemo({ initial }: { initial: SubsystemLayoutDirection }) {
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={layoutComponents}
        trails={layoutSpec.trails}
        defaultLayoutDirection={initial}
        showEdgeLabels
      />
    </div>
  );
}

/** Left-to-right (the default). Click the corner toggle to watch the flip. */
export const Horizontal: Story = {
  render: () => <DirectionDemo initial="horizontal" />,
};

/** Seeded top-to-bottom. The toggle restores the remembered choice per `persistKey`. */
export const Vertical: Story = {
  render: () => <DirectionDemo initial="vertical" />,
};

/**
 * Host-controlled: the graph renders no built-in toggle; the host owns the
 * value and echoes it back through `onLayoutDirectionChange`.
 */
function ControlledDemo() {
  const [direction, setDirection] = useState<SubsystemLayoutDirection>('horizontal');
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 8, padding: 8, background: defaultEditorTheme.colors.background }}>
        {(['horizontal', 'vertical'] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDirection(d)}
            aria-pressed={direction === d}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: `1px solid ${defaultEditorTheme.colors.border}`,
              background: direction === d ? defaultEditorTheme.colors.border : 'transparent',
              color: defaultEditorTheme.colors.text,
              fontFamily: defaultEditorTheme.fonts.monospace,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {d}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SubsystemComponentGraph
          components={layoutComponents}
          trails={layoutSpec.trails}
          layoutDirection={direction}
          onLayoutDirectionChange={setDirection}
          hideLayoutToggle
          showEdgeLabels
        />
      </div>
    </div>
  );
}

export const ControlledByHost: Story = {
  render: () => <ControlledDemo />,
};
