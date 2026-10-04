import type { Meta, StoryObj } from "@storybook/react";
import type { SubsystemModelProposal } from "../../shared/contract";
import type { SubsystemComponent } from "@principal-ai/subsystems-react";
import { ProposalCard } from "./ProposalCard";

const GRAPH_ID = "sg-1788974222416-tvd82jthf";

/**
 * A construct augmentation that confirms a claim without touching the model.
 * This is the low-confidence case (Jev 0.79) — the card reads as "records a
 * confirmation", not "fixes the model".
 */
const constructAugment: SubsystemModelProposal = {
  id: "sp-4cca60b572bf",
  graphId: GRAPH_ID,
  runId: "60c84543-0f9a-45a6-80f9-f3879867ec98",
  status: "pending",
  createdAt: "2026-09-23T21:40:27.193Z",
  lane: "construct",
  rationale:
    "Source declares `const tabs = new Map<string, TabState>()` at `packages/subsystems-studio/src/bun/index.ts:687` — a module-level mutable registry of open tab state, mutated via `tabs.set/get/delete` and read via `tabs.values()`. The claimed construct `store` is correct; graphify left the label unclassified.",
  finding: {
    kind: "construct_unconfirmed",
    componentAlias: "tab-registry",
    componentName: "tabs",
    message:
      "Construct unclassified — claimed store; classify it from source. (unclassified label tabs)",
  },
  changes: [
    {
      target: "augmentation",
      componentAlias: "tab-registry",
      field: "construct",
      value: "store",
      lines: { start: 687, end: 687 },
    },
  ],
  preview: [
    {
      label:
        "augment tabs.construct (packages/subsystems-studio/src/bun/index.ts#tabs)",
      before: "not yet confirmed",
      after: "store",
    },
  ],
  author: "construct-verifier",
  secondOpinion: {
    source: "jev-latest",
    checkedAt: "2026-09-23T21:40:27.439Z",
    verdict: "uncertain",
    confidence: 0.79,
    changeKind: "construct_augment",
    risk: "Needs human",
  },
};

/** A signature augmentation — accepted as accurate, also model-unchanged. */
const signatureAugment: SubsystemModelProposal = {
  id: "sp-67c4c971ace8",
  graphId: GRAPH_ID,
  runId: "60c84543-0f9a-45a6-80f9-f3879867ec98",
  status: "pending",
  createdAt: "2026-09-23T21:39:58.000Z",
  lane: "construct",
  rationale:
    "Source declares `touchSubsystemModelOpened(id: string): Promise<void>` at `packages/subsystems-studio/src/bun/subsystem-model-store.ts:884-895`; the declared return type is `Promise<void>`. Graphify has no signature edges.",
  finding: {
    kind: "signature_unconfirmed",
    componentAlias: "open-stamp",
    componentName: "touchSubsystemModelOpened",
    message:
      "Signature not in cache — graphify has no parameter_type / return_type edges.",
  },
  changes: [
    {
      target: "augmentation",
      componentAlias: "open-stamp",
      field: "signature",
      value: {
        parameters: [{ name: "id", type: "string" }],
        returnType: "Promise<void>",
      },
      lines: { start: 884, end: 895 },
    },
  ],
  preview: [
    {
      label:
        "augment touchSubsystemModelOpened.signature (packages/subsystems-studio/src/bun/subsystem-model-store.ts#touchSubsystemModelOpened)",
      before: "not yet confirmed",
      after: "(id: string) => Promise<void>",
    },
  ],
  author: "construct-verifier",
  secondOpinion: {
    source: "jev-latest",
    checkedAt: "2026-09-23T21:39:58.400Z",
    verdict: "accurate",
    confidence: 0.97,
    changeKind: "signature_augment",
    risk: "Safe",
  },
};

/**
 * A component construct fix — this one DOES rewrite the model JSON, and its
 * before/after is a real field delta.
 */
