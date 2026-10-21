/**
 * Layout direction — the canvas toggle flips the layered layout between
 * left-to-right and top-to-bottom.
 *
 * The flip is sequenced: edges fade out, ELK re-lays out while the nodes slide
 * to their new slots, then the edges fade back in. Old routes never cut across
 * the new layout mid-flight. The camera refits when the new layout lands
 * (`refocusOnLayoutFlip`, on by default) — a vertical graph grows
 * downward and would otherwise leave most of itself off-screen.
 */
import React, { useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph, type TrailViewerContext } from '../../../subsystem/SubsystemComponentGraph';
import { PierreTrailCodeView } from '../../../pierre/PierreTrailCodeView';
import { PierreFileView } from '../../../pierre/PierreFileView';
import type { SubsystemLayoutDirection } from '../../../subsystem/model';
import type { SubsystemOpenFileOptions } from '../../../subsystem/sourceSpan';
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

const codeTrails = layoutSpec.trails.map((trail) => ({
  ...trail,
  steps: trail.steps.map((step) => ({
    ...step,
    site: {
      symbol: step.symbol,
      span: { startLine: 1, endLine: 110, contentHash: 'fixture' },
    },
  })),
}));

const codeSource = Array.from({ length: 110 }, (_, i) => {
  if (i === 0) return 'export async function handleSession(request: Request) {';
  if (i === 109) return '}';
  if ([18, 42, 88, 95].includes(i + 1)) return '  await sessionService.save(request);';
  return `  // Session processing, line ${i + 1}`;
}).join('\n');
const readCodeSource = async () => codeSource;

function renderTrailCode({ trail, stepIndex, onOpenFile, onVisibleStepChange }: TrailViewerContext) {
  return (
    <PierreTrailCodeView
      trail={trail}
      stepIndex={stepIndex}
      readFile={readCodeSource}
      onOpenFile={onOpenFile}
      onVisibleStepChange={onVisibleStepChange}
    />
  );
}

function renderCodeFile(file: string, opts?: SubsystemOpenFileOptions) {
  return (
    <PierreFileView
      filePath={file}
      fileName={file.split('/').pop() ?? file}
      readFile={readCodeSource}
      focusLine={opts?.startLine}
    />
  );
}

function DirectionDemo({ initial, withCode = false }: { initial: SubsystemLayoutDirection; withCode?: boolean }) {
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={layoutComponents}
        trails={withCode ? codeTrails : layoutSpec.trails}
        defaultLayoutDirection={initial}
        renderTrailViewer={withCode ? renderTrailCode : undefined}
        renderFileViewer={withCode ? renderCodeFile : undefined}
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

/** Select a trail step, then flip the layout: code docks left vertically and bottom horizontally. */
export const WithCodeView: Story = {
  render: () => <DirectionDemo initial="vertical" withCode />,
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
