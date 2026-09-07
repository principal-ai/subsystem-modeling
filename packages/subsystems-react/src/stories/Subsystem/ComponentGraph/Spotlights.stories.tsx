import React, { useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ReactFlowProvider, type NodeProps, type EdgeProps } from '@xyflow/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentNode, SubsystemEdge } from '../../../subsystem/nodes';
import { ComponentDeclaration } from '../../../subsystem/ComponentDeclaration';
import {
  MECHANISM_COLOR,
  type SubsystemComponent,
  type SubsystemEdgeMechanism,
  type SubsystemGraphNode,
  type SubsystemGraphEdge,
} from '../../../subsystem/model';
import { constructColorsFromPierreTheme } from '../../../pierre/constructColors';
import { resolvePierreSyntaxThemeName } from '../../../pierre/pierreSyntaxTheme';
import { useTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Subsystem/ComponentGraph/Spotlights',
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <ReactFlowProvider>
          <Story />
        </ReactFlowProvider>
      </ThemeProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Targeted side-by-side spotlights: each construct's DATA next to its
// RENDERING — no full graph shell. Three spotlights: nodes, mechanisms
// (edges), and anatomy (declaration panels). The mapping these make visible:
// construct:→ node anatomy + color, framework+stereotype → badge label,
// role → topology glyph, detail → drill-down, mechanism → edge color/style.
// ---------------------------------------------------------------------------

/** Data snippet card — the raw object on the left of every row. */
function JsonCard({ label, value, width = 300 }: { label: string; value: unknown; width?: number }) {
  return (
    <div style={{ width, flex: '0 0 auto', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: '#9ca3af',
          padding: '4px 8px',
        }}
      >
        {label}
      </div>
      <pre
        style={{
          margin: 0,
          padding: 10,
          fontFamily: 'monospace',
          fontSize: 10.5,
          lineHeight: 1.5,
          color: '#d8dee9',
          background: '#14171c',
          borderRadius: 6,
          overflow: 'auto',
          maxHeight: 230,
        }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        alignItems: 'stretch',
        background: '#1b1f27',
        border: '1px solid #2c313a',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function RenderPane({ label, width = 380, children }: { label: string; width?: number; children: React.ReactNode }) {
  return (
    <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: '#9ca3af',
          padding: '4px 8px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#10131a',
          borderRadius: 6,
          padding: 16,
          overflow: 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Minimal NodeProps for rendering the real node component outside a pane. */
function nodeProps(c: SubsystemComponent): NodeProps<SubsystemGraphNode> {
  return { data: { component: c }, selected: false, width: 230, height: 84 } as unknown as NodeProps<SubsystemGraphNode>;
}

function edgeProps(mechanism: SubsystemEdgeMechanism, path: string): EdgeProps<SubsystemGraphEdge> {
  return { data: { mechanism, elkPath: path }, markerEnd: `url(#mk-${mechanism})` } as unknown as EdgeProps<SubsystemGraphEdge>;
}

// ---------------------------------------------------------------------------
// Node spotlights — one row per construct/role combination that carries meaning.
// ---------------------------------------------------------------------------
const corePurl = 'pkg:github/principal-ai/principal-view-core-library';

const nodeSpotlights: Array<{ label: string; component: SubsystemComponent; note: string }> = [
  {
    label: 'construct: type_alias — a type alias',
    note: 'the `type` keyword form: `type X = { … }` or a union — anything `=`-assigned',
    component: {
      id: 'alias-status',
      name: 'AnalysisStatus',
      construct: 'type_alias',
      file: 'packages/subsystems-studio/src/bun/analysis.ts',
      purl: corePurl,
      symbol: 'AnalysisStatus',
      detail: {
        kind: 'type',
        properties: [
          { name: 'state', type: "'idle' | 'running' | 'done'" },
          { name: 'startedAt', type: 'number' },
        ],
        usedBy: [],
        implementors: [],
      } satisfies GraphifyComponentDetail,
    },
  },
  {
    label: 'role: entry on construct: type — contract as entry',
    note: 'same role, different inherited anatomy — entries are topology, not shape',
    component: {
        id: 'ipc-entry',
      name: 'StudioMessages',
      construct: 'interface',
      file: 'packages/subsystems-studio/src/shared/contract.ts',
      purl: corePurl,
      symbol: 'StudioMessages',
      role: 'entry',
    },
  },
  {
    label: 'construct: enum — runtime values + a type',
    note: 'the one type-family form that exists at runtime; members render in the drill-down',
    component: {
      id: 'enum-phase',
      name: 'VerificationPhase',
      construct: 'enum',
      file: 'packages/subsystems-studio/src/bun/verify.ts',
      purl: corePurl,
      symbol: 'VerificationPhase',
      detail: {
        kind: 'type',
        properties: [{ name: 'idle' }, { name: 'checking' }, { name: 'done' }],
        usedBy: [],
        implementors: [],
      } satisfies GraphifyComponentDetail,
    },
  },
  {
    label: 'construct: function — plain accessor',
    note: 'indigo; the default for anchored behavior',
    component: {
      id: 'create',
      name: 'createSubsystemModel',
      construct: 'function',
      file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
      purl: corePurl,
      symbol: 'createSubsystemModel',
    },
  },
  {
    label: 'framework: react · stereotype: component — still construct: function',
    note: 'badge reads "react · component"; name wears <> ; color stays function',
    component: {
      id: 'analysis-view',
      name: 'AnalysisView',
      construct: 'function',
      file: 'packages/subsystems-studio/src/mainview/views/AnalysisView.tsx',
      purl: corePurl,
      symbol: 'AnalysisView',
      framework: 'react',
      stereotype: 'component',
      purpose: 'renders a saved analysis as concept cards',
    },
  },
  {
    label: 'framework: react · stereotype: hook',
    note: 'same construct, different stereotype — badge "react · hook", keeps ()',
    component: {
      id: 'drawings-host',
      name: 'useDrawingsHost',
      construct: 'function',
      file: 'packages/subsystems-studio/src/mainview/hooks/useDrawingsHost.ts',
      purl: corePurl,
      symbol: 'useDrawingsHost',
      framework: 'react',
      stereotype: 'hook',
    },
  },
  {
    label: 'role: entry on construct: function — boundary element',
    note: 'orange overrides construct:color; anatomy inherited from the function',
    component: {
      id: 'http-entry',
      name: 'HTTP bridge :3045',
      construct: 'function',
      file: 'packages/subsystems-studio/src/bun/http-server.ts',
      purl: corePurl,
      symbol: 'handleSubsystemModelRequest',
      role: 'entry',
    },
  },
  {
    label: 'construct: class — declaration anatomy',
    note: 'blue; drill-down renders the real class stub with its methods',
    component: {
      id: 'cache',
      name: 'SessionCache',
      construct: 'class',
      file: 'src/session/SessionCache.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      symbol: 'SessionCache',
      detail: {
        kind: 'class',
        methods: [{ nodeId: 'm1', name: 'put', parameters: [{ type: 'SessionRecord' }] }],
        properties: [],
        extends: [],
        implements: [],
        instantiations: [],
        references: [],
      },
    },
  },
  {
    label: 'construct: method — a function bound to its class',
    note: 'dotted symbol (SessionCache.put) is the identity; drill-down renders it inside a host-class stub',
    component: {
      id: 'method-put',
      name: 'put',
      construct: 'method',
      file: 'src/session/SessionCache.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      symbol: 'SessionCache.put',
      detail: {
        kind: 'method',
        hostClass: 'SessionCache',
        parameters: [{ type: 'SessionRecord' }],
      } satisfies GraphifyComponentDetail,
    },
  },
  {
    label: 'construct: store — state-block anatomy',
    note: 'green = the store construct:color; drill-down renders declare const state, never a class stub',
    component: {
      id: 'store',
      name: 'Graph Store',
      construct: 'store',
      file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
      purl: corePurl,
      purpose: 'retained state — anchored to a state location',
      detail: { kind: 'store', properties: [{ name: 'ROOT', type: 'string' }, { name: 'INDEX_PATH', type: 'string' }] },
    },
  },
  {
    label: 'construct: external — actor outside every boundary',
    note: 'purple; no process → drawn outside all regions',
    component: {
      id: 'agents',
      name: 'agent clients',
      construct: 'external',
      file: '',
      purl: 'pkg:generic/local-agent-clients',
    },
  },
  {
    label: 'role: service on construct: external — far-side boundary element',
    note: 'colored by its construct (external); identity via purl, no source at all',
    component: {
      id: 'github',
      name: 'api.github.com',
      construct: 'external',
      file: '',
      purl: 'pkg:generic/api.github.com',
      role: 'service',
    },
  },

];

function NodeSpotlightsDemo() {
  const { mode } = useTheme();
  const constructColors = constructColorsFromPierreTheme(resolvePierreSyntaxThemeName(mode));
  const [activeIds, setActiveIds] = useState<Set<string>>(
    () => new Set(nodeSpotlights.map((n) => n.component.id)),
  );
  const toggle = (id: string) =>
    setActiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  const visible = nodeSpotlights.filter((n) => activeIds.has(n.component.id));

  return (
    <div style={{ padding: 20, overflow: 'auto', height: '100vh', boxSizing: 'border-box', background: '#0f1216' }}>
      <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#d8dee9', marginBottom: 10 }}>
        node spotlights — data (left) → rendered node (right). Hover a node for its role · construct:badge.
      </div>

      {/* Toggle bar — chips colored by each node's own construct color */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#9ca3af' }}>
          show:
        </span>
        {nodeSpotlights.map(({ component }) => {
          const on = activeIds.has(component.id);
          const color = constructColors[component.construct];
          const chip = component.stereotype
            ? component.framework
              ? `${component.framework} · ${component.stereotype}`
              : component.stereotype
            : component.role != null
              ? `${component.construct} · ${component.role}`
              : component.construct;
          return (
            <button
              key={component.id}
              type="button"
              onClick={() => toggle(component.id)}
              style={{
                fontFamily: 'monospace',
                fontSize: 11,
                cursor: 'pointer',
                padding: '4px 12px',
                borderRadius: 999,
                border: `1px solid ${on ? color : '#2c313a'}`,
                background: on ? `${color}26` : 'transparent',
                color: on ? '#d8dee9' : '#6b7280',
              }}
            >
              {on ? '● ' : '○ '}
              {chip}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setActiveIds(new Set(nodeSpotlights.map((n) => n.component.id)))}
          style={{ fontFamily: 'monospace', fontSize: 11, cursor: 'pointer', padding: '4px 10px', borderRadius: 999, border: '1px solid #2c313a', background: 'transparent', color: '#9ca3af' }}
        >
          all
        </button>
        <button
          type="button"
          onClick={() => setActiveIds(new Set())}
          style={{ fontFamily: 'monospace', fontSize: 11, cursor: 'pointer', padding: '4px 10px', borderRadius: 999, border: '1px solid #2c313a', background: 'transparent', color: '#9ca3af' }}
        >
          none
        </button>
      </div>

      {visible.length === 0 && (
        <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>
          nothing selected — toggle constructs on above to compare them
        </div>
      )}
      {visible.map(({ label, component, note }) => (
        <div key={component.id}>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#6b7280', margin: '10px 2px 6px' }}>
            {label} — {note}
          </div>
          <Row>
            <JsonCard label="the data — SubsystemComponent" value={component} />
            <RenderPane label="the rendering — SubsystemComponentNode">
              <SubsystemComponentNode {...nodeProps(component)} />
            </RenderPane>
          </Row>
        </div>
      ))}
    </div>
  );
}

export const NodeSpotlights: Story = {
  render: () => <NodeSpotlightsDemo />,
};

// ---------------------------------------------------------------------------
// Mechanism spotlights — the edge vocabulary with its real colors/styles.
// ---------------------------------------------------------------------------
const mechanismRows: Array<{ mechanism: SubsystemEdgeMechanism; from: string; to: string; note: string }> = [
  { mechanism: 'calls', from: 'http-entry', to: 'create', note: 'dependency — initiator → target' },
  { mechanism: 'writes', from: 'create', to: 'Graph Store', note: 'state access — deep green, target retains the value' },
  { mechanism: 'reads', from: 'get', to: 'Graph Store', note: 'state access — sky, arrow points initiator → state' },
  { mechanism: 'watches', from: 'watcher', to: 'Graph Store', note: 'dashed gray — observes, owns nothing' },
  { mechanism: 'produces', from: 'Graph Store', to: 'broadcast', note: 'flow — the store\u2019s change stream' },
  { mechanism: 'feeds', from: 'broadcast', to: 'rpc-subscribers', note: 'flow — payload consumed, not retained' },
  { mechanism: 'registers-into', from: 'change-listener', to: 'broadcast', note: 'dashed orange — control inverts' },
];

function MechanismSpotlightsDemo() {
  return (
    <div style={{ padding: 20, overflow: 'auto', height: '100vh', boxSizing: 'border-box', background: '#0f1216' }}>
      <SpotlightsMarkerDefs />
      <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#d8dee9', marginBottom: 14 }}>
        mechanism spotlights — the real SubsystemEdge renderer with a sample path per mechanism.
      </div>
      {mechanismRows.map(({ mechanism, from, to, note }) => (
        <div key={mechanism}>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#6b7280', margin: '10px 2px 6px' }}>{note}</div>
          <Row>
            <JsonCard
              label="the data — SubsystemComponentEdge"
              value={{ id: `e-${mechanism}`, from, to, mechanism }}
              width={340}
            />
            <RenderPane label={`the rendering — ${mechanism}`} width={300}>
              <div style={{ width: 280 }}>
                <svg width={280} height={40}>
                  <SubsystemEdge {...edgeProps(mechanism, 'M 12 20 C 90 20, 190 20, 268 20')} />
                </svg>
                <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>
                  {from} ──{mechanism}──▶ {to}
                </div>
              </div>
            </RenderPane>
          </Row>
        </div>
      ))}
    </div>
  );
}

export const MechanismSpotlights: Story = {
  render: () => <MechanismSpotlightsDemo />,
};

// ---------------------------------------------------------------------------
// Anatomy spotlights — the drill-down panel per detail construct: what clicking a
// node opens. store renders state declarations; class/function render their
// real signatures.
// ---------------------------------------------------------------------------
const anatomyComponents: Array<{ label: string; component: SubsystemComponent; note: string }> = [
  {
    label: 'store detail → state block',
    note: 'declare const lines — honest to module-level state; no class stub, no methods',
    component: {
      id: 'store',
      name: 'Graph Store',
      construct: 'store',
      file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
      purl: corePurl,
      detail: {
        kind: 'store',
        properties: [
          { name: 'ROOT', type: 'string' },
          { name: 'INDEX_PATH', type: 'string' },
          { name: 'changeListener', type: 'SubsystemModelChangeListener | null' },
          { name: 'dirWatcher', type: 'FSWatcher | null' },
        ],
      },
    },
  },
  {
    label: 'class detail → class stub',
    note: 'the verifiable access mechanism — methods with typed params + returns',
    component: {
      id: 'cache',
      name: 'SessionCache',
      construct: 'class',
      file: 'src/session/SessionCache.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      symbol: 'SessionCache',
      detail: {
        kind: 'class',
        methods: [
          { nodeId: 'cm1', name: 'put', parameters: [{ type: 'SessionRecord' }] },
          { nodeId: 'cm2', name: 'get', parameters: [{ type: 'string' }], returnType: 'SessionRecord | null' },
        ],
        properties: [],
        extends: [],
        implements: [],
        instantiations: [],
        references: [],
      },
    },
  },
  {
    label: 'function detail → signature',
    note: 'params + return type, callers/callees intentionally not rendered (edges carry them)',
    component: {
      id: 'get',
      name: 'getSubsystemModel',
      construct: 'function',
      file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
      purl: corePurl,
      symbol: 'getSubsystemModel',
      detail: {
        kind: 'function',
        parameters: [{ name: 'graphId', type: 'string' }],
        returnType: 'Promise<StoredSubsystemModel | null>',
        callers: [],
        callees: [],
      },
    },
  },
  {
    label: 'type detail → interface fields',
    note: 'the IPC contract as an entry: anatomy inherited from the type',
    component: {
        id: 'ipc-entry',
      name: 'StudioMessages',
      construct: 'interface',
      file: 'packages/subsystems-studio/src/shared/contract.ts',
      purl: corePurl,
      symbol: 'StudioMessages',
      role: 'entry',
      detail: {
        kind: 'type',
        properties: [
          { name: 'subsystemModelChanged', type: 'push' },
          { name: 'graphifyChanged', type: 'push' },
        ],
        usedBy: [],
        implementors: [],
      },
    },
  },
  {
    label: 'method detail → method in host-class stub',
    note: 'the class is context, the method is the node — same anatomy a standalone function gets, plus the owning class',
    component: {
      id: 'anatomy-method',
      name: 'put',
      construct: 'method',
      file: 'src/session/SessionCache.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      symbol: 'SessionCache.put',
      detail: {
        kind: 'method',
        hostClass: 'SessionCache',
        parameters: [{ name: 'record', type: 'SessionRecord' }],
        returnType: 'void',
      },
    },
  },
  {
    label: 'type_alias detail → braced alias',
    note: 'the alias renders as `type X = { … }` — the honest keyword form',
    component: {
      id: 'anatomy-alias',
      name: 'AnalysisStatus',
      construct: 'type_alias',
      file: 'packages/subsystems-studio/src/bun/analysis.ts',
      purl: corePurl,
      symbol: 'AnalysisStatus',
      detail: {
        kind: 'type',
        properties: [{ name: 'state', type: "'idle' | 'running'" }],
        usedBy: [],
        implementors: [],
      },
    },
  },
  {
    label: 'enum detail → enum declaration',
    note: 'members render inline — the runtime type',
    component: {
      id: 'anatomy-enum',
      name: 'VerificationPhase',
      construct: 'enum',
      file: 'packages/subsystems-studio/src/bun/verify.ts',
      purl: corePurl,
      symbol: 'VerificationPhase',
      detail: {
        kind: 'type',
        properties: [{ name: 'idle' }, { name: 'checking' }, { name: 'done' }],
        usedBy: [],
        implementors: [],
      },
    },
  },
];

function AnatomySpotlightsDemo() {
  return (
    <div style={{ padding: 20, overflow: 'auto', height: '100vh', boxSizing: 'border-box', background: '#0f1216' }}>
      <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#d8dee9', marginBottom: 14 }}>
        anatomy spotlights — data (left) → the drill-down panel you get on click (right).
      </div>
      {anatomyComponents.map(({ label, component, note }) => (
        <div key={component.id}>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#6b7280', margin: '10px 2px 6px' }}>
            {label} — {note}
          </div>
          <Row>
            <JsonCard label="the data — component.detail" value={component.detail} width={320} />
            <RenderPane label="the rendering — ComponentDeclaration">
              <div style={{ width: 360 }}>
                <ComponentDeclaration component={component} />
              </div>
            </RenderPane>
          </Row>
        </div>
      ))}
    </div>
  );
}

export const AnatomySpotlights: Story = {
  render: () => <AnatomySpotlightsDemo />,
};

// Shared SVG marker defs — the arrowheads the spotlit edges reference by url(#…).
function SpotlightsMarkerDefs() {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }}>
      <defs>
        {Object.entries(MECHANISM_COLOR).map(([mechanism, color]) => (
          <marker
            key={mechanism}
            id={`mk-${mechanism}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}
