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
    "The relation points at the wrong endpoint after the store split; retarget `from` and update the relation type to match the declared call.",
  finding: {
    kind: "topology_relation_unconfirmed",
    relationId: "rel-42",
    message: "Relation endpoints drifted from the declared call site.",
  },
  changes: [
    { target: "relation", relationId: "rel-42", field: "from", value: "store-read" },
    {
      target: "relation",
      relationId: "rel-42",
      field: "relationType",
      value: "reads",
    },
  ],
  preview: [
    { label: "rel-42.from", before: "session-reader", after: "store-read" },
    { label: "rel-42.relationType", before: "writes", after: "reads" },
  ],
  author: "static-topology-fixer",
  secondOpinion: {
    source: "jev-latest",
    checkedAt: "2026-09-23T21:47:01.000Z",
    verdict: "inaccurate",
    confidence: 0.42,
    changeKind: "relation_retarget",
    risk: "Needs human",
  },
};

/** No second opinion yet — the card offers "Get second opinion". */
const unscored: SubsystemModelProposal = {
  ...componentFix,
  id: "sp-unscored-01",
  secondOpinion: undefined,
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

export const MultiChange: Story = {
  args: { proposal: multiChange },
};

export const NotYetScored: Story = {
  args: { proposal: unscored },
};

export const ScoringError: Story = {
  args: { proposal: scoringError },
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
