import React from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ReactFlowProvider, type Node, type NodeProps } from '@xyflow/react';
import { ThemeProvider, defaultEditorTheme, useTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentNode } from '../../../subsystem/nodes';
import type { GraphifyComponentDetail } from '../../../graphify';
import type {
  SubsystemComponent,
  SubsystemGraphNodeData,
  SubsystemNodeIssue,
} from '../../../subsystem/model';

/**
 * NodeAnatomy — a dissection of the component node's visual language.
 *
 * Section 1 lays out every channel the node already spends (border, corners,
 * left badge, right badge cluster, fill) so an added channel can be chosen
 * against it. Section 2 shows the diagnostics layer (dotted border +
 * earliest-rung corner chip) composed over real nodes — now wired into the
 * production node as `data.issue` (see `NodeIssueOverlay` in `nodes.tsx` and
 * `issueBadgeByAlias` in `SubsystemComponentGraph`); this story stays the
 * visual reference. Sections 3–4 (verification ladder, diagnostic hover) are
 * still proposals.
 */
const meta = {
  title: 'Subsystem/ComponentGraph/NodeAnatomy',
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
const NODE_W = 230;
const NODE_H = 84;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

function nodeProps(
  component: SubsystemComponent,
  opts?: {
    selected?: boolean;
    width?: number;
    height?: number;
    issue?: SubsystemNodeIssue;
  },
): NodeProps<Node<SubsystemGraphNodeData, 'subsystem-component'>> {
  return {
    data: { component, ...(opts?.issue ? { issue: opts.issue } : {}) },
    selected: opts?.selected ?? false,
    width: opts?.width ?? NODE_W,
    height: opts?.height ?? NODE_H,
  } as unknown as NodeProps<Node<SubsystemGraphNodeData, 'subsystem-component'>>;
}

// ---------------------------------------------------------------------------
// Section 1 — the channels the node already spends
// ---------------------------------------------------------------------------

type Channel = {
  label: string;
  note: string;
  component: SubsystemComponent;
  selected?: boolean;
};

const storeDetail: GraphifyComponentDetail = {
  kind: 'store',
  storage: 'memory',
} as GraphifyComponentDetail;

const CHANNELS: Channel[] = [
  {
    label: 'baseline — function',
    note: 'border color = construct (function-indigo); left badge = construct.',
    component: {
      alias: 'fn',
      name: 'auditSubsystemModel',
      construct: 'function',
      file: 'src/bun/verify-subsystem-component.ts',
      purl: PURL,
      symbol: 'auditSubsystemModel',
    },
  },
  {
    label: 'class',
    note: 'construct color changes per kind; nothing else moves.',
    component: {
      alias: 'cls',
      name: 'MaintainModelAgent',
      construct: 'class',
      file: 'src/bun/maintain-model.ts',
      purl: PURL,
      symbol: 'MaintainModelAgent',
    },
  },
  {
    label: 'external',
    note: 'outside the system — square corners, no file.',
    component: {
      alias: 'ext',
      name: '@opencode-ai/cli',
      construct: 'external',
      file: '',
      purl: 'pkg:npm/@opencode-ai/cli',
      symbol: '',
    },
  },
  {
    label: 'role badge',
    note: 'top-right badge = role.',
    component: {
      alias: 'role',
      name: 'handleRequest',
      construct: 'function',
      file: 'src/bun/http-server.ts',
      purl: PURL,
      symbol: 'handleRequest',
      role: 'entry',
    },
  },
  {
    label: 'store + storage badge',
    note: 'store backs a storage badge beside the role badge.',
    component: {
      alias: 'store',
      name: 'sessionCache',
      construct: 'store',
      file: 'src/bun/session-cache.ts',
      purl: PURL,
      symbol: 'sessionCache',
      declaration: storeDetail,
    },
  },
  {
    label: 'proposed',
    note: 'dashed goldenrod border + right badge; fileless.',
    component: {
      alias: 'prop',
      name: 'OpenCodeV2Lifecycle',
      construct: 'function',
      file: '',
      purl: PURL,
      symbol: 'OpenCodeV2Lifecycle',
      proposed: true,
    },
  },
  {
    label: 'proposed + role',
    note: 'proposed wins the right badge; role stays on the model.',
    component: {
      alias: 'prop-role',
      name: 'startMaintainFlow',
      construct: 'function',
      file: '',
      purl: PURL,
      symbol: 'startMaintainFlow',
      proposed: true,
      role: 'service',
    },
  },
  {
    label: 'framework stereotype',
    note: 'left badge prefers "framework · stereotype"; border stays construct.',
    component: {
      alias: 'react',
      name: 'SubsystemComponentNode',
      construct: 'function',
      file: 'src/subsystem/nodes.tsx',
      purl: PURL,
      symbol: 'SubsystemComponentNode',
      framework: 'react',
      stereotype: 'component',
    },
  },
  {
    label: 'custom entity',
    note: 'left badge wears the entityKind.',
    component: {
      alias: 'entity',
      name: 'WorkRequester',
      construct: 'custom_entity',
      file: '',
      purl: 'external',
      entityKind: 'Person',
    },
  },
  {
    label: 'selected',
    note: 'selection only thickens the border (2 → 4); color stays construct.',
    component: {
      alias: 'sel',
      name: 'runMaintainModel',
      construct: 'function',
      file: 'src/bun/maintain-model.ts',
      purl: PURL,
      symbol: 'runMaintainModel',
    },
    selected: true,
  },
];

function ChannelCell({ channel }: { channel: Channel }) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 280 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: muted, minHeight: 28 }}>
        {channel.label}
      </div>
      <div style={{ position: 'relative', width: NODE_W, height: NODE_H, margin: '14px 0 16px' }}>
        <SubsystemComponentNode {...nodeProps(channel.component, { selected: channel.selected })} />
      </div>
      <div style={{ fontSize: 10, fontFamily: MONO, color: muted, lineHeight: 1.5 }}>
        {channel.note}
      </div>
    </div>
  );
}

