/**
 * SubsystemAggregateGraph — frame-level overview canvas.
 *
 * Same stack and interaction language as SubsystemComponentGraph
 * (React Flow + ELK + custom nodes + select/hover), but purpose-built for
 * composed views: nodes are process / module frames (plus one ungrouped
 * bucket), edges are the deduped walkthrough flows between them.
 *
 * Deliberately leaner than the component graph: fixed node sizes (no
 * measurement passes), flat ELK layout (no compound groups, so the
 * double-parent failure mode is structurally impossible), no edge labels,
 * no walkthrough playback, no drawers. Frame detail (members, models)
 * renders in a side panel.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { describeConstructBreakdown, MECHANISM_COLOR } from './model';
import { GRAPH_NAV_PROPS, GraphChrome } from './graphChrome';

export interface AggregateFrameMember {
  alias: string;
  name: string;
  file: string;
  construct: string;
  models: string[];
}

export interface AggregateFrameNode {
  id: string;
  kind: 'module' | 'process' | 'external' | 'ungrouped';
  key: string;
  label: string;
  /**
   * Enclosing boundary: process code frames nest in their process frame,
   * every external frame in the single external boundary. Absent =
   * root-level (module with no process, ungrouped).
   */
  group?: { key: string; kind: 'process' | 'external' };
  members: AggregateFrameMember[];
  models: string[];
}

export interface AggregateFrameEdge {
  from: string;
  to: string;
  mechanisms: string[];
  walkthroughIds: string[];
  steps: number;
  /** Real member endpoint behind a hub-routed edge (see aggregate). */
  source?: string;
  target?: string;
}

/** Intake/outtake hub for a multi-frame boundary. */
export interface AggregateHub {
  id: string;
  group: { key: string; kind: 'process' | 'external' };
  kind: 'intake' | 'outtake';
  label: string;
}

export interface SubsystemAggregateGraphProps {
  frames: AggregateFrameNode[];
  edges: AggregateFrameEdge[];
  /** Intake/outtake hubs; rendered as compact pills inside their boundary. */
  hubs?: AggregateHub[];
  title?: string;
  onSelectFrame?: (id: string | null) => void;
  onOpenFile?: (path: string) => void;
}

const NODE_W = 232;
const NODE_H = 78;

function edgeColor(mechanism: string | undefined, fallback: string): string {
  if (!mechanism) return fallback;
  return (MECHANISM_COLOR as Record<string, string>)[mechanism] ?? fallback;
}

function AggregateFrameGroupView(
  props: NodeProps<Node<{ label: string; kind: 'process' | 'external' }>>,
) {
  const { theme } = useTheme();
  const external = props.data.kind === 'external';
  const border = external
    ? (theme.colors.warning ?? theme.colors.accent ?? theme.colors.info)
    : (theme.colors.border ?? '#333');
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        borderRadius: 12,
        border: `2px ${external ? 'solid' : 'dashed'} ${border}`,
        background: 'transparent',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: -11,
          left: 12,
          fontFamily: theme.fonts.monospace,
          fontSize: theme.fontSizes[1],
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: external
            ? border
            : (theme.colors.textMuted ?? theme.colors.textSecondary),
          background: theme.colors.background,
          padding: '0 8px',
          whiteSpace: 'nowrap',
        }}
      >
        {props.data.label}
      </span>
    </div>
  );
}

const HUB_W = 96;
const HUB_H = 30;

