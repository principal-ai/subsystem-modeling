import '@xyflow/react/dist/style.css';
import React, { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import { SubsystemIssueList, issueCategory, type SubsystemIssue, type SubsystemIssueCategory } from '../../../subsystem/IssueList';
import { verifyProcessBoundaries, verificationIssues } from '../../../subsystem/c4Evidence';
import { getSubsystemRegions, type SubsystemComponent, type SubsystemTrail } from '../../../subsystem/model';
import type { C4Container } from '../../../subsystem/c4';
import { components, graphSpecFromSteps } from './fixtures';

const meta = {
  title: 'Subsystem/ComponentGraph/Issues',
  component: SubsystemComponentGraph,
  parameters: {
    layout: 'fullscreen',
  },
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

const ISSUES: SubsystemIssue[] = [
  {
    id: 'i1',
    severity: 'error',
    kind: 'missing_file',
    message: 'File src/checkout/cartStore.ts is not present on disk (repo pkg:github/you/your-app).',
    target: { kind: 'component', id: 'store', label: 'cartStore' },
    fix: { label: 'Use graphify file' },
  },
  {
    id: 'i2',
    severity: 'error',
    kind: 'construct_mismatch',
    message: 'Claimed function but graphify infers class.',
    target: { kind: 'component', id: 'entry', label: 'checkoutApi' },
  },
  {
    id: 'i3',
    severity: 'info',
    kind: 'signature_unconfirmed',
    message: 'Named parameter types are not present in the graphify cache.',
    target: { kind: 'component', id: 'entry', label: 'checkoutApi' },
  },
  {
    id: 'i5',
    severity: 'info',
    kind: 'boundary_module_file_mismatch',
    message: 'Module "src/checkout" contains a file outside its declared root.',
    target: { kind: 'module', id: 'src/checkout', label: 'src/checkout' },
  },
  {
    id: 'i6',
    severity: 'info',
    kind: 'trail',
    message: 'Step 2 references a line that moved (was :42).',
    target: {
      kind: 'step',
      id: 'story-steps',
      label: 'Story steps',
      detail: 'step 2',
      stepIndex: 1,
    },
  },
  {
    id: 'i20',
    severity: 'info',
    kind: 'step_unconfirmed',
    message: 'Trail "Story steps" step 1: call site not verified (entry → store via writes)',
    target: {
      kind: 'step',
      id: 'story-steps',
      label: 'Story steps',
      detail: 'step 1',
      stepIndex: 0,
    },
  },
  {
    id: 'i21',
    severity: 'info',
    kind: 'step_stale',
    message: 'Trail "Story steps" step 2: call site changed since verification (lines 42-44 in src/checkout/api.ts)',
    target: {
      kind: 'step',
      id: 'story-steps',
      label: 'Story steps',
      detail: 'step 2',
      stepIndex: 1,
    },
  },
  {
    id: 'i7',
    severity: 'info',
    kind: 'boundary_process_nest_disagree',
    message:
      'module "src/host/main.ts" members claim different processes: "host", "renderer"',
    target: { kind: 'module', id: 'src/host/main.ts', label: 'src/host/main.ts' },
  },
  {
    id: 'i17',
    severity: 'error',
    kind: 'symbol_ambiguous',
    message: 'Multiple Graphify nodes match readSession (3 candidates)',
    target: { kind: 'component', id: 'session-reader', label: 'SessionReader' },
  },
  {
    id: 'i18',
    severity: 'error',
    kind: 'symbol_unmatched',
    message: 'No Graphify node matches symbol persistSession in src/session/SessionStore.ts',
    target: { kind: 'component', id: 'session-store', label: 'SessionStore' },
  },
  {
    id: 'i9',
    severity: 'error',
    kind: 'stale_declaration',
    message: 'Declaration moved since capture — recorded start line 42, now 57.',
    target: { kind: 'component', id: 'session-store', label: 'SessionStore' },
    fix: { label: 'Re-pin declaration' },
  },
  {
    id: 'i10',
    severity: 'info',
    kind: 'construct_unconfirmed',
    message: 'Graphify anchored the node but left the construct unclassified (interface vs type alias).',
    target: { kind: 'component', id: 'host-info', label: 'HostInfo' },
  },
  {
    id: 'i11',
    severity: 'error',
    kind: 'signature_mismatch',
    message: 'Claimed (req: HostInfo) => Session; Graphify has (string) => void.',
    target: { kind: 'component', id: 'entry', label: 'checkoutApi' },
  },
  {
    id: 'i13',
    severity: 'info',
    kind: 'repo_unresolved',
    message: 'Repo pkg:github/acme/worker is not available locally — clone it to verify its components',
    target: { kind: 'repo', id: 'pkg:github/acme/worker', label: 'pkg:github/acme/worker' },
  },
  {
    id: 'i19',
    severity: 'info',
    kind: 'graphify_unavailable',
    message: 'Graphify cache missing for pkg:github/you/your-app — build it to verify constructs and anchors',
    target: { kind: 'repo', id: 'pkg:github/you/your-app', label: 'pkg:github/you/your-app' },
  },
  ];

const graphComponents = components([
  ['entry', 'checkoutApi', 'function', 'src/checkout/api.ts', 'pkg:github/you/your-app', 'Handles cart requests.', 'checkoutApi'],
  ['store', 'cartStore', 'store', 'src/checkout/cartStore.ts', 'pkg:github/you/your-app', 'Retained cart state.', 'cartStore'],
  ['stripe', 'Stripe', 'external', '', 'external', undefined, undefined],
]);

const graphEdges = graphSpecFromSteps([
  ['entry', 'store', 'writes'],
  ['entry', 'stripe', 'calls'],
]);

/** The catalogue, grouped by verification layer. */
export const List: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', width: 380, height: '100vh', borderRight: '1px solid #333' }}>
      <SubsystemIssueList
        issues={ISSUES}
        onSelectIssue={() => {}}
        onApplyFix={() => {}}
      />
    </div>
  ),
};