const LEGEND: Array<[string, string]> = [
  ['border color', 'construct kind (Pierre palette) — or primary when a file is open (spotlight)'],
  ['border style', 'solid normally; dashed goldenrod when `proposed`; dotted when the node has findings'],
  ['border width', '2px; 4px when selected or file-matched'],
  ['corners', '8px rounded; square for `external`'],
  ['left badge (top edge)', 'construct / framework stereotype / entityKind'],
  ['right badge (top edge)', 'role, or `proposed` (wins); storage sits beside it'],
  ['bottom strip (bottom edge)', 'filename — hover only, or while that file is open'],
  ['fill', 'backgroundSecondary; opacity 0.18 when dimmed'],
  ['OCCUPIED', 'top-left · top-right · bottom-center · border · fill'],
  ['FREE', 'an outer ring/halo, and the bottom-left / bottom-right corners'],
];

/** The node's existing channels, one per cell, with a legend. */
export const Channels: Story = {
  render: () => {
    return (
      <div style={{ padding: 32, minHeight: '100vh', boxSizing: 'border-box' }}>
        <Legend />
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '40px 28px',
            alignItems: 'flex-start',
            marginTop: 28,
          }}
        >
          {CHANNELS.map((c) => (
            <ChannelCell key={c.component.alias} channel={c} />
          ))}
        </div>
      </div>
    );
  },
};

function Legend() {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  return (
    <div style={{ maxWidth: 720 }}>
      <div
        style={{
          fontSize: 12,
          fontFamily: MONO,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          color: muted,
          marginBottom: 10,
        }}
      >
        Channel legend
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', rowGap: 4, columnGap: 12 }}>
        {LEGEND.map(([k, v]) => (
          <React.Fragment key={k}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: theme.colors.text }}>{k}</span>
            <span style={{ fontSize: 11, color: muted, lineHeight: 1.5 }}>{v}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 2 — proposed diagnostics layer: severity ring + earliest-rung chip
// ---------------------------------------------------------------------------

type Severity = 'error' | 'info';
type Rung = 'file' | 'symbol' | 'declaration' | 'type' | 'signature';

const RUNG_LABEL: Record<Rung, string> = {
  file: 'file',
  symbol: 'symbol',
  declaration: 'declaration',
  type: 'type',
  signature: 'signature',
};

function IssueOverlayNode({
  component,
  severity,
  rung,
  count = 1,
}: {
  component: SubsystemComponent;
  severity: Severity;
  rung: Rung;
  count?: number;
}) {
  // The diagnostics layer is wired into the production node — the border turns
  // dotted (construct color kept) and the chip carries severity + rung + count.
  return (
    <div style={{ position: 'relative', width: NODE_W, height: NODE_H }}>
      <SubsystemComponentNode
        {...nodeProps(component, { issue: { severity, rung, count } })}
      />
    </div>
  );
}

function IssueCell({
  caption,
  clean,
  ...node
}: {
  caption: string;
  component: SubsystemComponent;
  severity: Severity;
  rung: Rung;
  count?: number;
  clean?: boolean;
}) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 280 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: muted, minHeight: 28 }}>{caption}</div>
      <div style={{ position: 'relative', width: NODE_W, height: NODE_H, margin: '16px 0 18px' }}>
        {clean ? (
          <SubsystemComponentNode {...nodeProps(node.component)} />
        ) : (
          <IssueOverlayNode
            component={node.component}
            severity={node.severity}
            rung={node.rung}
            count={node.count}
          />
        )}
      </div>
      <div style={{ fontSize: 10, fontFamily: MONO, color: muted }}>
        {clean
          ? 'no issues'
          : `${node.severity} · ${RUNG_LABEL[node.rung]}${
              node.count && node.count > 1 ? ` · ${node.count} issues` : ''
            }`}
      </div>
    </div>
  );
}

