/**
 * SessionEventFeed — a three-column diagnostic feed over one agent session's
 * events, showing the raw → repo-normalized → accumulated (UI) pipeline
 * for every row.
 *
 * Input rows match the principal-studio's `SessionEventRow` wire shape:
 *   { seq, type, raw, normalized, accumulated }
 * `raw` is the agent-specific payload (opencode V1 sqlite rows, or durable
 * reader blobs such as Cursor store.db messages), `normalized` its
 * repo-normalized form, and `accumulated` the AgentSessionEvent the File City
 * UI actually renders (null when the accumulator drops the event).
 *
 * Dark diagnostic palette — intentionally self-contained rather than themed.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Check, Copy } from 'lucide-react';
import type {
  AgentSessionEvent,
  NormalizedPathInfo,
  RepoNormalizedUniversalAgentSessionEvent,
  V1RawEvent,
} from '@principal-ai/agent-monitoring';

export interface SessionEventFeedRow {
  seq: number;
  type: string;
  raw: unknown;
  normalized?: Record<string, unknown>;
  accumulated: AgentSessionEvent | null;
}

export interface SessionEventFeedProps {
  title?: string;
  rows: SessionEventFeedRow[];
}

export interface SessionEventFeedGroupedProps {
  title?: string;
  rows: SessionEventFeedRow[];
}

type AnyRecord = Record<string, unknown>;
type NormalizedFeedEvent = Omit<RepoNormalizedUniversalAgentSessionEvent, 'raw'>;

/** Shared collapse state keyed by row seq. */
function useCollapse(seqs: number[], defaultCollapsed = false) {
  const [collapsed, setCollapsed] = useState<Set<number>>(
    () => (defaultCollapsed ? new Set(seqs) : new Set<number>()),
  );
  // When the feed grows (incremental paging appends rows), default newly added
  // rows to collapsed so the invariant holds for rows that arrive after mount.
  useEffect(() => {
    if (!defaultCollapsed) return;
    setCollapsed((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const seq of seqs) {
        if (!next.has(seq)) {
          next.add(seq);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [seqs, defaultCollapsed]);
  const toggle = useCallback((seq: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });
  }, []);
  const setAll = useCallback(
    (value: boolean) => setCollapsed(value ? new Set(seqs) : new Set<number>()),
    [seqs],
  );
  return { collapsed, toggle, setAll };
}

function toRaw(raw: unknown): V1RawEvent | null {
  if (raw === null || raw === undefined || typeof raw !== 'object') return null;
  return raw as V1RawEvent;
}

function toNormalized(normalized?: Record<string, unknown>): NormalizedFeedEvent | undefined {
  return normalized as NormalizedFeedEvent | undefined;
}

// =============================================================================
// Raw event → presentable pieces
// =============================================================================

function dataOf(e: V1RawEvent | null): AnyRecord {
  return (e?.data ?? {}) as AnyRecord;
}

function partOf(e: V1RawEvent | null): AnyRecord | undefined {
  return dataOf(e).part as AnyRecord | undefined;
}

/** True when the payload looks like an opencode V1 sqlite event row. */
function isV1RawEvent(e: V1RawEvent | null): boolean {
  return typeof e?.type === 'string' && e.type.length > 0;
}

/**
 * Cursor store.db blobs (and other durable readers) put the whole message in
 * `raw` — no `type` / `data` envelope. Pull a presentable kind + summary from
 * the common shapes CursorSessionReader emits:
 *   - chat message: `{ role, content, id? }`
 *   - tool wrapper: `{ message, block }` where block is tool-call / tool-result
 *   - session meta: `{ title?, cwd?, schemaVersion? }`
 */
function durableRawKind(e: AnyRecord): string {
  const block = e.block as AnyRecord | undefined;
  if (block && typeof block === 'object') {
    const toolName = (block.toolName ?? block.name) as string | undefined;
    const blockType = block.type as string | undefined;
    if (blockType === 'tool-call' || blockType === 'tool_use') {
      return toolName ? `tool-call:${toolName}` : 'tool-call';
    }
    if (blockType === 'tool-result' || blockType === 'tool_result') {
      return toolName ? `tool-result:${toolName}` : 'tool-result';
    }
    if (typeof blockType === 'string') return blockType;
  }
  if (typeof e.role === 'string') return e.role;
  if (typeof e.title === 'string' || typeof e.cwd === 'string' || typeof e.schemaVersion === 'number') {
    return 'session-meta';
  }
  return 'durable-raw';
}

function durableRawDescribe(e: AnyRecord): string {
  const block = e.block as AnyRecord | undefined;
  if (block && typeof block === 'object') {
    const toolName = (block.toolName ?? block.name) as string | undefined;
    const blockType = block.type as string | undefined;
    if (blockType === 'tool-call' || blockType === 'tool_use') {
      const args = block.args ?? block.input;
      const summary = toolSummary(args);
      return [toolName, summary].filter(Boolean).join(' · ') || 'tool call';
    }
    if (blockType === 'tool-result' || blockType === 'tool_result') {
      const result = block.result;
      const text =
        typeof result === 'string'
          ? result.slice(0, 120)
          : result !== undefined
            ? JSON.stringify(result).slice(0, 120)
            : '';
      return [toolName, text].filter(Boolean).join(' · ') || 'tool result';
    }
  }
  if (typeof e.role === 'string') {
    const content = e.content;
    if (typeof content === 'string') {
      const tagged = content.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
      const text = (tagged?.[1] ?? content).trim().replace(/\s+/g, ' ');
      return text.slice(0, 120) || e.role;
    }
    if (Array.isArray(content)) {
      const texts = content
        .filter((c): c is AnyRecord => !!c && typeof c === 'object')
        .map((c) => (typeof c.text === 'string' ? c.text : c.toolName ?? c.name ?? c.type))
        .filter(Boolean);
      return texts.join(' · ').slice(0, 120) || e.role;
    }
    return e.role;
  }
  if (typeof e.title === 'string') return e.title;
  if (typeof e.cwd === 'string') return e.cwd;
  return 'durable raw event';
}

function eventTimestamp(e: V1RawEvent | null): number {
  if (!e) return 0;
  const d = dataOf(e);
  if (typeof d.time === 'number') return d.time;
  const info = d.info as AnyRecord | undefined;
  const infoTime = info?.time as AnyRecord | undefined;
  if (typeof infoTime?.created === 'number') return infoTime.created;
  const part = partOf(e);
  if (typeof part?.time === 'number') return part.time;
  const state = part?.state as AnyRecord | undefined;
  const stateTime = state?.time as AnyRecord | undefined;
  if (typeof stateTime?.start === 'number') return stateTime.start;
  if (typeof stateTime?.end === 'number') return stateTime.end;
  return 0;
}

// =============================================================================
// Event categorization (drives the preset filters)
// =============================================================================

type EventCategory = 'session' | 'conversation' | 'tool' | 'step' | 'patch' | 'compaction';

const ALL_CATEGORIES: EventCategory[] = [
  'session',
  'conversation',
  'tool',
  'step',
  'patch',
  'compaction',
];

function eventCategory(e: V1RawEvent | null): EventCategory {
  if (!e) return 'session';
  if (!isV1RawEvent(e)) {
    const kind = durableRawKind(e as unknown as AnyRecord);
    if (kind.startsWith('tool-call') || kind.startsWith('tool-result') || kind.startsWith('tool')) {
      return 'tool';
    }
    if (kind === 'session-meta') return 'session';
    return 'conversation';
  }
  switch (e.type) {
    case 'session.created.1':
    case 'session.updated.1':
      return 'session';
    case 'message.updated.1':
    case 'message.removed.1':
    case 'message.part.updated.1': {
      const partType = partOf(e)?.type;
      switch (partType) {
        case 'text':
        case 'reasoning':
          return 'conversation';
        case 'tool':
          return 'tool';
        case 'step-start':
        case 'step-finish':
          return 'step';
        case 'patch':
          return 'patch';
        case 'compaction':
          return 'compaction';
        default:
          return 'conversation';
      }
    }
    default:
      return 'conversation';
  }
}

const PRESETS: Array<{ id: string; label: string; include: EventCategory[] }> = [
  { id: 'all', label: 'All', include: ALL_CATEGORIES },
  { id: 'activity', label: 'Activity', include: ['conversation', 'tool', 'patch'] },
  { id: 'conversation', label: 'Conversation', include: ['conversation'] },
  { id: 'tools', label: 'Tools', include: ['tool'] },
  { id: 'noise', label: 'Session & steps', include: ['session', 'step', 'compaction'] },
];

/** Granular key for a card (raw event type, or part type for parts). */
function eventKind(e: V1RawEvent | null): string {
  if (!e) return 'no-raw';
  if (!isV1RawEvent(e)) return durableRawKind(e as unknown as AnyRecord);
  if (e.type === 'message.part.updated.1') {
    return `part:${partOf(e)?.type ?? 'unknown'}`;
  }
  return e.type;
}

function kindLabel(kind: string | undefined | null): string {
  if (!kind) return 'unknown';
  if (kind.startsWith('part:')) return `part · ${kind.slice(5)}`;
  if (kind.startsWith('tool-call:')) return `call · ${kind.slice('tool-call:'.length)}`;
  if (kind.startsWith('tool-result:')) return `result · ${kind.slice('tool-result:'.length)}`;
  return kind;
}

const KIND_COLORS: Record<string, string> = {
  'session.created.1': '#64748b',
  'session.updated.1': '#94a3b8',
  'message.updated.1': '#06b6d4',
  'message.removed.1': '#ef4444',
  'part:text': '#10b981',
  'part:reasoning': '#8b5cf6',
  'part:tool': '#3b82f6',
  'part:step-start': '#f59e0b',
  'part:step-finish': '#f59e0b',
  'part:patch': '#ef4444',
  'part:compaction': '#ec4899',
  'part:unknown': '#6b7280',
};

function kindColor(kind: string): string {
  return KIND_COLORS[kind] ?? '#6b7280';
}

function describe(e: V1RawEvent | null): string {
  if (!e) return 'finished';
  if (!isV1RawEvent(e)) return durableRawDescribe(e as unknown as AnyRecord);
  const d = dataOf(e);
  const info = d.info as AnyRecord | undefined;
  const part = partOf(e);
  const state = part?.state as AnyRecord | undefined;

  switch (e.type) {
    case 'session.created.1':
      return (info?.title as string) ?? 'Session created';
    case 'session.updated.1': {
      const bits: string[] = [];
      const tokens = info?.tokens as AnyRecord | undefined;
      if (typeof info?.cost === 'number') bits.push(`$${info.cost.toFixed(4)}`);
      if (typeof tokens?.input === 'number') bits.push(`${tokens.input} in`);
      if (typeof tokens?.output === 'number') bits.push(`${tokens.output} out`);
      return bits.length > 0 ? `Session updated · ${bits.join(' · ')}` : 'Session updated';
    }
    case 'message.updated.1': {
      const role = (info?.role as string) ?? 'message';
      const model = (info?.model as AnyRecord | undefined)?.modelID as string | undefined;
      return model ? `${role} message · ${model}` : `${role} message`;
    }
    case 'message.removed.1':
      return `Removed ${d.messageID as string}`;
    case 'message.part.updated.1': {
      const partType = part?.type as string;
      const toolName = part?.tool as string | undefined;
      const status = state?.status as string | undefined;
      switch (partType) {
        case 'text':
          return (part?.text as string) ?? 'Text';
        case 'reasoning':
          return (part?.text as string) || 'Reasoning';
        case 'tool': {
          const bits = [toolName, status];
          const n = todoCountOf(state?.input);
          if (n > 0) bits.push(`${n} todo${n === 1 ? '' : 's'}`);
          return bits.filter(Boolean).join(' · ') || 'Tool';
        }
        case 'step-start':
          return 'Step start';
        case 'step-finish':
          return part?.reason ? `Step finish · ${part.reason as string}` : 'Step finish';
        case 'patch': {
          const files = part?.files as string[] | undefined;
          return `Patch · ${files?.length ?? 0} file${(files?.length ?? 0) === 1 ? '' : 's'}`;
        }
        case 'compaction':
          return `Compaction${part?.auto ? ' · auto' : ''}`;
        default:
          return partType ?? 'Part';
      }
    }
    default:
      return e.type;
  }
}

/** Number of todos carried by a todowrite tool input, if any. */
function todoCountOf(input: unknown): number {
  if (input && typeof input === 'object') {
    const todos = (input as AnyRecord)['todos'];
    if (Array.isArray(todos)) return todos.length;
  }
  return 0;
}

function toolSummary(input: unknown): string {
  if (input === null || input === undefined) return '';
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) return JSON.stringify(input).slice(0, 120);
  const obj = input as AnyRecord;
  // A todowrite input carries the full todo list — summarize by count rather
  // than dumping truncated JSON.
  if (Array.isArray(obj['todos'])) return `${(obj['todos'] as unknown[]).length} todos`;
  for (const key of ['command', 'filePath', 'file_path', 'path', 'pattern', 'include', 'tool']) {
    if (typeof obj[key] === 'string' && obj[key] !== '') return obj[key] as string;
  }
  return JSON.stringify(input).slice(0, 120);
}

// =============================================================================
// Cards
// =============================================================================

function formatTime(ts: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function RawEventCard({
  event,
  runCount,
  snapshotCount,
  expanded,
  onToggle,
}: {
  event: V1RawEvent | null;
  runCount?: number;
  snapshotCount?: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { theme } = useTheme();
  const kind = eventKind(event);
  const d = dataOf(event);
  const part = partOf(event);
  const state = part?.state as AnyRecord | undefined;
  const color = kindColor(kind);

  if (!event) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderRadius: 0,
          minWidth: 0,
          overflow: 'hidden',
          border: '1px dashed #1f2937',
          backgroundColor: '#0d1117',
          fontFamily: theme.fonts.body,
          fontSize: 12,
        }}
      >
        <span style={{ color: '#4b5563', fontStyle: 'italic' }}>no raw payload</span>
      </div>
    );
  }

  const body = ((): React.ReactNode => {
    switch (event.type) {
      case 'session.created.1': {
        const info = d.info as AnyRecord | undefined;
        return (
          <MetaRows
            rows={[
              ['agent', info?.agent as string],
              ['model', ((info?.model as AnyRecord | undefined)?.id as string) ?? ((info?.model as AnyRecord | undefined)?.modelID as string)],
              ['directory', info?.directory as string],
              ['version', info?.version as string],
              ['slug', info?.slug as string],
            ]}
          />
        );
          }
          case 'session.updated.1': {
            const info = d.info as AnyRecord | undefined;
            return (
              <MetaRows
                rows={[
                  ['cost', typeof info?.cost === 'number' ? `$${info.cost.toFixed(4)}` : undefined],
                  ['tokens', info?.tokens as AnyRecord | undefined],
                  ['title', info?.title as string],
                ]}
              />
            );
          }
          case 'message.updated.1': {
            const info = d.info as AnyRecord | undefined;
            return (
              <MetaRows
                rows={[
                  ['role', info?.role as string],
                  ['agent', info?.agent as string],
                  ['model', info?.model as AnyRecord | undefined],
                  ['tokens', info?.tokens as AnyRecord | undefined],
                  ['messageID', info?.id as string],
                ]}
              />
            );
          }
          case 'message.removed.1':
            return <MetaRows rows={[['messageID', d.messageID as string]]} />;
          case 'message.part.updated.1': {
            switch (part?.type) {
              case 'text':
              case 'reasoning':
                return <TextView text={part?.text as string | undefined} />;
              case 'tool': {
                const todos = (state?.input as AnyRecord | undefined)?.['todos'];
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>
                      callID {String(part?.callID ?? '')} · {String(state?.status ?? '')}
                    </div>
                    {Array.isArray(todos) ? <TodosView todos={todos} /> : null}
                    <ToolIO
                      input={state?.input}
                      output={state?.status === 'error' ? state?.error : state?.output}
                    />
                  </div>
                );
              }
              case 'step-start':
                return <MetaRows rows={[['snapshot', part?.snapshot as string]]} />;
              case 'step-finish':
                return (
                  <MetaRows
                    rows={[
                      ['reason', part?.reason as string],
                      ['cost', typeof part?.cost === 'number' ? `$${part.cost.toFixed(4)}` : undefined],
                      ['tokens', part?.tokens as AnyRecord | undefined],
                    ]}
                  />
                );
              case 'patch':
                return (
                  <MetaRows
                    rows={[
                      ['files', part?.files as string[] | undefined],
                      ['hash', part?.hash as string],
                    ]}
                  />
                );
              case 'compaction':
                return (
                  <MetaRows
                    rows={[
                      ['auto', typeof part?.auto === 'boolean' ? String(part.auto) : undefined],
                      ['overflow', typeof part?.overflow === 'boolean' ? String(part.overflow) : undefined],
                    ]}
                  />
                );
              default:
                return <JsonView value={d} />;
            }
          }
      default:
        // Durable-agent raw blobs (Cursor store.db, etc.) have no V1 `data`
        // envelope — dump the whole payload so the expanded card isn't empty.
        return <JsonView value={isV1RawEvent(event) ? d : event} />;
      }
    })();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: expanded ? 8 : 0,
        padding: '10px 14px',
        borderRadius: 0,
        minWidth: 0,
        overflow: 'hidden',
        backgroundColor: expanded ? '#111827' : '#161b26',
        fontFamily: theme.fonts.body,
        fontSize: 13,
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          border: 'none',
          background: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span style={{ color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap' }}>#{event.seq}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color,
            whiteSpace: 'nowrap',
          }}
        >
          {kindLabel(kind)}
        </span>
        {runCount && runCount > 1 ? (
          <span
            title={`${runCount} separate runs of this command`}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#f59e0b',
              whiteSpace: 'nowrap',
            }}
          >
            ×{runCount}
          </span>
        ) : null}
        {snapshotCount && snapshotCount > 1 ? (
          <span
            title={`${snapshotCount} raw event snapshots collapsed into this row`}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#60a5fa',
              whiteSpace: 'nowrap',
            }}
          >
            {snapshotCount} events
          </span>
        ) : null}
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: '#e5e7eb',
          }}
        >
          {describe(event)}
        </span>
        <span style={{ color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap' }}>
          {formatTime(eventTimestamp(event))}
        </span>
      </button>
      {expanded ? body : null}
    </div>
  );
}

