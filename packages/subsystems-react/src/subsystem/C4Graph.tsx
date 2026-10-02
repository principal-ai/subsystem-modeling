/**
 * C4Graph — a C4 projection of a (composed) subsystem model on React Flow.
 *
 * Prototype test case: feed it a `C4Model` from `toC4()` and it draws the
 * system as a compound frame, its containers (or components) as boxes, and
 * externals/actors outside the system. `trail` steps render as flow
 * edges. Click a box to list the source components it rolled up.
 *
 * Same interaction language as the other graphs: React Flow + ELK + the shared
 * `GRAPH_NAV_PROPS` chrome. Deliberately small — no measurement passes, no
 * drawers, no trail playback.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Edge,
  Handle,
  MarkerType,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { useTheme } from '@principal-ade/industry-theme';
import { computeElkLayout } from '../utils/elkLayout';
import { MECHANISM_COLOR } from './model';
import { C4NodeCard, NODE_H, NODE_W, nodeStyle } from './C4NodeCard';
import { GRAPH_CANVAS_CLASS, GRAPH_NAV_PROPS, GraphChrome, GraphLayerStyle } from './graphChrome';
import type { C4Model, C4Node } from './toC4';

export interface C4GraphProps {
  model: C4Model;
  title?: string;
  onSelectNode?: (id: string | null) => void;
}

function edgeColor(mechanism: string | undefined, fallback: string): string {
  if (!mechanism) return fallback;
  return (MECHANISM_COLOR as Record<string, string>)[mechanism] ?? fallback;
}

function C4NodeView(props: NodeProps<Node<{ node: C4Node; selected: boolean }>>) {
  const { node, selected } = props.data;
  return (
    <C4NodeCard
      node={node}
      selected={selected}
      handles={
        <>
          <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
          <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
        </>
      }
    />
  );
}

function C4GroupView(props: NodeProps<Node<{ label: string; kind: 'system' | 'container'; color: string }>>) {
  const { theme } = useTheme();
  const color = props.data.color;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        borderRadius: 12,
        border: `2px dashed ${color}`,
        background: 'transparent',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 0,
          transform: 'translateY(-50%)',
          left: 12,
          zIndex: 1,
          fontFamily: theme.fonts.monospace,
          fontSize: theme.fontSizes[2],
          fontWeight: 600,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          lineHeight: '18px',
          color,
          background: theme.colors.background,
          boxShadow: `0 0 0 1.5px ${theme.colors.background}`,
          border: `2px solid ${color}`,
          borderRadius: 4,
          padding: '4px 10px',
          boxSizing: 'border-box',
          whiteSpace: 'nowrap',
        }}
      >
        {props.data.label}
      </span>
    </div>
  );
}

const nodeTypes = {
  'c4-node': C4NodeView,
  'c4-group': C4GroupView,
};

function Inner({ model, title, onSelectNode }: C4GraphProps) {
  const { theme } = useTheme();
  const { fitView } = useReactFlow();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const [nodes, setNodes] = useState<Node[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const layoutKey = useMemo(
    () =>
      [
        ...model.nodes.map((n) => `${n.id}\0${n.parentId ?? ''}\0${n.label}`).sort(),
        ...model.groups.map((g) => `${g.id}\0${g.parentId ?? ''}\0${g.memberIds.length}`).sort(),
        ...model.edges.map((e) => `${e.id}\0${e.count}`).sort(),
      ].join('\n'),
    [model],
  );

  useEffect(() => {
    let alive = true;
    setReady(false);
    setSelectedId(null);

    const rfNodes: Node[] = model.nodes.map((n, i) => ({
      id: n.id,
      type: 'c4-node',
      position: { x: (i % 5) * (NODE_W + 44), y: Math.floor(i / 5) * (NODE_H + 44) },
      width: NODE_W,
      height: NODE_H,
      ...(n.parentId ? { parentId: n.parentId } : {}),
      data: { node: n, selected: false },
    }));

    const groups = model.groups.map((g) => ({
      id: g.id,
      memberIds: g.memberIds,
      ...(g.parentId ? { parentId: g.parentId } : {}),
    }));

    const rfEdges: Edge[] = model.edges.map((e) => {
      const flow = e.kind === 'flow';
      const color = flow ? edgeColor(e.mechanisms[0], muted) : (theme.colors.border ?? '#666');
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        labelShowBg: false,
        labelStyle: { fill: muted, fontSize: theme.fontSizes[0], fontFamily: theme.fonts.monospace },
        style: {
          stroke: color,
          strokeWidth: 1 + Math.min(e.count, 6) * 0.4,
          ...(flow ? { strokeDasharray: '6 4' } : {}),
        },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
        data: { edge: e },
      };
    });

    void computeElkLayout(rfNodes, rfEdges, {
      direction: 'RIGHT',
      preserveNodePositions: false,
      groups,
      keepSingletonGroups: true,
    })
      .then((result) => {
        if (!alive) return;
        const positioned = new Map(result.nodes.map((n) => [n.id, n]));
        const builtGroups = new Set(result.groupBounds.keys());
        const groupById = new Map(model.groups.map((g) => [g.id, g]));

        const depthOf = (id: string): number => {
          let d = 0;
          let g = groupById.get(id);
          while (g?.parentId) {
            d += 1;
            g = groupById.get(g.parentId);
          }
          return d;
        };

        const shells: Node[] = [...result.groupBounds.entries()]
          .sort((a, b) => depthOf(a[0]) - depthOf(b[0]))
          .map(([id, b]) => {
            const def = groupById.get(id);
            const parentId = def?.parentId && builtGroups.has(def.parentId) ? def.parentId : undefined;
            return {
              id,
              type: 'c4-group',
              position: { x: b.x, y: b.y },
              width: Math.max(200, b.width),
              height: Math.max(120, b.height),
              draggable: false,
              selectable: false,
              ...(parentId ? { parentId } : {}),
              data: {
                label: def?.label ?? id,
                kind: def?.kind ?? 'container',
                color: def?.kind === 'system' ? (theme.colors.text ?? '#888') : (theme.colors.accent ?? theme.colors.info),
              },
            };
          });

        const leaves = rfNodes.map((n) => {
          const p = positioned.get(n.id);
          const node = p ? { ...n, position: { x: p.position.x, y: p.position.y } } : n;
          const parentId = (node as { parentId?: string }).parentId;
          if (parentId && !builtGroups.has(parentId)) {
            const { parentId: _drop, ...rest } = node as { parentId?: string } & Node;
            return rest as Node;
          }
          return node;
        });

        setNodes([...shells, ...leaves]);
        setRfEdges(rfEdges);
        setReady(true);
        requestAnimationFrame(() => fitView({ padding: 0.15 }));
      })
      .catch((err) => {
        if (!alive) return;
        console.warn('[c4-graph] ELK layout failed, using grid:', err);
        setNodes(rfNodes);
        setRfEdges(rfEdges);
        setReady(true);
        requestAnimationFrame(() => fitView({ padding: 0.15 }));
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  const selected = useMemo(() => model.nodes.find((n) => n.id === selectedId) ?? null, [model, selectedId]);

  const displayNodes = useMemo(
    () =>
      nodes.map((n) =>
        n.type === 'c4-node'
          ? { ...n, data: { ...n.data, selected: n.id === selectedId } }
          : n,
      ),
    [nodes, selectedId],
  );

  const runtime = model.nodes.filter((n) => n.kind === 'container' || n.kind === 'component').length;
  const outside = model.nodes.filter((n) => n.kind === 'external' || n.kind === 'actor').length;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: theme.colors.background }}>
      <GraphLayerStyle />
      <ReactFlow
        nodes={displayNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        className={GRAPH_CANVAS_CLASS}
        {...GRAPH_NAV_PROPS}
        onNodeClick={(_e, node) => {
          if (node.type !== 'c4-node') return;
          const next = node.id === selectedId ? null : node.id;
          setSelectedId(next);
          onSelectNode?.(next);
        }}
        onPaneClick={() => {
          setSelectedId(null);
          onSelectNode?.(null);
        }}
        proOptions={{ hideAttribution: true }}
      >
        <GraphChrome />
      </ReactFlow>
      {!ready && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: theme.colors.background,
            color: muted,
            fontFamily: theme.fonts.monospace,
            fontSize: theme.fontSizes[0],
          }}
        >
          Laying out C4 view…
        </div>
      )}
      {title && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            fontSize: theme.fontSizes[2],
            fontWeight: 600,
            color: theme.colors.text,
            background: theme.colors.backgroundSecondary ?? theme.colors.background,
            border: `1px solid ${theme.colors.border ?? '#333'}`,
            borderRadius: 6,
            padding: '4px 10px',
          }}
        >
          {title}
          <span style={{ fontFamily: theme.fonts.monospace, fontSize: theme.fontSizes[0], color: muted, marginLeft: 8 }}>
            {model.view} view · {runtime} {model.view === 'container' ? 'containers' : 'components'} · {outside} outside
          </span>
        </div>
      )}
      {selected && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 280,
            maxHeight: 'calc(100% - 24px)',
            overflowY: 'auto',
            background: theme.colors.backgroundSecondary ?? theme.colors.background,
            border: `1px solid ${theme.colors.border ?? '#333'}`,
            borderRadius: 8,
            padding: '10px 12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, color: theme.colors.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.label}
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                onSelectNode?.(null);
              }}
              aria-label="Clear selection"
              style={{ border: 'none', background: 'transparent', color: muted, cursor: 'pointer', fontSize: theme.fontSizes[2], lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          <div style={{ fontFamily: theme.fonts.monospace, fontSize: theme.fontSizes[0], color: muted, margin: '4px 0 8px' }}>
            {selected.kind} · {selected.members.length} component{selected.members.length === 1 ? '' : 's'}
            {selected.models && selected.models.length > 0 ? ` · ${selected.models.length} model${selected.models.length === 1 ? '' : 's'}` : ''}
          </div>

          {/* Confirmation state, with what is still missing. */}
          {selected.kind === 'container' && (
            <div
              style={{
                fontFamily: theme.fonts.monospace,
                fontSize: theme.fontSizes[0],
                color: muted,
                borderTop: `1px solid ${theme.colors.border ?? '#333'}`,
                paddingTop: 6,
                marginBottom: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
              }}
            >
              <span style={{ color: nodeStyle(selected, theme).color }}>
                {selected.decoration?.state ?? 'unconfirmed'} · {selected.decoration?.type ?? 'no type'}
              </span>
              {selected.decoration?.technology ? (
                <span>technology: {selected.decoration.technology}</span>
              ) : (
                <span style={{ color: theme.colors.warning ?? '#e8a33a' }}>technology: not stated</span>
              )}
              {selected.decoration?.description ? (
                <span style={{ whiteSpace: 'normal', lineHeight: 1.4 }}>{selected.decoration.description}</span>
              ) : (
                <span style={{ color: theme.colors.warning ?? '#e8a33a' }}>description: not stated</span>
              )}
              {/* A merge hides its inputs, so always show what it absorbed. */}
              {selected.sourceKeys && selected.sourceKeys.length > 1 && (
                <span style={{ whiteSpace: 'normal', lineHeight: 1.4 }}>
                  merged from: {selected.sourceKeys.join(', ')}
                </span>
              )}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {selected.members.map((alias) => (
              <span
                key={alias}
                title={alias}
                style={{
                  fontFamily: theme.fonts.monospace,
                  fontSize: theme.fontSizes[0],
                  color: theme.colors.text,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {alias}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function C4Graph(props: C4GraphProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