const ISSUE_EXAMPLES: Array<{
  caption: string;
  component: SubsystemComponent;
  severity: Severity;
  rung: Rung;
  count?: number;
  clean?: boolean;
}> = [
  {
    caption: 'clean node — no ring, no chip',
    component: CHANNELS[0]!.component,
    severity: 'error',
    rung: 'file',
    clean: true,
  },
  {
    caption: 'error · earliest rung is file (declaration file missing)',
    component: { ...CHANNELS[0]!.component, alias: 'e-file' },
    severity: 'error',
    rung: 'file',
    count: 2,
  },
  {
    caption: 'error · earliest rung is symbol (multiple symbol matches)',
    component: { ...CHANNELS[1]!.component, alias: 'e-sym' },
    severity: 'error',
    rung: 'symbol',
  },
  {
    caption: 'info/gap · dashed ring · declaration drift',
    component: { ...CHANNELS[1]!.component, alias: 'e-decl' },
    severity: 'info',
    rung: 'declaration',
  },
  {
    caption: 'error · type mismatch',
    component: { ...CHANNELS[7]!.component, alias: 'e-type' },
    severity: 'error',
    rung: 'type',
  },
  {
    caption: 'error · signature mismatch (deepest rung)',
    component: { ...CHANNELS[0]!.component, alias: 'e-sig' },
    severity: 'error',
    rung: 'signature',
  },
];

/** Diagnostics layer over real nodes — dotted border + earliest-rung chip. */
export const IssueOverlayProposal: Story = {
  render: () => {
    return (
      <div style={{ padding: 32, minHeight: '100vh', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: 720 }}>
          <div
            style={{
              fontSize: 12,
              fontFamily: MONO,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              color: '#a0a0a0',
              marginBottom: 10,
            }}
          >
            Wired · data.issue
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7, color: '#b0b0b0' }}>
            <li>
              <b>Dotted border</b> (keeps the construct color) = the node has findings — a sibling of
              <b> proposed</b>&apos;s dashed, kept distinct so the two don&apos;t read alike.
            </li>
            <li>
              <b>Corner chip</b> carries severity (<b>red</b> = error / contradicts source,{' '}
              <b>amber</b> = info/gap / couldn&apos;t confirm) and the <i>earliest failing rung</i> by
              verification order (file → symbol → declaration → type → signature), with a count when a
              node has more than one.
            </li>
            <li>
              First cell is the clean node for contrast — solid border, no chip. Severity rides on the
              chip so it never competes with the construct palette.
            </li>
          </ul>
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '40px 28px',
            alignItems: 'flex-start',
            marginTop: 28,
          }}
        >
          {ISSUE_EXAMPLES.map((ex) => (
            <IssueCell key={ex.caption} {...ex} />
          ))}
        </div>
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// Section 3 — proposed verification ladder: one square per rung (file →
// symbol → declaration → type → signature). Because the rungs are ordered, the
// row reads as a degree of verification: fills until the first problem, then
// the problem square, then dim (never reached).
// ---------------------------------------------------------------------------

type RungStatus = 'verified' | 'failed' | 'unconfirmed' | 'skipped';

const VERIFICATION_RUNGS = ['file', 'symbol', 'declaration', 'type', 'signature'] as const;
const RUNG_STATUS_LABEL: Record<RungStatus, string> = {
  verified: 'verified',
  failed: 'failed',
  unconfirmed: 'unconfirmed',
  skipped: 'not reached / skipped',
};