function prettifyEventType(t: string | undefined): string {
  return (t ?? '').replace(/-/g, ' ');
}

function normalizedDescribe(n: NormalizedFeedEvent): string {
  if (n.toolName) return [n.toolName, n.operation].filter(Boolean).join(' · ');
  if (n.operation) return n.operation;
  const d = n.data as AnyRecord | undefined;
  if (typeof d?.message === 'string') return d.message.slice(0, 90);
  return prettifyEventType(n.eventType);
}

function repoLabel(repo: {
  root?: string;
  owner?: string;
  repo?: string;
  remoteUrl?: string;
}): string {
  const identity = repo.owner && repo.repo ? `${repo.owner}/${repo.repo}` : repo.repo ?? '';
  return identity && repo.root ? `${identity} @ ${repo.root}` : repo.root ?? '';
}

function NormalizedEventCard({
  event,
  seq,
  color,
  expanded,
  onToggle,
}: {
  event: NormalizedFeedEvent;
  seq: number;
  color: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { theme } = useTheme();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: expanded ? 8 : 0,
        padding: '10px 14px',
        borderRadius: 0,
        minWidth: 0,
        overflow: 'hidden',
        backgroundColor: expanded ? '#0d1520' : '#101722',
        fontFamily: theme.fonts.body,
        fontSize: 13,
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          border: 'none',
          background: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span style={{ color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap' }}>#{seq}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color,
            whiteSpace: 'nowrap',
          }}
        >
          {prettifyEventType(event.eventType)}
        </span>
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: '#e5e7eb',
          }}
        >
          {normalizedDescribe(event)}
        </span>
        <span style={{ color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap' }}>
          {formatTime(event.timestamp)}
        </span>
      </button>
      {expanded ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <MetaRows
            rows={[
              ['eventType', event.eventType],
              ['operation', event.operation],
              ['toolName', event.toolName],
              ['sessionId', event.sessionId],
              ['workingDir', event.normalizedWorkingDirectory],
              ['repository', event.repository ? repoLabel(event.repository) : undefined],
            ]}
          />
          {event.files && event.files.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ fontSize: 11, color: '#6b7280' }}>files ({event.files.length})</div>
              {event.files.map((file, i) => (
                <FileRow key={i} file={file} />
              ))}
            </div>
          ) : null}
          {event.toolInput !== undefined ? (
            <ToolIO input={event.toolInput} output={event.toolOutput} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FileRow({ file }: { file: NormalizedPathInfo }) {
  const { theme } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <div
        style={{
          color: '#93c5fd',
          fontSize: 12,
          wordBreak: 'break-word',
          fontFamily: theme.fonts.monospace,
        }}
      >
        {file.displayPath}
      </div>
      <div style={{ color: '#6b7280', fontSize: 11, wordBreak: 'break-word' }}>
        {file.context}
        {file.repository
          ? ` · ${file.repository.gitRoot} → ${file.repository.relativePath}`
          : ` · ${file.absolutePath}`}
      </div>
    </div>
  );
}

const OPERATION_COLORS: Record<string, string> = {
  starting: '#6b7280',
  prompting: '#a78bfa',
  reading: '#a855f7',
  grepping: '#e879f9',
  globbing: '#14b8a6',
  listing: '#f97316',
  editing: '#22c55e',
  tool: '#3b82f6',
  errored: '#ef4444',
  waiting: '#9ca3af',
  finished: '#10b981',
  compacting: '#ec4899',
  subagent: '#f59e0b',
};

function AccumulatedEventCard({
  event,
  seq,
  dropReason,
  expanded,
  onToggle,
}: {
  event: AgentSessionEvent | null;
  seq: number;
  dropReason?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { theme } = useTheme();
  if (!event) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderRadius: 0,
          minWidth: 0,
          overflow: 'hidden',
          border: '1px dashed #1f2937',
          backgroundColor: '#0d1117',
          fontFamily: theme.fonts.body,
          fontSize: 12,
        }}
      >
        <span style={{ color: '#374151', whiteSpace: 'nowrap' }}>#{seq}</span>
        <span style={{ color: dropReason ? '#b45309' : '#4b5563', fontStyle: 'italic' }}>
          {dropReason ?? 'no UI event (accumulator dropped)'}
        </span>
      </div>
    );
  }

  const opColor = OPERATION_COLORS[event.operation] ?? '#6b7280';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: expanded ? 8 : 0,
        padding: '10px 14px',
        borderRadius: 0,
        minWidth: 0,
        overflow: 'hidden',
        backgroundColor: expanded ? '#121a13' : '#141b16',
        fontFamily: theme.fonts.body,
        fontSize: 13,
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          border: 'none',
          background: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            flexShrink: 0,
            backgroundColor: event.sessionColor,
          }}
        />
        <span style={{ color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap' }}>#{seq}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: opColor,
            whiteSpace: 'nowrap',
          }}
        >
          {event.operation}
        </span>
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: '#e5e7eb',
          }}
        >
          {event.description}
        </span>
        <span style={{ color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap' }}>
          {formatTime(event.timestamp)}
        </span>
      </button>
      {expanded ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <MetaRows
            rows={[
              ['operation', event.operation],
              ['session', event.sessionName],
              ['contextTokens', event.contextTokens],
              ['toolName', event.toolName],
              ['subagent', event.subagentType],
              ['childSessionId', event.childSessionId],
            ]}
          />
          <div style={{ fontSize: 12, color: '#6b7280' }}>{event.description}</div>
          {event.files.length > 0 ? <PathList label="files" paths={event.files} /> : null}
          {event.dependencies.length > 0 ? (
            <PathList label="dependencies" paths={event.dependencies} />
          ) : null}
          {event.layers.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 11, color: '#6b7280' }}>layers</div>
              {event.layers.map((layer) => (
                <div
                  key={layer.id}
                  style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: layer.color,
                      opacity: 0.8,
                    }}
                  />
                  <span style={{ color: '#d1d5db' }}>
                    {layer.name} ({layer.items.length})
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PathList({ label, paths }: { label: string; paths: NormalizedPathInfo[] }) {
  const { theme } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
      {paths.map((p, i) => (
        <div
          key={i}
          style={{ color: '#93c5fd', fontSize: 11.5, fontFamily: theme.fonts.monospace, wordBreak: 'break-word' }}
        >
          {p.displayPath}
        </div>
      ))}
    </div>
  );
}

function TextView({ text }: { text?: string }) {
  if (!text) return <div style={{ color: '#6b7280', fontSize: 12 }}>(empty)</div>;
  return (
    <div
      style={{
        color: '#d1d5db',
        fontSize: 12.5,
        lineHeight: 1.5,
        maxHeight: 120,
        overflowY: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {text}
    </div>
  );
}

const TODO_STATUS_COLORS: Record<string, string> = {
  completed: '#22c55e',
  in_progress: '#f59e0b',
  pending: '#6b7280',
};

function TodosView({ todos }: { todos: Array<Record<string, unknown>> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ fontSize: 11, color: '#6b7280' }}>todos ({todos.length})</div>
      {todos.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'baseline' }}>
          <span
            style={{
              color: TODO_STATUS_COLORS[String(t.status ?? '')] ?? '#6b7280',
              fontWeight: 600,
              minWidth: 84,
              whiteSpace: 'nowrap',
            }}
          >
            {String(t.status ?? '')}
          </span>
          <span style={{ color: '#d1d5db', wordBreak: 'break-word' }}>{String(t.content ?? '')}</span>
          {typeof t.priority === 'string' && t.priority ? (
            <span style={{ color: '#6b7280', whiteSpace: 'nowrap' }}>· {t.priority}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ToolIO({ input, output }: { input?: unknown; output?: unknown }) {  const summary = toolSummary(input);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {summary ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#60a5fa', fontWeight: 600 }}>IN</span>
          <code style={{ color: '#93c5fd', fontSize: 12, wordBreak: 'break-word' }}>{summary}</code>
        </div>
      ) : null}
      {input !== undefined && input !== null && typeof input === 'object' ? (
        <CodeBlock value={JSON.stringify(input, null, 2)} />
      ) : null}
      {output !== undefined && output !== null ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#34d399', fontWeight: 600 }}>OUT</span>
            <span style={{ fontSize: 11, color: '#6b7280' }}>
              {typeof output === 'string' ? `${output.length.toLocaleString()} chars` : 'object'}
            </span>
          </div>
          <CodeBlock value={typeof output === 'string' ? output : JSON.stringify(output, null, 2)} />
        </>
      ) : null}
    </div>
  );
}

function CodeBlock({ value }: { value: string }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: 8,
        borderRadius: 6,
        backgroundColor: '#0b1220',
        color: '#9ca3af',
        fontSize: 11.5,
        lineHeight: 1.45,
        maxHeight: 180,
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {value}
    </pre>
  );
}

function MetaRows({ rows }: { rows: Array<[string, unknown]> }) {
  const present = rows.filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (present.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {present.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
          <span style={{ color: '#6b7280', minWidth: 76, whiteSpace: 'nowrap' }}>{label}</span>
          <span
            style={{
              color: '#d1d5db',
              wordBreak: 'break-word',
              whiteSpace: typeof value === 'string' ? 'pre-wrap' : 'nowrap',
            }}
          >
            {typeof value === 'string'
              ? value
              : Array.isArray(value)
                ? (value as unknown[]).join(', ')
                : JSON.stringify(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function JsonView({ value }: { value: unknown }) {
  return <CodeBlock value={JSON.stringify(value, null, 2)} />;
}

// =============================================================================
// Feed
// =============================================================================

type FeedItem = SessionEventFeedRow & {
  /** Distinct invocations (callIDs) merged into this row. */
  runCount?: number;
  /** Raw event snapshots collapsed into this row (pending/running/completed…). */
  snapshotCount?: number;
  /** Why the accumulator dropped this row's UI event, when it did. */
  dropReason?: string;
  /** CallIDs folded into this row — the accumulator emits at most one UI event
   *  per invocation, so this stays the source of truth for `runCount`. */
  callIDs?: Set<string>;
};

/**
 * Why the accumulator dropped a row's UI event, derived from the raw event
 * alone (no stream context needed). Rows that don't match a known category keep
 * the generic "dropped" label.
 */
function dropReasonFor(raw: V1RawEvent | null): string | null {
  if (!raw) return null;
  if (raw.type === 'message.updated.1') {
    const role = (dataOf(raw).info as AnyRecord | undefined)?.role;
    if (role === 'assistant') {
      return 'assistant message — metadata only (feeds context/token tracking)';
    }
    return null; // user messages are handled by the re-save pass below
  }
  if (raw.type === 'message.removed.1') return 'message removed — no UI event';
  if (raw.type === 'message.part.updated.1') {
    switch (partOf(raw)?.type) {
      case 'reasoning':
        return 'model reasoning — not surfaced in the UI';
      case 'step-start':
      case 'step-finish':
        return 'step lifecycle — not surfaced in the UI';
      case 'text':
        return 'text content — not surfaced in the UI';
      case 'tool':
        return 'tool snapshot — folded into the tool run';
      default:
        return null;
    }
  }
  return null;
}

/**
 * Annotate rows the accumulator drops with *why* they were dropped, walking in
 * stream order. opencode re-saves a user message on every change (seq 1, 6, 24,
 * 39, 51… share one messageID), so the first occurrence becomes the `prompting`
 * UI event and every re-save is deduped away — those read "re-save, ignored"
 * instead of a generic "dropped".
 */
function annotateDrops(items: FeedItem[]): FeedItem[] {
  const seenUserMessageIDs = new Set<string>();
  return items.map((item) => {
    const raw = toRaw(item.raw);
    if (!raw) return item;
    // Track user message IDs on every occurrence — the first one is the real
    // prompt (it carries the accumulated UI event); later re-saves are deduped.
    if (raw.type === 'message.updated.1') {
      const info = dataOf(raw).info as AnyRecord | undefined;
      const messageID = info?.id;
      const role = info?.role;
      if (typeof messageID === 'string' && role === 'user') {
        if (seenUserMessageIDs.has(messageID)) {
          if (item.accumulated === null) {
            return {
              ...item,
              dropReason: 're-save of user message — already counted as a prompt',
            };
          }
          return item;
        }
        seenUserMessageIDs.add(messageID);
      }
    }
    if (item.accumulated !== null) return item;
    const reason = dropReasonFor(raw);
    if (reason) return { ...item, dropReason: reason };
    return item;
  });
}

/**
 * Collapse a tool invocation's snapshots into a single row. The raw V1 stream
 * emits one part update per status flip (pending → running → completed) — and
 * those flips can be interleaved with other events (reasoning, text, session
 * bookkeeping) — so snapshots are matched by callID across the whole stream,
 * not just when consecutive. Distinct calls that repeat the same command and
 * are consecutive still fold into one ×N row.
 *
 * The merged row keeps the run's first seq as a stable key and adopts the
 * **latest** snapshot's raw/normalized payload (the completed/errored part
 * carries the tool output). The UI (accumulated) column instead prefers the
 * group's one non-null accumulated event — the accumulator dedupes to at most
 * one per invocation, and it's usually the *first* snapshot (e.g. todowrite's
 * pending emits the `tool` event; running/completed are dropped).
 */
function groupToolRuns(items: SessionEventFeedRow[]): FeedItem[] {
  const out: FeedItem[] = [];
  const byCallID = new Map<string, FeedItem>();
  let lastGroup: FeedItem | null = null;
  let lastGroupCmd: string | null = null;

  const adopt = (group: FeedItem, r: SessionEventFeedRow, cmd: string | null) => {
    group.snapshotCount = (group.snapshotCount ?? 1) + 1;
    group.raw = r.raw;
    group.normalized = r.normalized;
    const acc = r.accumulated;
    if (acc !== null) {
      // Prefer the run's meaningful accumulated. The pending snapshot of a
      // bash `ls` (empty input) emits a generic `tool` before the completed
      // snapshot's `listing` arrives — replace a generic `tool` with a more
      // specific operation, and never downgrade a specific one.
      if (
        group.accumulated === null ||
        (group.accumulated.operation === 'tool' && acc.operation !== 'tool')
      ) {
        group.accumulated = acc;
      }
    }
    group.type = r.type;
    lastGroup = group;
    lastGroupCmd = cmd;
  };

  for (const r of items) {
    const raw = toRaw(r.raw);
    const isTool =
      !!raw && raw.type === 'message.part.updated.1' && partOf(raw)?.type === 'tool';
    const part = partOf(raw);
    const cmd = isTool
      ? toolSummary((part?.state as AnyRecord | undefined)?.input)
      : null;
    const callID = isTool ? (part?.callID as string | undefined) : undefined;

    if (!isTool) {
      out.push(r);
      lastGroup = null;
      lastGroupCmd = null;
      continue;
    }

    // Same invocation — fold this status snapshot in wherever it appears.
    const existing = callID ? byCallID.get(callID) : undefined;
    if (existing) {
      adopt(existing, r, cmd);
      continue;
    }

    // A distinct call repeating the previous group's command folds into it.
    if (lastGroup && cmd !== null && cmd !== '' && cmd === lastGroupCmd) {
      if (callID) {
        lastGroup.callIDs = lastGroup.callIDs ?? new Set<string>();
        lastGroup.callIDs.add(callID);
        byCallID.set(callID, lastGroup);
      }
      lastGroup.runCount = lastGroup.callIDs ? lastGroup.callIDs.size : 1;
      adopt(lastGroup, r, cmd);
      continue;
    }

    const group: FeedItem = {
      ...r,
      runCount: 1,
      snapshotCount: 1,
      callIDs: new Set(callID ? [callID] : []),
    };
    if (callID) byCallID.set(callID, group);
    out.push(group);
    lastGroup = group;
    lastGroupCmd = cmd;
  }
  return out;
}

/**
 * Fold a user message's events into a single row keyed by messageID: the
 * original `message.updated.1` (which carries the `prompting` accumulated
 * event), every re-save of the same message (opencode re-saves a user message
 * on each change), and the text part(s) that carry its content (the
 * `notification` events sharing the same messageID). They all resolve to the
 * one `prompting` accumulated event, so they render as one row with a snapshot
 * count instead of a wall of "re-save" rows.
 */
function groupPromptParts(items: FeedItem[]): FeedItem[] {
  const out: FeedItem[] = [];
  const byMessageID = new Map<string, FeedItem>();
  for (const item of items) {
    const raw = toRaw(item.raw);
    if (!raw) {
      out.push(item);
      continue;
    }
    if (raw.type === 'message.updated.1') {
      const info = dataOf(raw).info as AnyRecord | undefined;
      const messageID = info?.id;
      const role = info?.role;
      if (typeof messageID === 'string' && role === 'user') {
        const existing = byMessageID.get(messageID);
        if (existing) {
          // re-save of the same user message — fold into its prompt row
          existing.snapshotCount = (existing.snapshotCount ?? 1) + 1;
          if (existing.accumulated === null && item.accumulated !== null) {
            existing.accumulated = item.accumulated;
          }
          continue;
        }
        byMessageID.set(messageID, item);
      }
      out.push(item);
      continue;
    }
    if (raw.type === 'message.part.updated.1') {
      const part = partOf(raw);
      const messageID = part?.messageID;
      if (part?.type === 'text' && typeof messageID === 'string') {
        const existing = byMessageID.get(messageID);
        if (existing) {
          existing.snapshotCount = (existing.snapshotCount ?? 1) + 1;
          if (existing.accumulated === null && item.accumulated !== null) {
            existing.accumulated = item.accumulated;
          }
          continue; // absorb the text part into its message row
        }
      }
      out.push(item);
      continue;
    }
    out.push(item);
  }
  return out;
}

export function SessionEventFeed({ title, rows }: SessionEventFeedProps) {
  const { theme } = useTheme();
  const items = useMemo(() => [...rows].sort((a, b) => a.seq - b.seq), [rows]);

  const [active, setActive] = useState<string>('activity');
  const [groupTools, setGroupTools] = useState(true);

  const displayItems = useMemo<FeedItem[]>(
    () => annotateDrops(groupPromptParts(groupTools ? groupToolRuns(items) : items)),
    [items, groupTools],
  );
  const seqs = useMemo(() => displayItems.map((r) => r.seq), [displayItems]);
  const { collapsed, toggle, setAll } = useCollapse(seqs, true);

  const activePreset = PRESETS.find((p) => p.id === active) ?? PRESETS[0];
  // "Generic tools" surfaces the improvement backlog: tool rows whose
  // accumulated operation is still the generic `tool` fallback (e.g. bash
  // commands that haven't been given a listing/reading/… type yet).
  const [unprocessedOnly, setUnprocessedOnly] = useState(false);
  const isVisible = (r: FeedItem) =>
    unprocessedOnly
      ? r.accumulated?.operation === 'tool'
      : activePreset.include.includes(eventCategory(toRaw(r.raw)));
  const visibleEvents = displayItems.filter(isVisible);

  const presetCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const preset of PRESETS) {
      map.set(preset.id, displayItems.filter((r) => preset.include.includes(eventCategory(toRaw(r.raw)))).length);
    }
    return map;
  }, [displayItems]);

  const unprocessedCount = useMemo(
    () => displayItems.filter((r) => r.accumulated?.operation === 'tool').length,
    [displayItems],
  );

  const expandedCount = visibleEvents.filter((r) => !collapsed.has(r.seq)).length;

  return (
    <div style={{ padding: 24, backgroundColor: '#0d1117', minHeight: '100vh' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          marginBottom: 4,
          fontFamily: theme.fonts.body,
        }}
      >
        <h1 style={{ margin: 0, color: '#f3f4f6', fontSize: 18, fontWeight: 600 }}>{title}</h1>
        <span style={{ color: '#6b7280', fontSize: 12 }}>
          {items.length} raw events · {visibleEvents.length} visible · {expandedCount} expanded
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          marginBottom: 16,
          fontFamily: theme.fonts.body,
        }}
      >
        <FilterChip label="all" active={active === 'all'} onClick={() => setActive('all')} />
        {PRESETS.filter((p) => p.id !== 'all').map((preset) => (
          <FilterChip
            key={preset.id}
            label={`${preset.label} (${presetCounts.get(preset.id) ?? 0})`}
            active={active === preset.id}
            onClick={() => setActive(preset.id)}
          />
        ))}
        <span style={{ flex: 1 }} />
        <FilterChip
          label={`Generic tools (${unprocessedCount})`}
          active={unprocessedOnly}
          onClick={() => setUnprocessedOnly((v) => !v)}
        />
        <FilterChip
          label={groupTools ? 'Group tool runs: on' : 'Group tool runs: off'}
          active={groupTools}
          onClick={() => setGroupTools((v) => !v)}
        />
        <FilterChip label="Expand all" active={false} onClick={() => setAll(false)} />
        <FilterChip label="Collapse all" active={false} onClick={() => setAll(true)} />
      </div>
      <ColumnHeaders />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {displayItems.map((r) => (
          <EventRow
            key={r.seq}
            row={r}
            sessionTitle={title}
            runCount={r.runCount}
            snapshotCount={r.snapshotCount}
            visible={isVisible(r)}
            expanded={!collapsed.has(r.seq)}
            onToggle={() => toggle(r.seq)}
          />
        ))}
      </div>
    </div>
  );
}

export function SessionEventFeedGrouped({ title, rows }: SessionEventFeedGroupedProps) {
  const { theme } = useTheme();
  const items = useMemo<FeedItem[]>(
    () => annotateDrops(groupPromptParts([...rows].sort((a, b) => a.seq - b.seq))),
    [rows],
  );
  const byKind = useMemo(() => {
    const map = new Map<string, SessionEventFeedRow[]>();
    for (const r of items) {
      const kind = eventKind(toRaw(r.raw));
      map.set(kind, [...(map.get(kind) ?? []), r]);
    }
    return map;
  }, [items]);

  return (
    <div style={{ padding: 24, backgroundColor: '#0d1117', minHeight: '100vh' }}>
      {title ? (
        <h1 style={{ margin: '0 0 12px', color: '#f3f4f6', fontSize: 18, fontWeight: 600, fontFamily: theme.fonts.body }}>
          {title}
        </h1>
      ) : null}
      <ColumnHeaders />
      {Array.from(byKind.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .map(([kind, group]) => (
          <GroupSection key={kind} kind={kind} group={group} sessionTitle={title} />
        ))}
    </div>
  );
}

function GroupSection({
  kind,
  group,
  sessionTitle,
}: {
  kind: string;
  group: SessionEventFeedRow[];
  sessionTitle?: string;
}) {
  const { theme } = useTheme();
  const seqs = useMemo(() => group.map((r) => r.seq), [group]);
  const { collapsed, toggle, setAll } = useCollapse(seqs, true);

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          fontFamily: theme.fonts.body,
        }}
      >
        <span style={{ color: kindColor(kind), fontWeight: 600, fontSize: 13 }}>
          {kindLabel(kind)}
        </span>
        <span style={{ color: '#6b7280', fontSize: 12 }}>{group.length}</span>
        <span style={{ flex: 1 }} />
        <FilterChip label="Expand all" active={false} onClick={() => setAll(false)} />
        <FilterChip label="Collapse all" active={false} onClick={() => setAll(true)} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {group.map((r) => (
          <EventRow
            key={r.seq}
            row={r}
            sessionTitle={sessionTitle}
            visible
            expanded={!collapsed.has(r.seq)}
            onToggle={() => toggle(r.seq)}
          />
        ))}
      </div>
    </div>
  );
}