/** All four layers clean — the happy state. */
export const AllGood: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', width: 380, height: '100vh', borderRight: '1px solid #333' }}>
      <SubsystemIssueList issues={[]} />
    </div>
  ),
};

/** In place: diagnostics active, so the sidebar bottom panel is the issue list. */
export const GraphWithIssues: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        components={graphComponents}
        trails={graphEdges.trails}
        title="Checkout"
        description="A small e-commerce checkout subsystem."
        diagnostic={{
          status: 'issues',
          issueCount: ISSUES.filter((i) => i.severity === 'error').length,
          onToggle: () => {},
        }}
        issues={ISSUES}
        onSelectIssue={() => {}}
        onApplyIssueFix={() => {}}
      />
    </div>
  ),
};

/** Trail step verification findings — unconfirmed and stale call sites. */
const TRAIL_STEP_ISSUES: SubsystemIssue[] = [
  {
    id: 'ts1',
    severity: 'info',
    kind: 'step_unconfirmed',
    message: 'Trail "Add to Cart" step 1: call site not verified (addToCart → cartStore via writes)',
    target: {
      kind: 'step',
      id: 'add-to-cart',
      label: 'Add to Cart',
      detail: 'step 1',
      stepIndex: 0,
    },
  },
  {
    id: 'ts2',
    severity: 'info',
    kind: 'step_unconfirmed',
    message: 'Trail "Add to Cart" step 2: call site not verified (cartStore → inventoryService via calls)',
    target: {
      kind: 'step',
      id: 'add-to-cart',
      label: 'Add to Cart',
      detail: 'step 2',
      stepIndex: 1,
    },
  },
  {
    id: 'ts3',
    severity: 'info',
    kind: 'step_stale',
    message: 'Trail "Checkout" step 1: call site changed since verification (lines 42-44 in src/checkout/api.ts)',
    target: {
      kind: 'step',
      id: 'checkout',
      label: 'Checkout',
      detail: 'step 1',
      stepIndex: 0,
    },
  },
  {
    id: 'ts4',
    severity: 'info',
    kind: 'step_stale',
    message: 'Trail "Checkout" step 3: call site changed since verification (lines 78-82 in src/checkout/api.ts)',
    target: {
      kind: 'step',
      id: 'checkout',
      label: 'Checkout',
      detail: 'step 3',
      stepIndex: 2,
    },
  },
];

/** Trail step verification: shows unconfirmed and stale call site findings. */
export const TrailStepVerification: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', width: 380, height: '100vh', borderRight: '1px solid #333' }}>
      <SubsystemIssueList
        issues={TRAIL_STEP_ISSUES}
        focusCategory="trail"
        onSelectIssue={() => {}}
      />
    </div>
  ),
};

