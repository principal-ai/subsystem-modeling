import React, { Profiler, useCallback, useRef, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import {
  SubsystemAggregateGraph,
  type AggregateLayoutInfo,
} from '../../../subsystem/SubsystemAggregateGraph';
import {
  aggregateFrames,
  aggregateEdges,
  aggregateHubs,
} from './aggregateViewFixture';
import {
  largeAggregateFrames,
  largeAggregateEdges,
  largeAggregateHubs,
} from './aggregateViewLargeFixture';

const meta = {
  title: 'Canvases/Aggregate/AggregateFrameGraph',
  component: SubsystemAggregateGraph,
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
} satisfies Meta<typeof SubsystemAggregateGraph>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Frame-level aggregate: process/module boxes with deduped trail flows.
// Same stack as the component graph (React Flow + ELK), purpose-built nodes.
// Hover highlights the neighborhood; click selects and lists members.
// ---------------------------------------------------------------------------

function AggregateFrameDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <SubsystemAggregateGraph
          frames={aggregateFrames}
          edges={aggregateEdges}
          hubs={aggregateHubs}
          title="Combined graph"
          onSelectFrame={(id) => setSelected(id)}
          onOpenFile={(path) => console.log('[story] open file:', path)}
        />
      </div>
      <div style={{ padding: '4px 12px', fontFamily: 'monospace', fontSize: 12, color: '#aaa', borderTop: '1px solid #333', display: 'flex', gap: 24 }}>
        <span>selected: {selected ?? '(none)'}</span>
        <span>frames: {aggregateFrames.length} hubs: {aggregateHubs.length} edges: {aggregateEdges.length}</span>
      </div>
    </div>
  );
}

export const AggregateFrames: Story = {
  render: () => <AggregateFrameDemo />,
};

// ---------------------------------------------------------------------------
// Performance harness at real scale (the composed graph of one large repo,
// ~4x the fixture above). Reports where the time goes:
//   layout  — wall time of the ELK pass, from `onLayoutComplete`
//   mount   — React commit that painted the laid-out graph (Profiler)
//   hover   — commit cost per hover change, driven by "Hover sweep", which
//             fires real pointer events across the first N nodes
// Numbers are also logged as `[aggregate-perf]` for scripted runs.
// ---------------------------------------------------------------------------

interface PerfStats {
  layout?: AggregateLayoutInfo;
  /** Longest single React commit while the graph was laying out / mounting. */
  mountCommitMs: number;
  /** Hover sweep: commits recorded, total and worst commit duration. */
  sweep?: { nodes: number; commits: number; totalMs: number; maxMs: number; wallMs: number };
}

function fmt(ms: number | undefined): string {
  return ms === undefined ? '—' : `${ms.toFixed(1)}ms`;
}

function AggregatePerfHarness({ sweepCount = 40 }: { sweepCount?: number }) {
  const [stats, setStats] = useState<PerfStats>({ mountCommitMs: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  // Set while a sweep runs so Profiler commits are attributed to hover.
  const sweepRef = useRef<{ commits: number; totalMs: number; maxMs: number } | null>(null);

  const onRender = useCallback(
    (_id: string, _phase: string, actualDuration: number) => {
      const sweep = sweepRef.current;
      if (sweep) {
        sweep.commits += 1;
        sweep.totalMs += actualDuration;
        sweep.maxMs = Math.max(sweep.maxMs, actualDuration);
        return;
      }
      setStats((s) =>
        actualDuration > s.mountCommitMs ? { ...s, mountCommitMs: actualDuration } : s,
      );
    },
    [],
  );

  const onLayoutComplete = useCallback((info: AggregateLayoutInfo) => {
    console.log('[aggregate-perf] layout', info);
    setStats((s) => ({ ...s, layout: info }));
  }, []);

  const runSweep = useCallback(async () => {
    const host = hostRef.current;
    if (!host) return;
    const nodes = Array.from(
      host.querySelectorAll<HTMLElement>('.react-flow__node-aggregate-frame'),
    ).slice(0, sweepCount);
    if (nodes.length === 0) return;
    const sweep = { commits: 0, totalMs: 0, maxMs: 0 };
    sweepRef.current = sweep;
    const start = performance.now();
    // React derives onMouseEnter/Leave from mouseover/mouseout, so those are
    // the events a synthetic hover has to send.
    const fire = (el: HTMLElement, type: string) =>
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
    for (const el of nodes) {
      fire(el, 'mouseover');
      // Yield a frame so React commits each hover separately, like a real pointer.
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      fire(el, 'mouseout');
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    }
    // Let the final commit land before reading.
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    sweepRef.current = null;
    const result = { nodes: nodes.length, ...sweep, wallMs: performance.now() - start };
    console.log('[aggregate-perf] sweep', result);
    setStats((s) => ({ ...s, sweep: result }));
  }, [sweepCount]);

  const mono: React.CSSProperties = { fontFamily: 'monospace', fontSize: 12, color: '#aaa' };
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div ref={hostRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <Profiler id="aggregate" onRender={onRender}>
          <SubsystemAggregateGraph
            frames={largeAggregateFrames}
            edges={largeAggregateEdges}
            hubs={largeAggregateHubs}
            title="Combined graph (large)"
            onSelectFrame={setSelected}
            onLayoutComplete={onLayoutComplete}
          />
        </Profiler>
      </div>
      <div
        data-testid="perf-stats"
        style={{ ...mono, padding: '6px 12px', borderTop: '1px solid #333', display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <span>
          frames: {largeAggregateFrames.length} hubs: {largeAggregateHubs.length} edges: {largeAggregateEdges.length}
        </span>
        <span data-testid="perf-layout">
          layout: {fmt(stats.layout?.layoutMs)}
          {stats.layout ? ` (${stats.layout.nodes} nodes, ${stats.layout.groups} groups${stats.layout.fallback ? ', FALLBACK' : ''})` : ''}
        </span>
        <span data-testid="perf-mount">mount commit: {fmt(stats.mountCommitMs)}</span>
        <span data-testid="perf-sweep">
          hover sweep:{' '}
          {stats.sweep
            ? `${stats.sweep.commits} commits over ${stats.sweep.nodes} nodes, avg ${fmt(stats.sweep.totalMs / Math.max(1, stats.sweep.commits))}, max ${fmt(stats.sweep.maxMs)}, wall ${fmt(stats.sweep.wallMs)}`
            : '—'}
        </span>
        <button
          type="button"
          onClick={() => void runSweep()}
          disabled={!stats.layout}
          style={{ ...mono, color: '#ddd', background: '#222', border: '1px solid #444', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
        >
          Hover sweep
        </button>
        <span>selected: {selected ?? '(none)'}</span>
      </div>
    </div>
  );
}

export const LargeAggregatePerf: Story = {
  render: () => <AggregatePerfHarness />,
};
