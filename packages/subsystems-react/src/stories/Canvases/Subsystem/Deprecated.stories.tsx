import React from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ReactFlowProvider, type NodeProps } from '@xyflow/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentNode } from '../../../subsystem/nodes';
import type {
  SubsystemComponent,
  SubsystemGraphNode,
} from '../../../subsystem/model';

/**
 * `deprecated` marks a claim whose source is gone upstream. The node keeps a
 * transitional marker until a cleanup pass removes it.
 */
const meta = {
  title: 'Canvases/Subsystem/UI Isolation/Deprecated',
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

const PURL = 'pkg:github/principal-ai/subsystem-modeling';

function nodeProps(c: SubsystemComponent): NodeProps<SubsystemGraphNode> {
  return {
    data: { component: c },
    selected: false,
    width: 230,
    height: 84,
  } as unknown as NodeProps<SubsystemGraphNode>;
}

/** Side-by-side single-node spotlights — deprecated vs its live neighbours. */
function NodeSpotlight({
  label,
  component,
}: {
  label: string;
  component: SubsystemComponent;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 260 }}>
      <div
        style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: 11,
          color: '#888',
          minHeight: 32,
        }}
      >
        {label}
      </div>
      <div style={{ position: 'relative', height: 110, width: 240 }}>
        <SubsystemComponentNode {...nodeProps(component)} />
      </div>
      <pre
        style={{
          margin: 0,
          fontSize: 10,
          fontFamily: 'ui-monospace, monospace',
          background: '#1a1a1a',
          color: '#ccc',
          padding: 8,
          borderRadius: 4,
          overflow: 'auto',
        }}
      >
        {JSON.stringify(
          {
            construct: component.construct,
            deprecated: component.deprecated || undefined,
            removedIn: component.removedIn,
            role: component.role,
            symbol: component.symbol || undefined,
            file: component.file || undefined,
          },
          null,
          2,
        )}
      </pre>
    </div>
  );
}

const spotlightRows: Array<{ label: string; component: SubsystemComponent }> = [
  {
    label: 'live function (baseline)',
    component: {
      alias: 'live-fn',
      name: 'auditSubsystemModel',
      construct: 'function',
      file: 'src/bun/verify-subsystem-component.ts',
      purl: PURL,
      symbol: 'auditSubsystemModel',
      purpose: 'Deterministic dry-run audit of a stored model',
    },
  },
  {
    label: 'deprecated + removedIn — slate border, badge',
    component: {
      alias: 'dead-fn',
      name: 'auditTopologyRelations',
      construct: 'function',
      file: 'src/bun/topology-audit.ts',
      purl: PURL,
      symbol: 'auditTopologyRelations',
      purpose: 'Verifies authored relations[] endpoints',
      deprecated: true,
      removedIn: {
        commit: 'e168afc',
        reason: 'Remove topology relations; nest module boundaries by path',
      },
    },
  },
  {
    label: 'deprecated, no removedIn (bare marker)',
    component: {
      alias: 'dead-bare',
      name: 'graphifyHasRelationBetween',
      construct: 'function',
      file: 'src/bun/topology-audit.ts',
      purl: PURL,
      symbol: 'graphifyHasRelationBetween',
      purpose: 'Relation predicate over the graphify edge set',
      deprecated: true,
    },
  },
  {
    label: 'deprecated + role: entry (badge shows deprecated only)',
    component: {
      alias: 'dead-entry',
      name: 'topologyRelationsAudit',
      construct: 'function',
      file: 'src/bun/topology-audit.ts',
      purl: PURL,
      symbol: 'topologyRelationsAudit',
      purpose: 'Audit entry for relation endpoints',
      deprecated: true,
      role: 'entry',
    },
  },
];

/** Spotlights: slate deprecated badge + border vs live and entry. */
export const Spotlights: Story = {
  render: () => (
    <div
      style={{
        padding: 24,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 28,
        alignItems: 'flex-start',
        minHeight: '100vh',
        boxSizing: 'border-box',
      }}
    >
      {spotlightRows.map((row) => (
        <NodeSpotlight key={row.component.alias} {...row} />
      ))}
    </div>
  ),
};

/**
 * The popover states, isolated — every badge variant the popover can render.
 * `Spotlights` shows the closed badge only; this is what the click opens.
 */
export function RemovalPopover() {
  const deprecatedColor = '#6b7280';
  const variants = [
    {
      label: 'with removedIn',
      removal: {
        commit: 'e168afc',
        reason: 'Remove topology relations; nest module boundaries by path',
      },
    },
    { label: 'no removedIn (fallback copy)', removal: undefined },
  ] as const;
  return (
    <div style={{ display: 'flex', gap: 24, padding: 24, alignItems: 'flex-start' }}>
      {variants.map((v) => (
        <div key={v.label} style={{ width: 300 }}>
          <div
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 11,
              color: '#888',
              marginBottom: 6,
            }}
          >
            {v.label}
          </div>
          <div
            role="dialog"
            aria-label="Removal provenance"
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              background: '#1f1f1f',
              border: `1px solid ${deprecatedColor}`,
              boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 13,
              color: '#eee',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4, color: deprecatedColor }}>
              Deprecated
            </div>
            {v.removal ? (
              <>
                <div style={{ fontFamily: 'ui-monospace, monospace', marginBottom: 4 }}>
                  removed in {v.removal.commit}
                </div>
                {v.removal.reason && <div style={{ color: '#aaa' }}>{v.removal.reason}</div>}
              </>
            ) : (
              <div style={{ color: '#aaa' }}>
                This claim's source was removed upstream.
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The removal-provenance popover, both copy variants. */
export const Popover: Story = {
  render: () => <RemovalPopover />,
};