/** Trail step verification badges on graph edges. */
const stepVerificationComponents = components([
  ['api', 'checkoutApi', 'function', 'src/checkout/api.ts', 'pkg:github/you/your-app', 'Handles cart requests.', 'checkoutApi'],
  ['store', 'cartStore', 'store', 'src/checkout/cartStore.ts', 'pkg:github/you/your-app', 'Retained cart state.', 'cartStore'],
  ['payment', 'PaymentService', 'class', 'src/payment/service.ts', 'pkg:github/you/your-app', 'Processes payments.', 'PaymentService'],
]);

const stepVerificationTrails = [
  {
    id: 'checkout-flow',
    title: 'Checkout',
    steps: [
      { from: 'api', to: 'store', mechanism: 'writes' as const },
      { from: 'store', to: 'payment', mechanism: 'calls' as const },
    ],
  },
];

const stepVerificationIssues: SubsystemIssue[] = [
  {
    id: 'sv1',
    severity: 'info',
    kind: 'step_unconfirmed',
    message: 'Trail "Checkout" step 1: call site not verified (checkoutApi → cartStore via writes)',
    target: {
      kind: 'step',
      id: 'checkout-flow',
      label: 'Checkout',
      detail: 'step 1',
      stepIndex: 0,
    },
  },
  {
    id: 'sv2',
    severity: 'info',
    kind: 'step_stale',
    message: 'Trail "Checkout" step 2: call site changed since verification (lines 42-44 in src/checkout/api.ts)',
    target: {
      kind: 'step',
      id: 'checkout-flow',
      label: 'Checkout',
      detail: 'step 2',
      stepIndex: 1,
    },
  },
];

/** Graph with trail step verification badges on edges — ? for unconfirmed, clock for stale. */
export const GraphWithStepVerificationBadges: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        components={stepVerificationComponents}
        trails={stepVerificationTrails}
        initialTrailId="checkout-flow"
        title="Checkout with Step Verification"
        description="Shows edge badges for step verification status: question mark (?) for unconfirmed call sites, clock for stale call sites."
        diagnostic={{
          status: 'issues',
          issueCount: stepVerificationIssues.length,
          onToggle: () => {},
        }}
        issues={stepVerificationIssues}
        showIssues
        onSelectIssue={() => {}}
        onApplyIssueFix={() => {}}
      />
    </div>
  ),
};

// ---------------------------------------------------------------------------
// C4 process verification — dynamic-topology findings from the element store
// ---------------------------------------------------------------------------

// Four deployment units, one per verification state. The agent scaffold
// proposed a container for each; the human has decided on three of them.
const PROCESS_OF: Record<string, string> = {
  main: 'studio/host',
  store: 'studio/host',
  view: 'studio/renderer',
  bridge: 'studio/renderer',
  worker: 'studio/worker',
  queue: 'studio/agent-queue',
};

const processComponents = [
  ...components([
    ['main', 'main', 'function', 'src/host/main.ts', 'pkg:github/acme/studio', 'boots the host', 'main'],
    ['store', 'SessionStore', 'store', 'src/host/store.ts', 'pkg:github/acme/studio', 'retained host state', 'SessionStore'],
    ['view', 'TrailView', 'function', 'src/renderer/view.tsx', 'pkg:github/acme/studio', 'renders the trail', 'TrailView'],
    ['bridge', 'bridge', 'function', 'src/renderer/bridge.ts', 'pkg:github/acme/studio', 'IPC bridge to the host', 'bridge'],
    ['worker', 'runWorker', 'function', 'src/worker/run.ts', 'pkg:github/acme/studio', 'runs the worker loop', 'runWorker'],
    ['queue', 'jobQueue', 'store', 'src/queue/jobs.ts', 'pkg:github/acme/studio', 'pending agent jobs', 'jobQueue'],
  ]).map((c) => {
    const process: string | undefined = PROCESS_OF[c.alias];
    return process ? { ...c, process } : c;
  }),
];

const processEdges = graphSpecFromSteps([
  ['main', 'store', 'writes'],
  ['main', 'bridge', 'calls'],
  ['bridge', 'view', 'feeds'],
  ['main', 'worker', 'calls'],
  ['worker', 'queue', 'writes'],
]);