const componentFix: SubsystemModelProposal = {
  id: "sp-1a2b3c4d5e6f",
  graphId: GRAPH_ID,
  status: "pending",
  createdAt: "2026-09-23T21:45:10.000Z",
  lane: "construct",
  rationale:
    "Source declares `class SessionReader` with method edges; the model claims `function`. Retarget the construct to `class`.",
  finding: {
    kind: "construct_mismatch",
    componentAlias: "store-read",
    componentName: "getSubsystemModel",
    message: "Claimed function; graphify infers class (outgoing method edges).",
  },
  changes: [
    {
      target: "component",
      componentAlias: "store-read",
      field: "construct",
      value: "class",
    },
  ],
  preview: [
    { label: "store-read.construct", before: "function", after: "class" },
  ],
  author: "construct-fixer",
  secondOpinion: {
    source: "jev-latest",
    checkedAt: "2026-09-23T21:45:10.500Z",
    verdict: "accurate",
    confidence: 0.96,
    changeKind: "construct_fix",
    risk: "Needs human",
  },
};

/** A multi-change proposal — the preview rows show their per-row labels. */
const multiChange: SubsystemModelProposal = {
  id: "sp-multi-0001",
  graphId: GRAPH_ID,
  status: "pending",
  createdAt: "2026-09-23T21:47:00.000Z",
  lane: "static-topology",
  rationale:
    "The package/module boundary drifted after the store split; retarget the component's module and process to match the declared package.",
  finding: {
    kind: "boundary_module_file_mismatch",
    componentAlias: "store-read",
    componentName: "getSubsystemModel",
    message: "Module boundary disagrees with the declared package.",
  },
  changes: [
    {
      target: "component",
      componentAlias: "store-read",
      field: "module",
      value: "subsystem-model-store",
    },
    {
      target: "component",
      componentAlias: "store-read",
      field: "process",
      value: "app/host",
    },
  ],
  preview: [
    { label: "store-read.module", before: "index", after: "subsystem-model-store" },
    { label: "store-read.process", before: "app", after: "app/host" },
  ],
  author: "package-module-fixer",
  secondOpinion: {
    source: "jev-latest",
    checkedAt: "2026-09-23T21:47:01.000Z",
    verdict: "inaccurate",
    confidence: 0.42,
    changeKind: "module_retarget",
    risk: "Needs human",
  },
};

/** No second opinion yet — the card offers "Get second opinion". */
const unscored: SubsystemModelProposal = {
  ...componentFix,
  id: "sp-unscored-01",
  secondOpinion: undefined,
};

/** Scored with the sent-request record present — the card can show what went to Jev. */
const scoredWithRequest: SubsystemModelProposal = {
  ...signatureAugment,
  id: "sp-request-0001",
  secondOpinion: {
    source: "jev-latest",
    checkedAt: "2026-09-27T05:04:24.099Z",
    verdict: "uncertain",
    confidence: 0.69,
    changeKind: "signature_augment",
    risk: "Needs human",
    request: {
      model: "jev-latest",
      state: [
        "Proposal rationale: Source declares `maintainSubsystemModel(graphId: string, opts?: {...})`",
        "Finding (signature_unconfirmed): claim the declared signature from source.",
        "Changes (1):",
        'augment maintainSubsystemModel.signature (maintain-model.ts#maintainSubsystemModel): "not yet confirmed" -> "(graphId: string, opts?) → Promise<MaintainModelResult>"',
        "",
        "Source under review:",
        "--- packages/subsystems-studio/src/bun/maintain-model.ts:1242 (symbol maintainSubsystemModel) ---",
        " 1242| export async function maintainSubsystemModel(",
        " 1243|   graphId: string,",
      ].join("\n"),
      questions: {
        accurate: {
          type: "noul",
          instructions:
            "The proposed signature is an accurate, complete extraction of the function/method declaration in the source under review.",
        },
        change_kind: {
          type: "choice",
          instructions: "What kind of construct correction is this?",
          criteria: { signature_augment: "Confirming parameter or return types" },
        },
        risk: {
          type: "score",
          instructions: "Risk of auto-accepting this correction",
          criteria: ["Safe", "Needs human", "Unsafe"],
        },
      },
    },
  },
};