function VerificationSquares({ statuses }: { statuses: RungStatus[] }) {
  const { theme } = useTheme();
  const success = theme.colors.success ?? '#2da44e';
  const error = theme.colors.error ?? '#e5534b';
  const warning = theme.colors.warning ?? '#d4a017';
  const dim = theme.colors.border ?? '#444';
  const nodeBg = theme.colors.backgroundSecondary ?? theme.colors.background;
  return (
    // One connected track: hairline node-colored dividers between cells and
    // shared rounded ends, so an all-green row reads as a single filled bar
    // while the cells stay countable.
    <div
      style={{
        display: 'flex',
        gap: 1,
        background: nodeBg,
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      {statuses.map((status, i) => {
        const base = { width: 9, height: 9, boxSizing: 'border-box' as const };
        if (status === 'verified')
          return <span key={i} style={{ ...base, background: success }} />;
        if (status === 'failed') return <span key={i} style={{ ...base, background: error }} />;
        if (status === 'unconfirmed')
          return (
            <span key={i} style={{ ...base, boxShadow: `inset 0 0 0 1.5px ${warning}` }} />
          );
        // not reached / skipped — a filled neutral so it stays legible on the node
        return <span key={i} style={{ ...base, background: dim }} />;
      })}
    </div>
  );
}

function VerifiedNode({
  component,
  statuses,
}: {
  component: SubsystemComponent;
  statuses: RungStatus[];
}) {
  return (
    <div style={{ position: 'relative', width: NODE_W, height: NODE_H }}>
      <SubsystemComponentNode {...nodeProps(component)} />
      <div
        style={{
          position: 'absolute',
          bottom: 7,
          left: '50%',
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
        }}
      >
        <VerificationSquares statuses={statuses} />
      </div>
    </div>
  );
}

const S: Record<'v' | 'x' | 'o' | 'd', RungStatus> = {
  v: 'verified',
  x: 'failed',
  o: 'unconfirmed',
  d: 'skipped',
};

const VERIFICATION_EXAMPLES: Array<{ caption: string; statuses: RungStatus[] }> = [
  { caption: 'fully verified — all five filled', statuses: [S.v, S.v, S.v, S.v, S.v] },
  { caption: 'file missing — ladder stops at rung 1', statuses: [S.x, S.d, S.d, S.d, S.d] },
  { caption: 'symbol ambiguous — fails at rung 2', statuses: [S.v, S.x, S.d, S.d, S.d] },
  {
    caption: 'declaration drift — fails at rung 3',
    statuses: [S.v, S.v, S.x, S.d, S.d],
  },
  {
    caption: 'type unconfirmed — gap at rung 4',
    statuses: [S.v, S.v, S.v, S.o, S.d],
  },
  {
    caption: 'signature unconfirmed — gap at rung 5',
    statuses: [S.v, S.v, S.v, S.v, S.o],
  },
  { caption: 'no audit / cache unavailable — all unknown', statuses: [S.d, S.d, S.d, S.d, S.d] },
];

function VerificationCell({
  caption,
  statuses,
}: {
  caption: string;
  statuses: RungStatus[];
}) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 280 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: muted, minHeight: 28 }}>{caption}</div>
      <div style={{ position: 'relative', width: NODE_W, height: NODE_H, margin: '14px 0 16px' }}>
        <VerifiedNode component={CHANNELS[0]!.component} statuses={statuses} />
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: muted }}>
        {statuses.map((s) => RUNG_STATUS_LABEL[s]).join(' · ')}
      </div>
    </div>
  );
}

/** Proposed verification ladder: a square per rung, filled to the degree verified. */
export const VerificationSteps: Story = {
  render: () => (
    <div style={{ padding: 32, minHeight: '100vh', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 720 }}>
        <div
          style={{
            fontSize: 12,
            fontFamily: MONO,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            color: '#a0a0a0',
            marginBottom: 10,
          }}
        >
          Proposed · not wired yet
        </div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: '#b0b0b0', marginBottom: 12 }}>
          rungs, in order: {VERIFICATION_RUNGS.join(' → ')}
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7, color: '#b0b0b0' }}>
          <li>
            <b>green</b> = verified, <b>red</b> = failed, <b>hollow amber</b> = unconfirmed (info),
            <b> grey</b> = skipped / not reached.
          </li>
          <li>
            Ordered, so the row IS the degree of verification: it fills up to the first problem, then
            goes dim.
          </li>
          <li>
            Source: the per-component <i>audit check</i> — file → symbol → declaration → type →
            signature. No new audit work.
          </li>
        </ul>
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '36px 28px',
          alignItems: 'flex-start',
          marginTop: 28,
        }}
      >
        {VERIFICATION_EXAMPLES.map((ex) => (
          <VerificationCell key={ex.caption} {...ex} />
        ))}
      </div>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Section 4 — diagnostic-mode hover: the filename strip is replaced by the