// The rollup the verifying agent would read off the model: one region per
// distinct `process` value, members included.
const processRollup = getSubsystemRegions({ components: processComponents });

function verificationContainer(
  label: string,
  process: string,
  state: C4Container['state'],
): C4Container {
  return {
    id: `container:${process}`,
    kind: 'container',
    process,
    label,
    containerKind: 'application',
    technology: 'Bun',
    state,
  };
}

// Initial element store: three containers have been through review; the
// agent-queue boundary has none yet (unassigned — silence would mean verified).
const INITIAL_CONTAINERS: C4Container[] = [
  verificationContainer('Studio host', 'studio/host', 'accepted'),
  verificationContainer('Studio renderer', 'studio/renderer', 'proposed'),
  verificationContainer('Studio worker', 'studio/worker', 'rejected'),
];

/**
 * C4 process verification flowing through the diagnostics pipeline. Each
 * boundary that is not verified is a dynamic-topology finding — badged on the
 * process frame, listed in the sidebar, fixable in place. The cards' fixes
 * drive the (story-local) element store: proposing scaffolds an unclaimed
 * boundary, accepting lands the decision. Recomputed on every change —
 * verification is read, never stored.
 */
export const GraphWithProcessVerification: Story = {
  render: () => {
    const [containers, setContainers] = useState(INITIAL_CONTAINERS);
    const verification = verifyProcessBoundaries({
      rollup: processRollup,
      elements: containers,
    });
    const issues = verificationIssues(verification);
    const applyFix = (issue: SubsystemIssue) => {
      const key = issue.target?.id;
      if (!key) return;
      if (issue.kind === 'boundary_process_unassigned') {
        setContainers((prev) => [...prev, verificationContainer(key, key, 'proposed')]);
      } else if (issue.kind === 'boundary_process_proposed') {
        setContainers((prev) =>
          prev.map((c) => (c.process === key ? { ...c, state: 'accepted' as const } : c)),
        );
      }
    };
    return (
      <div style={{ width: '100%', height: '100vh' }}>
        <SubsystemComponentGraph
          title="Process verification"
          description="Each process boundary's C4 verification status flows through the diagnostics pipeline as a dynamic-topology finding: **unclaimed** (no container), **awaiting decision** (an agent scaffold), or **rejected** — one per boundary that is not verified, badged on the frame and listed in the sidebar. A verified boundary reports nothing: the audit reports absence only, and silence is the good state. The cards' fixes drive the element store — propose an unclaimed boundary, accept the proposed one — and the badge clears when the decision lands."
          components={processComponents}
          trails={processEdges.trails}
          issues={issues}
          onApplyIssueFix={applyFix}
        />
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// IssueOverlay — the diagnostics surface over a REAL subsystem graph
// ---------------------------------------------------------------------------
// The graph is the Maintain-run model stored at
//   ~/.principal/subsystem-models/sg-1789951509967-ppkvezdy0.json
// ("Maintain run — fire-and-forget RPC, wait for the finish event"): the
// renderer picker → host RPC → background runner → maintain orchestrator →
// opencode V2 session, plus the liveness-probe handshake. Its components and
// three trails are reproduced verbatim below; the topology is carried by the
// trails, exactly as stored.
//
// What these stories exercise: the graph's diagnostics surface over the real
// model — the title-row status chip, the grouped issue list, the per-node
// overlay (dotted border + earliest-rung chip, wired via `data.issue`), and
// layer-expand dimming. Clicking a card focuses its construct; collapsing it
// unfocuses.

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

/** The model's three runtime trails, verbatim (these carry the topology). */
const MAINTAIN_TRAILS: SubsystemTrail[] = [
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
 * (file → symbol → declaration → type → signature) plus the topology / trail
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
    severity: 'error',
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
    kind: 'trail',
    message:
      'Step 7 (terminal-matcher → session-runner) references a line that moved (was :469).',
    target: {
      kind: 'step',
      id: 'wt-wait-finish-event',
      // The host labels a step by its call-site symbol — the same row text
      // the trail UI shows — with the trail title as the detail line.
      label: 'matchFinishEvent',
      detail: 'Wait for the finish event',
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
          trails={MAINTAIN_TRAILS}
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
