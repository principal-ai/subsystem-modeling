import React, { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { GraphSidebar } from '../../../subsystem/GraphSidebar';
import { TrailsPanel } from '../../../subsystem/TrailsPanel';
import {
  DRILLDOWN_COMPONENTS,
  DRILLDOWN_DOC,
  DRILLDOWN_TRAILS,
} from '../../../subsystem/__fixtures__/c4Drilldown';

/**
 * `GraphSidebar` — the side panel extracted out of `SubsystemComponentGraph`,
 * on its own. It owns the chrome and nothing else: the host supplies the
 * header / tabs / body / footer, and the panel owns the resize handle, the
 * width, and its persistence.
 *
 * Everything below is the real reviewed model `sg-1788913589907-ieokymqg9`
 * ("Gist share from Studio") the drill-down story is built on — the same
 * header the component graph shows, the same `TrailsPanel` body, the same
 * trails — so the panel is exercised against the content it actually carries,
 * not a mock. Drag the right edge to resize (the width persists); switch to
 * the Files tab for the component file inventory.
 */

const META_DESCRIPTION =
  'The subsystem the C4 view summarizes. Focused trails are the implementation of the selected C4 line.';

/** Distinct, real component file paths — the inventory the Files tab lists. */
const COMPONENT_FILES = [
  ...new Set(DRILLDOWN_COMPONENTS.map((c) => c.file).filter(Boolean)),
].sort();

const STEP_COUNT = DRILLDOWN_TRAILS.reduce((n, t) => n + t.steps.length, 0);

function SidebarHeader() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13, color: '#ddd' }}>
        {DRILLDOWN_DOC.title}
      </span>
      <span style={{ fontSize: 12, color: '#777', lineHeight: 1.5 }}>{META_DESCRIPTION}</span>
    </div>
  );
}

function FilesBody() {
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 4px' }}>
      {COMPONENT_FILES.map((file) => (
        <div
          key={file}
          title={file}
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#999',
            padding: '4px 8px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {file}
        </div>
      ))}
    </div>
  );
}

function SidebarFooter() {
  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: `1px solid ${defaultEditorTheme.colors.border}`,
        padding: '6px 12px',
        fontFamily: 'monospace',
        fontSize: 11,
        color: '#777',
      }}
    >
      {DRILLDOWN_TRAILS.length} trails · {STEP_COUNT} steps
    </div>
  );
}

function PanelDemo({ controlled = false }: { controlled?: boolean }) {
  const [tab, setTab] = useState('trails');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusedTrailId, setFocusedTrailId] = useState<string | null>(null);
  const [focusedStepIndex, setFocusedStepIndex] = useState<number | null>(null);
  const [hoveredTrailStep, setHoveredTrailStep] = useState<{
    trailId: string;
    stepIndex: number | null;
  } | null>(null);
  const [width, setWidth] = useState(360);

  const body = useMemo(() => {
    if (tab === 'files') return <FilesBody />;
    return (
      <TrailsPanel
        trails={DRILLDOWN_TRAILS}
        expandedTrails={expanded}
        focusedTrailId={focusedTrailId}
        focusedStepIndex={focusedStepIndex}
        hoveredTrailStep={hoveredTrailStep}
        onToggleCollapsed={(id) =>
          setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        onFocusFlow={(tl) => {
          setFocusedTrailId(tl.id);
          setFocusedStepIndex(null);
        }}
        onClearFocus={() => {
          setFocusedTrailId(null);
          setFocusedStepIndex(null);
        }}
        onFocusStep={(tl, stepIndex) => {
          setFocusedTrailId(tl.id);
          setFocusedStepIndex(stepIndex);
        }}
        onHoverStep={(tl, stepIndex) => setHoveredTrailStep({ trailId: tl.id, stepIndex })}
        onHoverFlow={(tl) => setHoveredTrailStep({ trailId: tl.id, stepIndex: null })}
        onLeaveStep={() => setHoveredTrailStep(null)}
      />
    );
  }, [tab, expanded, focusedTrailId, focusedStepIndex, hoveredTrailStep]);

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'row',
        background: defaultEditorTheme.colors.background,
        fontFamily: 'monospace',
      }}
    >
      <GraphSidebar
        header={<SidebarHeader />}
        tabs={[
          { id: 'trails', label: 'Trails' },
          { id: 'files', label: 'Files' },
        ]}
        activeTab={tab}
        onTabChange={setTab}
        sidebarBody={body}
        footer={<SidebarFooter />}
        persistKey={controlled ? undefined : 'sidebar-story'}
        {...(controlled ? { width, onWidthChange: setWidth } : {})}
      />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#555',
          fontSize: 12,
        }}
      >
        {controlled
          ? `controlled width: ${width}px — drag the handle; the host owns the value`
          : 'the panel on its own — the graph would render to the right'}
      </div>
    </div>
  );
}

const meta = {
  title: 'Subsystem/Sidebar/GraphSidebar',
  component: GraphSidebar,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof GraphSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The panel with no graph beside it: real header, Trails/Files tabs, the real
 *  `TrailsPanel` body, and a footer. Drag the right edge — the width is
 *  remembered under `sidebar-story`. */
export const Panel: Story = {
  render: () => <PanelDemo />,
};

/** Controlled width: the host owns the value (here, local state), so drags
 *  report through `onWidthChange` instead of persisting. */
export const ControlledWidth: Story = {
  render: () => <PanelDemo controlled />,
};