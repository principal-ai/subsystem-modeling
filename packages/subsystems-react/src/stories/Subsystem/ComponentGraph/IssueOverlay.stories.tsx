import { useMemo, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent, SubsystemWalkthrough } from '../../../subsystem/model';
import {
  issueCategory,
  type SubsystemIssue,
  type SubsystemIssueCategory,
} from '../../../subsystem/IssueList';

/**
 * IssueOverlay — the proposed per-node diagnostics layer (severity ring +
 * earliest-rung corner chip, see NodeAnatomy/IssueOverlayProposal) driven by a
 * *real* subsystem graph rather than isolated nodes.
 *
 * The graph is the Maintain-run model stored at
 *   ~/.principal/subsystem-models/sg-1789951509967-ppkvezdy0.json
 * ("Maintain run — fire-and-forget RPC, wait for the finish event"): the
 * renderer picker → host RPC → background runner → maintain orchestrator →
 * opencode V2 session, plus the liveness-probe handshake. Its components and
 * three walkthroughs are reproduced verbatim below; the topology is carried by
 * the walkthroughs (`relations: []`), exactly as stored.
 *
 * What this story exercises: the graph's diagnostics surface over the real
 * model — the title-row status chip, the grouped issue list, the per-node
 * overlay (dotted border + earliest-rung chip, wired via `data.issue`), and
 * layer-expand dimming. Clicking a card focuses its construct; collapsing it
 * unfocuses.
 */