function ColumnHeaders() {
  const { theme } = useTheme();
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        display: 'grid',
        gridTemplateColumns: '3px 1fr 1fr 1fr 28px',
        gap: 8,
        padding: '8px 14px',
        marginBottom: 8,
        backgroundColor: '#0d1117',
        borderBottom: '1px solid #1f2937',
        fontFamily: theme.fonts.body,
      }}
    >
      <span />
      <HeaderLabel>Raw event</HeaderLabel>
      <HeaderLabel>Repo-normalized</HeaderLabel>
      <HeaderLabel>UI event (accumulated)</HeaderLabel>
      <span />
    </div>
  );
}

function HeaderLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: '#9ca3af',
      }}
    >
      {children}
    </span>
  );
}

/**
 * Assemble a self-contained, discussion-ready text block for one row: enough
 * identifiers and detail (session, seq, raw → normalized → UI) that the block
 * carries the whole issue without the viewer open. Paste this into a chat, an
 * agent conversation, or an issue to talk about the event.
 */
function buildRowContext(row: SessionEventFeedRow, sessionTitle?: string): string {
  const raw = toRaw(row.raw);
  const d = dataOf(raw);
  const part = partOf(raw);
  const state = part?.state as AnyRecord | undefined;
  const normalized = toNormalized(row.normalized);
  const acc = row.accumulated;

  const lines: string[] = [];
  const runCount = (row as FeedItem).runCount;
  const snapshotCount = (row as FeedItem).snapshotCount;
  const runLabel = runCount && runCount > 1 ? ` ×${runCount} runs` : '';
  const snapLabel = snapshotCount && snapshotCount > 1 ? ` · ${snapshotCount} snapshots collapsed` : '';
  lines.push(`## Event #${row.seq} — ${kindLabel(eventKind(raw))}${runLabel}${snapLabel}`);
  lines.push(`_${formatTime(eventTimestamp(raw))} · \`${row.type}\`_`);
  lines.push('');

  if (sessionTitle) lines.push(`**Session:** ${sessionTitle}`);
  const sessionID =
    (d.sessionID as string | undefined) ?? normalized?.sessionId ?? acc?.sessionId;
  if (sessionID) lines.push(`Session id: \`${sessionID}\``);
  lines.push('');

  lines.push('**Raw:**');
  if (!raw) {
    lines.push('- no raw payload');
  } else {
    lines.push(`- event type: \`${raw.type}\``);
    if (typeof part?.type === 'string') lines.push(`- part type: \`${part.type}\``);
    if (typeof part?.callID === 'string') lines.push(`- callID: \`${part.callID}\``);
    if (typeof part?.tool === 'string') lines.push(`- tool: \`${part.tool}\``);
    if (typeof state?.status === 'string') lines.push(`- status: \`${state.status}\``);
    const inSummary = toolSummary(state?.input);
    if (inSummary) lines.push(`- input: \`${inSummary}\``);
    const out = state?.status === 'error' ? state?.error : state?.output;
    if (typeof out === 'string') {
      const preview =
        out.length > 500 ? `${out.slice(0, 500)}\n…[+${out.length - 500} chars]` : out;
      lines.push(`- output (${out.length.toLocaleString()} chars):\n\`\`\`\n${preview}\n\`\`\``);
    }
  }
  lines.push('');

  if (normalized && typeof normalized.eventType === 'string') {
    lines.push('**Normalized:**');
    lines.push(`- eventType: \`${normalized.eventType}\``);
    if (typeof normalized.operation === 'string' && normalized.operation) {
      lines.push(`- operation: \`${normalized.operation}\``);
    }
    if (typeof normalized.toolName === 'string' && normalized.toolName) {
      lines.push(`- toolName: \`${normalized.toolName}\``);
    }
    const files = normalized.files ?? [];
    if (files.length > 0) {
      lines.push(`- files: ${files.map((f) => `\`${f.displayPath}\``).join(', ')}`);
    }
    lines.push('');
  }

  if (acc) {
    lines.push('**UI event (accumulated):**');
    lines.push(`- operation: \`${acc.operation}\``);
    lines.push(`- description: ${acc.description}`);
    if (typeof acc.contextTokens === 'number' && acc.contextTokens > 0) {
      lines.push(`- contextTokens: ${acc.contextTokens}`);
    }
    if (acc.files.length > 0) {
      lines.push(`- files: ${acc.files.map((f) => f.displayPath).join(', ')}`);
    }
  } else {
    const dropReason = (row as FeedItem).dropReason;
    lines.push(`**UI event:** ${dropReason ?? 'none (accumulator dropped this event)'}`);
  }

  return lines.join('\n');
}