/** Jev errored — the card surfaces the error and offers "Retry scoring". */
const scoringError: SubsystemModelProposal = {
  ...constructAugment,
  id: "sp-error-0001",
  secondOpinion: {
    source: "jev-latest",
    checkedAt: "2026-09-23T21:41:00.000Z",
    verdict: "uncertain",
    confidence: 0,
    error: "timeout after 30s",
  },
};

/** The model component a construct proposal previews beside the card. */
/**
 * A `c4-container` proposal — the reviewer sees the container rendered with
 * the same card the C4 graph uses, in its proposed state, beside the
 * before/after rows.
 */
const containerProposal: SubsystemModelProposal = {
  id: "sp-1a2b3c4d5e6f",
  graphId: GRAPH_ID,
  runId: "60c84543-0f9a-45a6-80f9-f3879867ec98",
  status: "pending",
  createdAt: "2026-10-04T18:12:00.000Z",
  lane: "dynamic-topology",
  rationale:
    "host and SessionStore run in one Bun process; the boundary is a deployable unit. Technology from the graphify bun signal.",
  finding: {
    kind: "boundary_process_unassigned",
    processKey: "subsystems-studio/host",
    message:
      "No C4 container claims the process boundary \"subsystems-studio/host\" yet.",
  },
  changes: [
    {
      target: "c4-container",
      purl: "pkg:github/principal-ai/subsystem-modeling",
      container: {
        id: "container:subsystems-studio/host",
        label: "Studio host",
        containerKind: "application",
        technology: "Bun",
        process: "subsystems-studio/host",
        description: "Boots the host and owns retained session state.",
      },
    },
  ],
  preview: [
    {
      label: "propose container subsystems-studio/host",
      before: "no container claims subsystems-studio/host",
      after: "application · Bun · verifies subsystems-studio/host",
    },
  ],
  author: "container-verifier",
  secondOpinion: {
    source: "jev-latest",
    checkedAt: "2026-10-04T18:12:00.500Z",
    verdict: "accurate",
    confidence: 0.86,
    changeKind: "c4_container_upsert",
    risk: "Needs human",
  },
};

const tabRegistryComponent: SubsystemComponent = {
  alias: "tab-registry",
  name: "tabs",
  construct: "store",
  file: "packages/subsystems-studio/src/bun/index.ts",
  purl: "pkg:github/principal-ai/subsystem-modeling",
  purpose: "Holds open tab states keyed by id.",
};

const meta = {
  title: "Proposals/ProposalCard",
  component: ProposalCard,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ width: "100%", maxWidth: 640 }}>
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    onAccept: () => {},
    onReject: () => {},
    onScore: () => {},
    onCopyForAgent: () => {},
  },
} satisfies Meta<typeof ProposalCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConstructAugmentationLowConfidence: Story = {
  args: { proposal: constructAugment, previewComponent: tabRegistryComponent },
};

export const SignatureAugmentationAccurate: Story = {
  args: { proposal: signatureAugment },
};

export const ComponentFixUpdatesModel: Story = {
  args: { proposal: componentFix },
};

export const ContainerProposal: Story = {
  args: { proposal: containerProposal },
};

export const MultiChange: Story = {
  args: { proposal: multiChange },
};

export const NotYetScored: Story = {
  args: { proposal: unscored },
};

export const ScoringError: Story = {
  args: { proposal: scoringError },
};

export const ScoredWithRequest: Story = {
  args: { proposal: scoredWithRequest },
};

export const AcceptingInFlight: Story = {
  args: { proposal: componentFix, action: "accept" },
};

export const RejectingInFlight: Story = {
  args: { proposal: componentFix, action: "reject" },
};

export const ScoringInFlight: Story = {
  args: { proposal: unscored, action: "scoring" },
};

export const CopiedForAgent: Story = {
  args: { proposal: scoringError, copied: true },
};