function AggregateHubNodeView(
  props: NodeProps<Node<{ hub: AggregateHub }>>,
) {
  const { theme } = useTheme();
  const { hub } = props.data;
  const color =
    hub.group.kind === 'external'
      ? (theme.colors.warning ?? theme.colors.accent ?? theme.colors.info)
      : (theme.colors.border ?? '#333');
  return (
    <div
      style={{
        width: HUB_W,
        height: HUB_H,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: HUB_H / 2,
        border: `1px solid ${color}`,
        background: theme.colors.background,
        color: theme.colors.textMuted ?? theme.colors.textSecondary,
        fontFamily: theme.fonts.monospace,
        fontSize: theme.fontSizes[0],
        letterSpacing: 0.4,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
      title={hub.label}
    >
      {hub.kind === 'intake' ? '▸ in' : 'out ▸'}
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

function AggregateFrameNodeView(
  props: NodeProps<
    Node<{ frame: AggregateFrameNode; selected: boolean; dimmed: boolean; nested?: boolean }>
  >,
) {
  const { theme } = useTheme();
  const { data } = props;
  const f = data.frame;
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  // Process buckets read as sub-regions, not entities: dashed boundary
  // chrome and a flat fill, mirroring the group frames. Externals are real
  // systems — solid chrome like other nodes, just without a module tag.
  // Module/ungrouped boxes keep solid node chrome.
  const boundaryStyled = f.kind === 'process';
  // A process box nested inside its own process boundary would otherwise
  // repeat the boundary's name — it holds that process's module-less
  // members, so it says so. Root-level boxes keep their key for context.
  // External boxes never nest in a same-named frame (their boundary is the
  // shared `external` one), so they always keep their system name.
  const title = f.kind === 'process' && data.nested ? 'unframed' : f.label;
  const fullTitle =
    f.kind === 'process' && data.nested ? `${f.label} · unframed members` : f.label;
  return (
    <div
      style={{
        width: NODE_W,
        height: NODE_H,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 2,
        padding: '8px 12px',
        borderRadius: 8,
        // The unframed bucket paints the canvas background rather than
        // staying transparent, so routed edges don't show through its label.
        background: boundaryStyled
          ? theme.colors.background
          : (theme.colors.backgroundSecondary ?? theme.colors.background),
        border: `2px ${boundaryStyled ? 'dashed' : 'solid'} ${
          data.selected ? theme.colors.primary : (theme.colors.border ?? '#333')
        }`,
        boxShadow: boundaryStyled ? 'none' : '0 1px 4px rgba(0,0,0,0.25)',
        opacity: data.dimmed ? 0.35 : 1,
        transition: 'opacity 120ms ease, border-color 120ms ease',
        cursor: 'pointer',
        fontFamily: theme.fonts.body,
      }}
    >
      {f.kind === 'module' && (
        <span
          style={{
            fontFamily: theme.fonts.monospace,
            fontSize: theme.fontSizes[0],
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            color: theme.colors.accent ?? theme.colors.info,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          module
        </span>
      )}
      <span
        style={{
          fontWeight: 600,
          fontSize: theme.fontSizes[2],
          color: theme.colors.text,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={fullTitle}
      >
        {title}
      </span>
      <span
        style={{
          fontFamily: theme.fonts.monospace,
          fontSize: theme.fontSizes[0],
          color: muted,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {/* Boxes describe their contents (constructs), not their container —
            the frame boundary already says which process/module this is. */}
        {describeConstructBreakdown(f.members.map((m) => m.construct))}
        {f.models.length > 0 ? ` · ${f.models.length} model${f.models.length === 1 ? '' : 's'}` : ''}
      </span>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = {
  'aggregate-frame': AggregateFrameNodeView,
  'aggregate-frame-group': AggregateFrameGroupView,
  'aggregate-hub': AggregateHubNodeView,
};

function Inner({
  frames,
  edges,
  hubs = [],
  title,
  onSelectFrame,
  onOpenFile,
}: SubsystemAggregateGraphProps) {
  const { theme } = useTheme();
  const { fitView } = useReactFlow();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const [nodes, setNodes] = useState<Node[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const layoutKey = useMemo(
    () =>
      [
        ...frames.map((f) => f.id).sort(),
        ...edges.map((e) => `${e.from}\0${e.to}\0${e.steps}`).sort(),
      ].join('\n'),
    [frames, edges, hubs],
  );

  useEffect(() => {
    let alive = true;
    setReady(false);
    setSelectedId(null);
    // Compound process frames: each box is parented to exactly one process
    // group (its majority process); process member-boxes to their own
    // process; the rest stays root-level. Exclusive assignment by
    // construction — the double-parent failure mode cannot occur here.
    const groupIdFor = (kind: 'process' | 'external', key: string) =>
      `frame:${kind}:${key}`;
    const groupDefs = new Map<string, { id: string; kind: 'process' | 'external'; key: string }>();
    for (const f of frames) {
      if (!f.group) continue;
      const id = groupIdFor(f.group.kind, f.group.key);
      if (!groupDefs.has(id)) groupDefs.set(id, { id, ...f.group });
    }
    const rfNodes: Node[] = [
      ...frames.map((f, i) => ({
        id: f.id,
        type: 'aggregate-frame',
        // Pre-ELK grid slot; replaced by ELK positions below.
        position: { x: (i % 4) * (NODE_W + 60), y: Math.floor(i / 4) * (NODE_H + 40) },
        width: NODE_W,
        height: NODE_H,
        ...(f.group ? { parentId: groupIdFor(f.group.kind, f.group.key) } : {}),
        data: { frame: f, selected: false, dimmed: false },
      })),
      ...hubs.map((h) => ({
        id: h.id,
        type: 'aggregate-hub',
        position: { x: 0, y: 0 },
        width: HUB_W,
        height: HUB_H,
        parentId: groupIdFor(h.group.kind, h.group.key),
        data: { hub: h },
      })),
    ];
    const groups = [...groupDefs.values()].map((g) => ({
      id: g.id,
      memberIds: [
        ...frames
          .filter((f) => f.group?.kind === g.kind && f.group?.key === g.key)
          .map((f) => f.id),
        ...hubs
          .filter((h) => h.group.kind === g.kind && h.group.key === g.key)
          .map((h) => h.id),
      ],
    }));
    const rfEdges: Edge[] = edges
      .filter((e) => e.from !== e.to)
      .map((e) => ({
        id: `${e.from}\0${e.to}`,
        source: e.from,
        target: e.to,
        style: {
          stroke: edgeColor(e.mechanisms[0], muted),
          strokeWidth: 1 + Math.min(e.steps, 6) * 0.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeColor(e.mechanisms[0], muted),
          width: 20,
          height: 20,
        },
        data: { edge: e },
      }));
    void computeElkLayout(rfNodes, rfEdges, {
      direction: 'RIGHT',
      // Reposition (never keep the placeholder grid) and lay out compound
      // process frames.
      preserveNodePositions: false,
      groups,
    })
      .then((result) => {
        if (!alive) return;
        const positioned = new Map(result.nodes.map((n) => [n.id, n]));
        const builtGroups = new Set(result.groupBounds.keys());
        const shells: Node[] = [];
        for (const [id, b] of result.groupBounds) {
          const def = groupDefs.get(id);
          shells.push({
            id,
            type: 'aggregate-frame-group',
            position: { x: b.x, y: b.y },
            width: Math.max(200, b.width),
            height: Math.max(120, b.height),
            draggable: false,
            selectable: false,
            data: {
              label: def?.key ?? id,
              kind: def?.kind ?? 'process',
            },
          });
        }
        // Clear leaf parentIds that point at groups ELK dropped.
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
        console.warn('[subsystem-aggregate-graph] ELK layout failed, using grid:', err);
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

  const neighborIds = useMemo(() => {
    const focus = hoveredId ?? selectedId;
    if (!focus) return null;
    const set = new Set<string>([focus]);
    for (const e of edges) {
      if (e.from === focus) set.add(e.to);
      if (e.to === focus) set.add(e.from);
    }
    return set;
  }, [hoveredId, selectedId, edges]);

  const selected = selectedId ? (frames.find((f) => f.id === selectedId) ?? null) : null;

  const onNodeClick = useCallback(
    (_e: unknown, node: Node) => {
      const next = selectedId === node.id ? null : node.id;
      setSelectedId(next);
      onSelectFrame?.(next);
    },
    [selectedId, onSelectFrame],
  );

  const displayNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...(n.data as object),
          selected: selectedId === n.id,
          dimmed: neighborIds ? !neighborIds.has(n.id) : false,
          // Surviving parentId means ELK built this node's process frame —
          // the node renders nested, so a process box drops its redundant name.
          nested: (n as { parentId?: string }).parentId != null,
        },
      })),
    [nodes, selectedId, neighborIds],
  );

  const displayEdges = useMemo(
    () =>
      rfEdges.map((e) => {
        const dimmed =
          neighborIds != null &&
          !(neighborIds.has(e.source) && neighborIds.has(e.target));
        return {
          ...e,
          style: { ...(e.style as object), opacity: dimmed ? 0.12 : 0.9 },
        };
      }),
    [rfEdges, neighborIds],
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: theme.colors.background }}>
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        {...GRAPH_NAV_PROPS}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={(_e, node) => setHoveredId(node.id)}
        onNodeMouseLeave={() => setHoveredId(null)}
        onPaneClick={() => {
          setSelectedId(null);
          onSelectFrame?.(null);
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
          Laying out frames…
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
                onSelectFrame?.(null);
              }}
              aria-label="Clear selection"
              style={{ border: 'none', background: 'transparent', color: muted, cursor: 'pointer', fontSize: theme.fontSizes[2], lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          <div style={{ fontFamily: theme.fonts.monospace, fontSize: theme.fontSizes[0], color: muted, margin: '4px 0 8px' }}>
            {selected.kind} · {selected.members.length} member{selected.members.length === 1 ? '' : 's'}
            {selected.models.length > 0 ? ` · ${selected.models.length} model${selected.models.length === 1 ? '' : 's'}` : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {selected.members.map((m) => (
              <button
                key={m.alias}
                type="button"
                title={`${m.alias}${m.file ? ` — ${m.file}` : ''}`}
                disabled={!m.file || !onOpenFile}
                onClick={() => m.file && onOpenFile?.(m.file)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: m.file ? theme.colors.text : muted,
                  cursor: m.file && onOpenFile ? 'pointer' : 'default',
                  fontFamily: theme.fonts.monospace,
                  fontSize: theme.fontSizes[0],
                  textAlign: 'left',
                  padding: '2px 0',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.alias}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SubsystemAggregateGraph(props: SubsystemAggregateGraphProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