async function copyRowContext(row: SessionEventFeedRow, sessionTitle?: string): Promise<boolean> {
  const text = buildRowContext(row, sessionTitle);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('[session-events] copy failed:', err);
    return false;
  }
}

function EventRow({
  row,
  sessionTitle,
  runCount,
  snapshotCount,
  visible,
  expanded,
  onToggle,
}: {
  row: SessionEventFeedRow;
  sessionTitle?: string;
  runCount?: number;
  snapshotCount?: number;
  visible: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const raw = toRaw(row.raw);
  const normalized = toNormalized(row.normalized);
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  if (!visible) return <FilteredOutLine raw={raw} />;
  const color = kindColor(eventKind(raw));
  const files = normalized?.files;
  const hasPaths = !!files && files.length > 0;

  const onCopy = () => {
    void copyRowContext(row, sessionTitle).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '3px 1fr 1fr 1fr 28px',
        gridAutoRows: 'min-content',
        gap: 8,
      }}
    >
      <div
        title={hasPaths ? `${files.length} normalized path(s)` : 'no paths to normalize'}
        style={{
          backgroundColor: hasPaths ? '#10b981' : '#232c39',
        }}
      />
      <RawEventCard event={raw} runCount={runCount} snapshotCount={snapshotCount} expanded={expanded} onToggle={onToggle} />
      {normalized ? (
        <NormalizedEventCard
          event={normalized}
          seq={row.seq}
          color={color}
          expanded={expanded}
          onToggle={onToggle}
        />
      ) : null}
      <AccumulatedEventCard
        event={row.accumulated}
        seq={row.seq}
        dropReason={(row as FeedItem).dropReason}
        expanded={expanded}
        onToggle={onToggle}
      />
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onCopy();
        }}
        title="Copy this row's context for a discussion"
        aria-label="Copy row context"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'stretch',
          padding: 0,
          border: 'none',
          borderRadius: 4,
          appearance: 'none',
          cursor: 'pointer',
          background: copied ? 'rgba(16,185,129,0.12)' : 'transparent',
          color: copied ? '#10b981' : theme.colors.textTertiary,
          fontSize: 12,
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  );
}

function FilteredOutLine({ raw }: { raw: V1RawEvent | null }) {
  const color = kindColor(eventKind(raw));
  return (
    <div
      title={describe(raw)}
      style={{
        height: 2,
        backgroundColor: color,
        opacity: 0.16,
        cursor: 'default',
      }}
    />
  );
}

function FilterChip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: 999,
        border: `1px solid ${active ? color ?? '#3b82f6' : '#1f2937'}`,
        backgroundColor: active ? (color ?? '#3b82f6') + '22' : 'transparent',
        color: active ? '#f3f4f6' : '#9ca3af',
        fontSize: 11.5,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
}