const meta = {
  title: 'Subsystem/ComponentGraph/IssueOverlay',
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PURL = 'pkg:github/principal-ai/subsystem-modeling';
const HOST = 'subsystems-studio/host';
const RENDERER = 'subsystems-studio/renderer';
/** The host barrel whose members disagree about their process (see `events-tab`). */
const BUN_INDEX = 'packages/subsystems-studio/src/bun/index.ts';

/** The Maintain-run model's components, as captured in the stored model. */
const MAINTAIN_COMPONENTS: SubsystemComponent[] = [
  {
    alias: 'maintain-picker',
    name: 'MaintainModelPickerModal',
    construct: 'function',
    role: 'entry',
    process: RENDERER,
    file: 'packages/subsystems-studio/src/mainview/components/MaintainModelPickerModal.tsx',
    purl: PURL,
    symbol: 'MaintainModelPickerModal',
    purpose: 'Picks the tier + model, then fires the maintain RPC and closes.',
    framework: 'react',
    stereotype: 'component',
  },
  {
    alias: 'maintain-rpc-handler',
    name: 'maintainSubsystemModel RPC',
    construct: 'function',
    role: 'entry',
    process: HOST,
    file: 'packages/subsystems-studio/src/bun/index.ts',
    module: BUN_INDEX,
    purl: PURL,
    purpose: 'Fire-and-forget RPC: returns started:true and hands off to the background runner.',
  },
  {
    alias: 'maintain-background-runner',
    name: 'maintainSubsystemModelInBackground',
    construct: 'function',
    process: HOST,
    file: 'packages/subsystems-studio/src/bun/index.ts',
    module: BUN_INDEX,
    purl: PURL,
    symbol: 'maintainSubsystemModelInBackground',
    purpose: 'Guards duplicate runs, broadcasts running/done/error, and resolves the background maintain result.',
  },
  {
    alias: 'maintain-orchestrator',
    name: 'maintainSubsystemModel',
    construct: 'function',
    process: HOST,
    file: 'packages/subsystems-studio/src/bun/maintain-model.ts',
    purl: PURL,
    symbol: 'maintainSubsystemModel',
    purpose: 'Installs agents, audits, routes by verdict, builds the brief, and resolves the maintainer model.',
  },
  {
    alias: 'maintain-agent-launcher',
    name: 'runMaintainAgent',
    construct: 'function',
    process: HOST,
    file: 'packages/subsystems-studio/src/bun/maintain-model.ts',
    purl: PURL,
    symbol: 'runMaintainAgent',
    purpose: 'Wraps an opencode V2 session run with the agent, task, and model.',
  },
  {
    alias: 'session-runner',
    name: 'runOpencodeV2AgentSession',
    construct: 'function',
    process: HOST,
    file: 'packages/subsystems-studio/src/bun/opencode-v2-live.ts',
    purl: PURL,
    symbol: 'runOpencodeV2AgentSession',
    purpose: 'Creates + prompts an opencode session, then blocks until a terminal event arrives on the SSE feed.',
  },
  {
    alias: 'service-ensurer',
    name: 'ensureServiceRunning',
    construct: 'function',
    process: HOST,
    file: 'packages/subsystems-studio/src/bun/opencode-v2-live.ts',
    purl: PURL,
    symbol: 'ensureServiceRunning',
    purpose: 'Starts the opencode2 service when the daemon is not healthy.',
  },
  {
    alias: 'sse-feed-reader',
    name: 'readSse',
    construct: 'function',
    process: HOST,
    file: 'packages/subsystems-studio/src/bun/opencode-v2-live.ts',
    purl: PURL,
    symbol: 'readSse',
    purpose: 'Streams /api/event once and routes raw events into the wait loop.',
  },
  {
    alias: 'terminal-matcher',
    name: 'isTerminalEvent',
    construct: 'function',
    process: HOST,
    file: 'packages/subsystems-studio/src/bun/opencode-v2-live.ts',
    purl: PURL,
    symbol: 'isTerminalEvent',
    purpose: 'True when an event ends the session (execution finished/succeeded/failed or session idle).',
  },
  {
    alias: 'live-feed-store',
    name: 'OpencodeLiveFeedState store',
    construct: 'store',
    process: HOST,
    file: 'packages/subsystems-studio/src/bun/opencode-v2-live.ts',
    purl: PURL,
    symbol: 'subscribeOpencodeLiveFeeds',
    purpose: 'Retains per-session live status (starting/running/done/error) pushed to the renderer.',
  },
  {
    alias: 'maintain-probe-registry',
    name: 'MaintainerProbeRegistry',
    construct: 'store',
    process: HOST,
    file: 'packages/subsystems-studio/src/bun/maintainer-probe.ts',
    purl: PURL,
    symbol: 'getMaintainerProbeRegistry',
    purpose: "Records when a maintain run's liveness probe lands.",
  },
  {
    alias: 'probe-route',
    name: 'POST /api/maintainer/probe',
    construct: 'function',
    role: 'entry',
    process: HOST,
    file: 'packages/subsystems-studio/src/bun/http-server.ts',
    purl: PURL,
    purpose: "Liveness endpoint the agent's first tool call curls; proves the model can run tools headless.",
  },
  {
    alias: 'events-tab',
    name: 'openMaintainEventsTab',
    construct: 'function',
    // Declared in the host barrel, but the only thing it does is drive the
    // renderer — so it claims the renderer process. That disagreement with its
    // two barrel siblings is exactly the `boundary_process_nest_disagree`
    // finding below, and it is why the barrel gets a frame that refuses to
    // nest under either process.
    process: RENDERER,
    file: 'packages/subsystems-studio/src/bun/index.ts',
    module: BUN_INDEX,
    purl: PURL,
    symbol: 'openMaintainEventsTab',
    purpose: "Opens the renderer tab that renders a session's live feed.",
  },
  {
    alias: 'opencode-v2-server',
    name: 'OpenCode V2 service',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external:opencode2-service',
    purpose: 'The opencode2 daemon owning /api/session and /api/event; executes the agent session.',
  },
];

/** The model's three runtime walkthroughs, verbatim (these carry the topology). */
const MAINTAIN_WALKTHROUGHS: SubsystemWalkthrough[] = [
  {
    id: 'wt-start-maintain',
    title: 'Start a maintenance run',
    steps: [
      {
        from: 'maintain-picker',
        to: 'maintain-rpc-handler',
        mechanism: 'calls',
        file: 'packages/subsystems-studio/src/mainview/components/MaintainModelPickerModal.tsx',
        line: 116,
        symbol: 'MaintainModelPickerModal',
        purl: `${PURL}#packages/subsystems-studio/src/mainview/components/MaintainModelPickerModal.tsx`,
        annotation: 'Fire the maintainSubsystemModel RPC with the selected model.',
      },
      {
        from: 'maintain-rpc-handler',
        to: 'maintain-background-runner',
        mechanism: 'calls',
        file: 'packages/subsystems-studio/src/bun/index.ts',
        line: 2522,
        symbol: 'maintainSubsystemModelInBackground',
        purl: `${PURL}#packages/subsystems-studio/src/bun/index.ts`,
        annotation: 'RPC returns started:true immediately and hands off to the guarded runner.',
      },
      {
        from: 'maintain-background-runner',
        to: 'maintain-orchestrator',
        mechanism: 'calls',
        file: 'packages/subsystems-studio/src/bun/index.ts',
        line: 3160,
        symbol: 'maintainSubsystemModelInBackground',
        purl: `${PURL}#packages/subsystems-studio/src/bun/index.ts`,
        annotation: 'Run the full install → audit → route-by-verdict → brief pipeline.',
      },
      {
        from: 'maintain-orchestrator',
        to: 'maintain-agent-launcher',
        mechanism: 'calls',
        file: 'packages/subsystems-studio/src/bun/maintain-model.ts',
        line: 854,
        symbol: 'runMaintainAgent',
        purl: `${PURL}#packages/subsystems-studio/src/bun/maintain-model.ts`,
        annotation: 'Resolve the model then launch the agent run, retrying once on the credentialed fallback if unusable.',
      },
      {
        from: 'maintain-agent-launcher',
        to: 'session-runner',
        mechanism: 'calls',
        file: 'packages/subsystems-studio/src/bun/maintain-model.ts',
        line: 742,
        symbol: 'runOpencodeV2AgentSession',
        purl: `${PURL}#packages/subsystems-studio/src/bun/maintain-model.ts`,
        annotation: 'Hand the brief, agent, and directory to the V2 session runner.',
      },
      {
        from: 'maintain-background-runner',
        to: 'events-tab',
        mechanism: 'calls',
        file: 'packages/subsystems-studio/src/bun/index.ts',
        line: 3164,
        symbol: 'maintainSubsystemModelInBackground',
        purl: `${PURL}#packages/subsystems-studio/src/bun/index.ts`,
        annotation: 'Open the live feed tab the instant the session id exists.',
      },
    ],
  },
  {
    id: 'wt-wait-finish-event',
    title: 'Wait for the finish event',
    steps: [
      {
        from: 'session-runner',
        to: 'sse-feed-reader',
        mechanism: 'calls',
        file: 'packages/subsystems-studio/src/bun/opencode-v2-live.ts',
        line: 355,
        symbol: 'runOpencodeV2AgentSession',
        purl: `${PURL}#packages/subsystems-studio/src/bun/opencode-v2-live.ts`,
        annotation: 'Open the /api/event subscription before creating the session.',
      },
      {
        from: 'sse-feed-reader',
        to: 'opencode-v2-server',
        mechanism: 'watches',
        file: 'packages/subsystems-studio/src/bun/opencode-v2-live.ts',
        line: 222,
        symbol: 'readSse',
        purl: `${PURL}#packages/subsystems-studio/src/bun/opencode-v2-live.ts`,
        annotation: "Stream the single SSE feed that carries every session's events.",
      },
      {
        from: 'session-runner',
        to: 'service-ensurer',
        mechanism: 'calls',
        file: 'packages/subsystems-studio/src/bun/opencode-v2-live.ts',
        line: 326,
        symbol: 'runOpencodeV2AgentSession',
        purl: `${PURL}#packages/subsystems-studio/src/bun/opencode-v2-live.ts`,
        annotation: 'Ensure the opencode2 daemon is healthy, starting the service if it is not.',
      },
      {
        from: 'session-runner',
        to: 'opencode-v2-server',
        mechanism: 'calls',
        file: 'packages/subsystems-studio/src/bun/opencode-v2-live.ts',
        line: 384,
        symbol: 'runOpencodeV2AgentSession',
        purl: `${PURL}#packages/subsystems-studio/src/bun/opencode-v2-live.ts`,
        annotation: 'POST /api/session creates the session with a 15s HTTP timeout.',
      },
      {
        from: 'session-runner',
        to: 'opencode-v2-server',
        mechanism: 'calls',
        file: 'packages/subsystems-studio/src/bun/opencode-v2-live.ts',
        line: 428,
        symbol: 'runOpencodeV2AgentSession',
        purl: `${PURL}#packages/subsystems-studio/src/bun/opencode-v2-live.ts`,
        annotation: 'POST /api/session/{id}/prompt feeds the maintain brief with a 15s HTTP timeout.',
      },
      {
        from: 'sse-feed-reader',
        to: 'terminal-matcher',
        mechanism: 'calls',
        file: 'packages/subsystems-studio/src/bun/opencode-v2-live.ts',
        line: 365,
        symbol: 'readSse',
        purl: `${PURL}#packages/subsystems-studio/src/bun/opencode-v2-live.ts`,
        annotation: 'Flag sawTerminal when the event is an execution finish or session idle.',
      },
      {
        from: 'terminal-matcher',
        to: 'session-runner',
        mechanism: 'feeds',
        file: 'packages/subsystems-studio/src/bun/opencode-v2-live.ts',
        line: 469,
        symbol: 'runOpencodeV2AgentSession',
        purl: `${PURL}#packages/subsystems-studio/src/bun/opencode-v2-live.ts`,
        annotation: 'Wait loop polls every 400ms until sawTerminal or the 15-minute deadline.',
      },
      {
        from: 'session-runner',
        to: 'maintain-probe-registry',
        mechanism: 'reads',
        file: 'packages/subsystems-studio/src/bun/opencode-v2-live.ts',
        line: 484,
        symbol: 'runOpencodeV2AgentSession',
        purl: `${PURL}#packages/subsystems-studio/src/bun/opencode-v2-live.ts`,
        annotation: "Confirm the model's first tool call landed the liveness probe; abort as unusable on timeout.",
      },
      {
        from: 'session-runner',
        to: 'live-feed-store',
        mechanism: 'writes',
        file: 'packages/subsystems-studio/src/bun/opencode-v2-live.ts',
        line: 529,
        symbol: 'runOpencodeV2AgentSession',
        purl: `${PURL}#packages/subsystems-studio/src/bun/opencode-v2-live.ts`,
        annotation: 'Stamp the feed done (or error) when the wait loop exits.',
      },
      {
        from: 'maintain-background-runner',
        to: 'maintain-picker',
        mechanism: 'feeds',
        file: 'packages/subsystems-studio/src/bun/index.ts',
        line: 3187,
        symbol: 'maintainSubsystemModelInBackground',
        purl: `${PURL}#packages/subsystems-studio/src/bun/index.ts`,
        annotation: 'Broadcast done/error so the Maintain row flips off Running.',
      },
    ],
  },
  {
    id: 'wt-probe-handshake',
    title: 'Liveness probe handshake',
    steps: [
      {
        from: 'opencode-v2-server',
        to: 'probe-route',
        mechanism: 'calls',
        file: 'packages/subsystems-studio/src/bun/http-server.ts',
        line: 314,
        symbol: 'handleSubsystemModelRequest',
        purl: `${PURL}#packages/subsystems-studio/src/bun/http-server.ts`,
        annotation: "The agent's step-0 tool call curls POST /api/maintainer/probe with the run token.",
      },
      {
        from: 'probe-route',
        to: 'maintain-probe-registry',
        mechanism: 'writes',
        file: 'packages/subsystems-studio/src/bun/http-server.ts',
        line: 318,
        symbol: 'getMaintainerProbeRegistry',
        purl: `${PURL}#packages/subsystems-studio/src/bun/http-server.ts`,
        annotation: 'mark(runId) records when the probe landed.',
      },
      {
        from: 'session-runner',
        to: 'maintain-probe-registry',
        mechanism: 'reads',
        file: 'packages/subsystems-studio/src/bun/opencode-v2-live.ts',
        line: 484,
        symbol: 'runOpencodeV2AgentSession',
        purl: `${PURL}#packages/subsystems-studio/src/bun/opencode-v2-live.ts`,
        annotation: 'Each loop tick checks whether the token landed before the probe deadline.',
      },
    ],
  },
];

/**
 * Illustrative audit findings, mapped onto the real component aliases in the
 * Maintain-run model. The stored model's verification block is clean
 * (13/13 anchored, 0 missing), so these are the *shape* of findings the
 * diagnostics layer would receive — one per rung of the verification ladder
 * (file → symbol → declaration → type → signature) plus the topology / walkthrough
 * layers — to exercise the proposal end to end.
 */
const MAINTAIN_ISSUES: SubsystemIssue[] = [
  {
    id: 'mr-file',
    severity: 'error',
    kind: 'missing_file',
    message:
      'File packages/subsystems-studio/src/bun/maintainer-probe.ts is not present on disk at the captured commit.',
    target: { kind: 'component', id: 'maintain-probe-registry', label: 'MaintainerProbeRegistry' },
    fix: { label: 'Re-anchor to the current file' },
  },
  {
    id: 'mr-symbol',
    severity: 'error',
    kind: 'symbol_ambiguous',
    message: 'Multiple graphify nodes match runOpencodeV2AgentSession (2 candidates).',
    target: { kind: 'component', id: 'session-runner', label: 'runOpencodeV2AgentSession' },
  },
  {
    id: 'mr-decl',
    severity: 'error',
    kind: 'stale_declaration',
    message: 'Declaration moved since capture — recorded start line 2522, now 2588.',
    target: {
      kind: 'component',
      id: 'maintain-background-runner',
      label: 'maintainSubsystemModelInBackground',
    },
    fix: { label: 'Re-pin declaration' },
  },
  {
    id: 'mr-type',
    severity: 'error',
    kind: 'signature_mismatch',
    message: 'Claimed (agent, task, model) => Session; graphify has (opts: RunOptions) => void.',
    target: { kind: 'component', id: 'maintain-agent-launcher', label: 'runMaintainAgent' },
  },
  {
    id: 'mr-sig',
    severity: 'info',
    kind: 'signature_unconfirmed',
    message: 'Named parameter types are not present in the graphify cache.',
    target: { kind: 'component', id: 'maintain-orchestrator', label: 'maintainSubsystemModel' },
  },
  {
    id: 'mr-symbol-unmatched',
    severity: 'info',
    kind: 'symbol_unmatched',
    message:
      'No graphify node matches symbol readSse in packages/subsystems-studio/src/bun/opencode-v2-live.ts',
    target: { kind: 'component', id: 'sse-feed-reader', label: 'readSse' },
  },
  {
    id: 'mr-construct',
    severity: 'info',
    kind: 'construct_unconfirmed',
    message: 'Graphify anchored the node but left the construct unclassified (store vs interface).',
    target: { kind: 'component', id: 'live-feed-store', label: 'OpencodeLiveFeedState store' },
  },
  {
    id: 'mr-endpoint',
    severity: 'error',
    kind: 'topology_broken_endpoint',
    message: 'Relationship endpoint "maintain-background-runner" does not resolve to a component.',
    target: {
      kind: 'relation',
      id: 'maintain-rpc-handler→maintain-background-runner',
      label: 'maintainSubsystemModel RPC → maintainSubsystemModelInBackground',
      detail: 'calls',
    },
  },
  {
    id: 'mr-hang',
    severity: 'error',
    kind: 'topology_broken_endpoint',
    message: 'Run reaches the 15-minute deadline without an endpoint on the finish event.',
    target: {
      kind: 'relation',
      id: 'session-runner→opencode-v2-server',
      label: 'runOpencodeV2AgentSession → OpenCode V2 service',
      detail: 'calls',
    },
  },
  {
    id: 'mr-boundary',
    severity: 'info',
    kind: 'boundary_process_nest_disagree',
    message:
      'module "packages/subsystems-studio/src/bun/index.ts" members claim different processes: "subsystems-studio/host", "subsystems-studio/renderer"',
    target: {
      kind: 'module',
      id: BUN_INDEX,
      label: 'packages/subsystems-studio/src/bun/index.ts',
    },
  },
  {
    id: 'mr-wt',
    severity: 'info',
    kind: 'walkthrough',
    message:
      'Step 7 (terminal-matcher → session-runner) references a line that moved (was :469).',
    target: {
      kind: 'step',
      id: 'wt-wait-finish-event',
      label: 'Wait for the finish event',
      detail: 'step 7',
      stepIndex: 6,
    },
  },
  {
    id: 'mr-repo',
    severity: 'info',
    kind: 'repo_unresolved',
    message:
      'Repo external:opencode2-service is not available locally — start the daemon to verify its endpoints.',
    target: { kind: 'repo', id: 'external:opencode2-service', label: 'external:opencode2-service' },
  },
];

function MaintainRunGraph({
  issues,
  status,
  showIssues,
  focusCategory,
}: {
  issues: SubsystemIssue[];
  status: 'ok' | 'issues' | 'gaps';
  showIssues?: boolean;
  focusCategory?: SubsystemIssueCategory;
}) {
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const errorCount = useMemo(
    () => issues.filter((i) => i.severity === 'error').length,
    [issues],
  );
  const gapCount = useMemo(
    () => issues.filter((i) => i.severity === 'info').length,
    [issues],
  );
  const issueCount = status === 'issues' ? errorCount : status === 'gaps' ? gapCount : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100vh' }}>
      <div
        style={{
          padding: '6px 12px',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 11,
          opacity: 0.7,
          borderBottom: '1px solid #333',
        }}
      >
        proposed diagnostics layer · over the real Maintain-run graph ·{' '}
        {lastEvent ?? 'click an issue to focus its target'}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SubsystemComponentGraph
          components={MAINTAIN_COMPONENTS}
          relations={[]}
          walkthroughs={MAINTAIN_WALKTHROUGHS}
          title="Maintain run"
          description="Fire-and-forget RPC, wait for the finish event — picker → RPC → background runner → orchestrator → opencode V2 session, plus the liveness-probe handshake."
          diagnostic={{ status, issueCount, onToggle: () => {} }}
          issues={issues}
          showIssues={showIssues}
          focusIssueCategory={focusCategory}
          onSelectIssue={(issue) =>
            setLastEvent(
              `focused ${issue.target?.label ?? issue.id} · ${issueCategory(issue)}`,
            )
          }
          onApplyIssueFix={(issue) => setLastEvent(`applied fix · ${issue.id}`)}
          onHoverIssue={(issue) =>
            setLastEvent(issue ? `hover ${issue.target?.label ?? issue.id}` : null)
          }
        />
      </div>
    </div>
  );
}

/** The model as stored — clean (13/13 anchored). Contrast for the overlay. */
export const MaintainRunClean: Story = {
  render: () => <MaintainRunGraph issues={[]} status="ok" />,
};

/** The real graph in diagnostics mode, fed the illustrative findings above. */
export const MaintainRunIssues: Story = {
  render: () => <MaintainRunGraph issues={MAINTAIN_ISSUES} status="issues" showIssues />,
};

/** Diagnostics seeded from issue presence; land the list on the construct layer. */
export const MaintainRunConstructLayer: Story = {
  render: () => (
    <MaintainRunGraph
      issues={MAINTAIN_ISSUES}
      status="issues"
      focusCategory="construct"
    />
  ),
};