// node's issue badge (earliest failing rung + count). Filename still shows when
// the file is open (fileMatch); clean nodes show no badge.
// ---------------------------------------------------------------------------

function IssueHoverBadge({ severity, label }: { severity: Severity; label: string }) {
  const { theme } = useTheme();
  const color =
    severity === 'error'
      ? (theme.colors.error ?? '#e5534b')
      : (theme.colors.warning ?? '#d4a017');
  return (
    <div
      style={{
        position: 'absolute',
        bottom: -22,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1,
        fontFamily: MONO,
        fontSize: theme.fontSizes[0],
        letterSpacing: 0.5,
        lineHeight: '17px',
        whiteSpace: 'nowrap',
        color,
        background: theme.colors.backgroundSecondary ?? theme.colors.background,
        border: `2px solid ${color}`,
        borderRadius: 4,
        padding: '2px 8px',
      }}
    >
      {label}
    </div>
  );
}

function DiagnosticHoverNode({
  statuses,
  badge,
}: {
  statuses: RungStatus[];
  badge?: { severity: Severity; label: string };
}) {
  return (
    <div style={{ position: 'relative', width: NODE_W, height: NODE_H }}>
      <SubsystemComponentNode {...nodeProps(CHANNELS[0]!.component)} />
      <div
        style={{
          position: 'absolute',
          bottom: 7,
          left: '50%',
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
        }}
      >
        <VerificationSquares statuses={statuses} />
      </div>
      {badge && <IssueHoverBadge {...badge} />}
    </div>
  );
}

const DIAGNOSTIC_HOVER_EXAMPLES: Array<{
  caption: string;
  statuses: RungStatus[];
  badge?: { severity: Severity; label: string };
}> = [
  { caption: 'clean — all green, no hover badge', statuses: [S.v, S.v, S.v, S.v, S.v] },
  {
    caption: 'hover → file rung failed',
    statuses: [S.x, S.d, S.d, S.d, S.d],
    badge: { severity: 'error', label: 'Construct declaration file missing' },
  },
  {
    caption: 'hover → symbol unconfirmed',
    statuses: [S.v, S.x, S.d, S.d, S.d],
    badge: { severity: 'info', label: 'Construct symbol unconfirmed' },
  },
  {
    caption: 'hover → type mismatch',
    statuses: [S.v, S.v, S.v, S.x, S.d],
    badge: { severity: 'error', label: 'Construct type mismatch' },
  },
  {
    caption: 'hover → signature unconfirmed',
    statuses: [S.v, S.v, S.v, S.v, S.o],
    badge: { severity: 'info', label: 'Construct signature unconfirmed' },
  },
];

/** Diagnostic-mode hover: issue badge replaces the filename strip. */
export const DiagnosticHover: Story = {
  render: () => (
    <div style={{ padding: 32, minHeight: '100vh', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 720 }}>
        <div
          style={{
            fontSize: 12,
            fontFamily: MONO,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            color: '#a0a0a0',
            marginBottom: 10,
          }}
        >
          Proposed · not wired yet
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7, color: '#b0b0b0' }}>
          <li>
            In diagnostic mode, hovering a node shows its <b>issue badge</b> (earliest failing rung +
            count) where the filename strip normally appears.
          </li>
          <li>
            The filename still appears when that file is open in the drawer (file-open spotlight), and
            when diagnostics are off.
          </li>
          <li>Clean nodes show no badge — the all-green bar carries that.</li>
        </ul>
      </div>
      <DiagnosticHoverGrid />
    </div>
  ),
};

function DiagnosticHoverGrid() {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '56px 28px',
        alignItems: 'flex-start',
        marginTop: 28,
      }}
    >
      {DIAGNOSTIC_HOVER_EXAMPLES.map((ex) => (
        <div
          key={ex.caption}
          style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 280 }}
        >
          <div style={{ fontFamily: MONO, fontSize: 11, color: muted, minHeight: 28 }}>
            {ex.caption}
          </div>
          <div style={{ position: 'relative', width: NODE_W, height: NODE_H, margin: '14px 0 28px' }}>
            <DiagnosticHoverNode statuses={ex.statuses} badge={ex.badge} />
          </div>
        </div>
      ))}
    </div>
  );
}
