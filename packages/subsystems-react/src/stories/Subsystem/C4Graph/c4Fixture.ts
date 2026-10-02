// GENERATED from live store data by generateFixture.ts — do not hand-edit.
//
// Composite of 40 stored subsystem models for pkg:github/principal-ai/subsystem-modeling,
// joined on purl#symbol (one canonical component per real declaration).
//
// Regenerate together with c4Associations.fixture.ts — the association set is
// keyed off the container keys this document derives. Generating them
// separately produces merges that silently do nothing.

import type { SubsystemModelDocument } from "../../../subsystem/model";

/** Container keys this document is expected to derive. */
export const c4DerivedKeys = [
  "(unassigned)",
  "packages/subsystems-studio/run",
  "principal-studio-cli",
  "principal-studio/host",
  "principal-studio/renderer",
  "site/web",
  "subsystems-core",
  "subsystems-core/types",
  "subsystems-react",
  "subsystems-react/session-ui",
  "subsystems-studio/host",
  "subsystems-studio/renderer",
  "subsystems-studio/shared"
] as const;

/** Components behind each derived key — decides which side of a merge survives. */
export const c4MemberCounts: Record<string, number> = {
  "(unassigned)": 17,
  "packages/subsystems-studio/run": 3,
  "principal-studio-cli": 1,
  "principal-studio/host": 1,
  "principal-studio/renderer": 19,
  "site/web": 3,
  "subsystems-core": 3,
  "subsystems-core/types": 3,
  "subsystems-react": 11,
  "subsystems-react/session-ui": 1,
  "subsystems-studio/host": 114,
  "subsystems-studio/renderer": 46,
  "subsystems-studio/shared": 2
};

export const c4FixtureModel: SubsystemModelDocument = {
 "components": [
  {
   "name": "auditSubsystemModel",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
   "symbol": "auditSubsystemModel",
   "purpose": "Runs the deterministic audit and returns findings plus per-component checks.",
   "process": "subsystems-studio/host",
   "alias": "c0"
  },
  {
   "name": "SubsystemModelView",
   "construct": "function",
   "role": "entry",
   "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
   "symbol": "SubsystemModelView",
   "purpose": "Loads the saved report and wires the graph: issues, diagnostic chip, and (planned) a verification ladder.",
   "process": "subsystems-studio/renderer",
   "alias": "c1"
  },
  {
   "name": "auditReportToIssues",
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/subsystemIssues.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/subsystemIssues.ts",
   "symbol": "auditReportToIssues",
   "purpose": "Maps report findings to presentation issues with resolved target labels.",
   "process": "subsystems-studio/renderer",
   "alias": "c2"
  },
  {
   "name": "auditReportToVerification",
   "construct": "function",
   "proposed": true,
   "file": "packages/subsystems-studio/src/mainview/subsystemIssues.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/subsystemIssues.ts",
   "symbol": "auditReportToVerification",
   "purpose": "Planned: maps per-component checks to the five-rung verification ladder (file to signature).",
   "process": "subsystems-studio/renderer",
   "alias": "c3"
  },
  {
   "name": "runSubsystemModelAuditFlow",
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/auditSubsystemModelFlow.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/auditSubsystemModelFlow.ts",
   "symbol": "runSubsystemModelAuditFlow",
   "purpose": "Ensures graphify caches, runs the audit, and drives the report modal.",
   "process": "subsystems-studio/renderer",
   "alias": "c4"
  },
  {
   "name": "SubsystemComponentGraph",
   "construct": "function",
   "framework": "react",
   "stereotype": "component",
   "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
   "symbol": "SubsystemComponentGraph",
   "purpose": "Renders the graph; injects per-node diagnostics and the sidebar list.",
   "process": "subsystems-studio/renderer",
   "alias": "c5"
  },
  {
   "name": "SubsystemComponentNode",
   "construct": "function",
   "framework": "react",
   "stereotype": "component",
   "file": "packages/subsystems-react/src/subsystem/nodes.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/nodes.tsx",
   "symbol": "SubsystemComponentNode",
   "purpose": "Renders a node: construct border, badges, verification bar, and hover issue badge.",
   "process": "subsystems-studio/renderer",
   "alias": "c6"
  },
  {
   "name": "SubsystemDiagnosticToggle",
   "construct": "function",
   "framework": "react",
   "stereotype": "component",
   "file": "packages/subsystems-react/src/subsystem/DiagnosticToggle.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/DiagnosticToggle.tsx",
   "symbol": "SubsystemDiagnosticToggle",
   "purpose": "Header chip: status color and the diagnostic-list toggle.",
   "process": "subsystems-studio/renderer",
   "alias": "c7"
  },
  {
   "name": "SubsystemIssueList",
   "construct": "function",
   "framework": "react",
   "stereotype": "component",
   "file": "packages/subsystems-react/src/subsystem/IssueList.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/IssueList.tsx",
   "symbol": "SubsystemIssueList",
   "purpose": "Sidebar diagnostics list, grouped by verification layer.",
   "process": "subsystems-studio/renderer",
   "alias": "c8"
  },
  {
   "name": "saveSubsystemModelAudit",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/audit-report-store.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/audit-report-store.ts",
   "symbol": "saveSubsystemModelAudit",
   "purpose": "Persists the dry-run report under ~/.principal/subsystem-model-audits.",
   "process": "subsystems-studio/host",
   "alias": "c9"
  },
  {
   "name": "loadSubsystemModelAudit",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/audit-report-store.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/audit-report-store.ts",
   "symbol": "loadSubsystemModelAudit",
   "purpose": "Loads the last saved report for a model.",
   "process": "subsystems-studio/host",
   "alias": "c10"
  },
  {
   "name": "SubsystemComponentGraph",
   "construct": "function",
   "symbol": "SubsystemComponentGraph",
   "role": "entry",
   "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
   "module": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react",
   "purpose": "Viewer entry — rebuilds the RF graph when the document changes.",
   "layer": 1,
   "alias": "c11"
  },
  {
   "name": "buildSubsystemGraph",
   "construct": "function",
   "symbol": "buildSubsystemGraph",
   "file": "packages/subsystems-react/src/subsystem/model.ts",
   "module": "packages/subsystems-react/src/subsystem/model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react",
   "purpose": "Orchestrates nodes, nested regions, ELK layout, and group shells.",
   "layer": 2,
   "alias": "c12"
  },
  {
   "name": "buildBoundaryLayoutGroups",
   "construct": "function",
   "symbol": "buildBoundaryLayoutGroups",
   "file": "packages/subsystems-react/src/subsystem/model.ts",
   "module": "packages/subsystems-react/src/subsystem/model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react",
   "purpose": "Builds process→module→leaf group defs with parentId nesting.",
   "layer": 3,
   "alias": "c13"
  },
  {
   "name": "convertSubsystemToNodes",
   "construct": "function",
   "symbol": "convertSubsystemToNodes",
   "file": "packages/subsystems-react/src/subsystem/model.ts",
   "module": "packages/subsystems-react/src/subsystem/model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react",
   "purpose": "Stamps leaf parentId — module wins over process when both are set.",
   "layer": 3,
   "alias": "c14"
  },
  {
   "name": "getSubsystemRegions",
   "construct": "function",
   "symbol": "getSubsystemRegions",
   "file": "packages/subsystems-react/src/subsystem/model.ts",
   "module": "packages/subsystems-react/src/subsystem/model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react",
   "purpose": "Collects process boundary regions.",
   "layer": 4,
   "alias": "c15"
  },
  {
   "name": "getSubsystemModuleRegions",
   "construct": "function",
   "symbol": "getSubsystemModuleRegions",
   "file": "packages/subsystems-react/src/subsystem/model.ts",
   "module": "packages/subsystems-react/src/subsystem/model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react",
   "purpose": "Collects module boundary regions.",
   "layer": 4,
   "alias": "c16"
  },
  {
   "name": "computeElkLayout",
   "construct": "function",
   "symbol": "computeElkLayout",
   "file": "packages/subsystems-react/src/utils/elkLayout.ts",
   "module": "packages/subsystems-react/src/utils/elkLayout.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react",
   "purpose": "Nested compound parents via groups[].parentId.",
   "layer": 3,
   "alias": "c17"
  },
  {
   "name": "SubsystemGroupNode",
   "construct": "function",
   "symbol": "SubsystemGroupNode",
   "framework": "react",
   "stereotype": "component",
   "file": "packages/subsystems-react/src/subsystem/nodes.tsx",
   "module": "packages/subsystems-react/src/subsystem/nodes.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react",
   "purpose": "Draws dashed process/module frames from region data.",
   "layer": 5,
   "alias": "c18"
  },
  {
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "module": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "name": "listSubsystemModels",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "purpose": "Reads the lightweight index of stored subsystem graphs.",
   "symbol": "listSubsystemModels",
   "alias": "c19"
  },
  {
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "module": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "name": "getSubsystemModel",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "purpose": "Loads one full stored graph including components with file and purl.",
   "symbol": "getSubsystemModel",
   "alias": "c20"
  },
  {
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "module": "packages/subsystems-studio/src/bun/index.ts",
   "name": "listSubsystemModels RPC handler",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "purpose": "Enriches index entries into list summaries with repos, graphify and audit.",
   "alias": "c21"
  },
  {
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
   "framework": "react",
   "module": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
   "name": "SubsystemModelsView",
   "process": "subsystems-studio/renderer",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
   "purpose": "Renders the Subsystems list tab from summary rows.",
   "stereotype": "component",
   "symbol": "SubsystemModelsView",
   "alias": "c22"
  },
  {
   "construct": "interface",
   "file": "packages/subsystems-studio/src/shared/contract.ts",
   "module": "packages/subsystems-studio/src/shared/contract.ts",
   "name": "SubsystemModelSummary",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/shared/contract.ts",
   "purpose": "Lists counts, repos and audit state without component files.",
   "symbol": "SubsystemModelSummary",
   "alias": "c23"
  },
  {
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/paths.ts",
   "module": "packages/subsystems-react/src/subsystem/paths.ts",
   "name": "buildRepoGroups",
   "process": "subsystems-studio/renderer",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/paths.ts",
   "purpose": "Groups component file and purl pairs by repo for per-repo trees.",
   "symbol": "buildRepoGroups",
   "alias": "c24"
  },
  {
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/SubsystemFileTree.tsx",
   "framework": "react",
   "module": "packages/subsystems-react/src/subsystem/SubsystemFileTree.tsx",
   "name": "SubsystemFileTree",
   "process": "subsystems-studio/renderer",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemFileTree.tsx",
   "purpose": "Renders one collapsible sidebar file tree from repo-root-relative paths.",
   "stereotype": "component",
   "symbol": "SubsystemFileTree",
   "alias": "c25"
  },
  {
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
   "framework": "react",
   "module": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
   "name": "SubsystemFilePanel",
   "process": "subsystems-studio/renderer",
   "proposed": true,
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
   "purpose": "Shows file trees for the selected subsystem on the left of the list.\nAlternative without per-selection fetch: add files to SubsystemModelSummary.",
   "stereotype": "component",
   "alias": "c26"
  },
  {
   "alias": "c27",
   "name": "FilesDrilldown",
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/components/FilesDrilldown.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/FilesDrilldown.tsx",
   "symbol": "FilesDrilldown",
   "process": "principal-studio/renderer",
   "layer": 1,
   "purpose": "Repo/file drilldown whose combined toggle flips the pane between the model list and the combined graph."
  },
  {
   "alias": "c28",
   "name": "ComposedGraphPane",
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/views/ComposedGraphPane.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/ComposedGraphPane.tsx",
   "symbol": "ComposedGraphPane",
   "process": "principal-studio/renderer",
   "layer": 1,
   "purpose": "Fetches the host-merged document for one repo, rolls it to frames, and renders the aggregate graph.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "repoKey",
      "type": "string"
     },
     {
      "name": "graphs",
      "type": "SubsystemModelSummary[]"
     },
     {
      "name": "modelIds",
      "type": "string[] | undefined"
     }
    ],
    "returnType": "JSX.Element"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c29",
   "name": "mergeSubsystemModels",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/merge-submodel-models.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/merge-submodel-models.ts",
   "symbol": "mergeSubsystemModels",
   "process": "subsystems-studio/host",
   "layer": 3,
   "purpose": "Rebases component aliases and merges model documents into one composed document plus a sidecar.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "models",
      "type": "MergeInputModel[]"
     }
    ],
    "returnType": "MergeResult"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c30",
   "name": "aggregateToFrames",
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/views/composedAggregate.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/composedAggregate.ts",
   "symbol": "aggregateToFrames",
   "process": "principal-studio/renderer",
   "layer": 2,
   "purpose": "Rolls a composed document up to process/module/external frame nodes with hub-routed flows."
  },
  {
   "alias": "c31",
   "name": "SubsystemAggregateGraph",
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/SubsystemAggregateGraph.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemAggregateGraph.tsx",
   "symbol": "SubsystemAggregateGraph",
   "framework": "react",
   "stereotype": "component",
   "process": "principal-studio/renderer",
   "layer": 2,
   "purpose": "Renders frame-level nodes and inter-boundary flows for the combined graph."
  },
  {
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/auditSubsystemModelFlow.ts",
   "layer": 2,
   "name": "graphifyTargets",
   "process": "subsystems-studio/renderer",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/auditSubsystemModelFlow.ts",
   "purpose": "Collects unique component purls that need a graphify cache.",
   "symbol": "graphifyTargets",
   "alias": "c32"
  },
  {
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/auditSubsystemModelFlow.ts",
   "layer": 2,
   "name": "waitForGraphifyEnsure",
   "process": "subsystems-studio/renderer",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/auditSubsystemModelFlow.ts",
   "purpose": "Subscribes to graphifyChanged pushes while a cache build runs.",
   "symbol": "waitForGraphifyEnsure",
   "alias": "c33"
  },
  {
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/graphify-store.ts",
   "layer": 3,
   "name": "ensureGraphifyGraph",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/graphify-store.ts",
   "purpose": "Ensures a graphify graph.json cache exists for a purl at HEAD.",
   "symbol": "ensureGraphifyGraph",
   "alias": "c34"
  },
  {
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "layer": 4,
   "name": "verifyModelFiles",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "purpose": "Checks files exist and symbols are declared for all components.",
   "symbol": "verifyModelFiles",
   "alias": "c35"
  },
  {
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
   "layer": 4,
   "name": "verifySubsystemComponent",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
   "purpose": "Verifies one component against disk plus the graphify anchor.",
   "symbol": "verifySubsystemComponent",
   "alias": "c36"
  },
  {
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "layer": 5,
   "name": "fileDeclaresSymbol",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "purpose": "Tests whether file contents declare a claimed symbol.",
   "symbol": "fileDeclaresSymbol",
   "alias": "c37"
  },
  {
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/components/AuditResultsModal.tsx",
   "layer": 2,
   "name": "AuditResultsModal",
   "process": "subsystems-studio/renderer",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/AuditResultsModal.tsx",
   "purpose": "Shows graphify progress then audit checks and findings.",
   "symbol": "AuditResultsModal",
   "alias": "c38"
  },
  {
   "name": "createRegularAuditScheduler",
   "construct": "function",
   "role": "entry",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/regular-audit.ts",
   "file": "packages/subsystems-studio/src/bun/regular-audit.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/regular-audit.ts",
   "symbol": "createRegularAuditScheduler",
   "layer": 3,
   "purpose": "Runs the dry-run audit over every stored model on a timeout chain while Studio is open.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "deps",
      "type": "RegularAuditDeps"
     }
    ],
    "returnType": "RegularAuditScheduler"
   },
   "declarationProvenance": "authored",
   "alias": "c39"
  },
  {
   "name": "reauditSubsystemModelQuietly",
   "construct": "function",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/index.ts",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "symbol": "reauditSubsystemModelQuietly",
   "layer": 4,
   "purpose": "Quietly re-audits one model and broadcasts that its audit changed.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "graphId",
      "type": "string"
     }
    ],
    "returnType": "Promise<void>"
   },
   "declarationProvenance": "authored",
   "alias": "c40"
  },
  {
   "name": "broadcastRegularAuditChanged",
   "construct": "function",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/index.ts",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "symbol": "broadcastRegularAuditChanged",
   "layer": 4,
   "purpose": "Pushes the scheduler's live status to the renderer over RPC.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "payload",
      "type": "StudioMessages[\"regularAuditChanged\"]"
     }
    ],
    "returnType": "void"
   },
   "declarationProvenance": "authored",
   "alias": "c41"
  },
  {
   "name": "regularAuditChangeSubscribers",
   "construct": "store",
   "process": "subsystems-studio/renderer",
   "module": "packages/subsystems-studio/src/mainview/rpc.ts",
   "file": "packages/subsystems-studio/src/mainview/rpc.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/rpc.ts",
   "symbol": "regularAuditChangeSubscribers",
   "layer": 2,
   "purpose": "Holds renderer callbacks registered for regular-audit status pushes.",
   "alias": "c42"
  },
  {
   "name": "createSubsystemModel",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "module": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "symbol": "createSubsystemModel",
   "purpose": "Orchestrates — create/update runs the write-time pass before persisting (update does the same).",
   "process": "subsystems-studio/host",
   "alias": "c43"
  },
  {
   "name": "resolveRepoRootForComponent",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "module": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "symbol": "resolveRepoRootForComponent",
   "purpose": "Deterministic — purl to local repo root; a null root is reported unresolved.",
   "process": "subsystems-studio/host",
   "alias": "c44"
  },
  {
   "name": "auditTopologyRelations",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/topology-audit.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/topology-audit.ts",
   "symbol": "auditTopologyRelations",
   "purpose": "Orchestrates — relations[] endpoints (deterministic) plus soft corroboration (heuristic).",
   "process": "subsystems-studio/host",
   "alias": "c45"
  },
  {
   "name": "auditBoundaryFields",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/boundary-audit.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/boundary-audit.ts",
   "symbol": "auditBoundaryFields",
   "purpose": "Orchestrates — module/file membership and process nesting.",
   "process": "subsystems-studio/host",
   "alias": "c46"
  },
  {
   "name": "resolveComponentAnchor",
   "construct": "function",
   "file": "packages/subsystems-react/src/graphify/anchor.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/graphify/anchor.ts",
   "symbol": "resolveComponentAnchor",
   "purpose": "Deterministic given graphify (coarse) — file+symbol to node: exact, file-only, ambiguous, or missing.",
   "process": "subsystems-studio/host",
   "alias": "c47"
  },
  {
   "name": "moduleAgreesWithFile",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/boundary-audit.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/boundary-audit.ts",
   "symbol": "moduleAgreesWithFile",
   "purpose": "Heuristic — module equals the file or is a directory prefix; gap (info) when it is not.",
   "process": "subsystems-studio/host",
   "alias": "c48"
  },
  {
   "name": "compareSignatures",
   "construct": "function",
   "file": "packages/subsystems-react/src/graphify/signature.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/graphify/signature.ts",
   "symbol": "compareSignatures",
   "purpose": "Heuristic — authored named type bags vs graphify type edges; skips primitives; unconfirmed when edges are thin.",
   "process": "subsystems-studio/host",
   "alias": "c49"
  },
  {
   "name": "inferConstructFromGraphify",
   "construct": "function",
   "file": "packages/subsystems-react/src/graphify/construct.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/graphify/construct.ts",
   "symbol": "inferConstructFromGraphify",
   "purpose": "Heuristic — infers the construct kind from graphify structure; cannot resolve interface/type_alias/enum to unknown.",
   "process": "subsystems-studio/host",
   "alias": "c50"
  },
  {
   "name": "constructsMatch",
   "construct": "function",
   "file": "packages/subsystems-react/src/graphify/construct.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/graphify/construct.ts",
   "symbol": "constructsMatch",
   "purpose": "Deterministic — compares the claimed construct against the inferred one (error on mismatch).",
   "process": "subsystems-studio/host",
   "alias": "c51"
  },
  {
   "name": "graphifyHasRelationBetween",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/topology-audit.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/topology-audit.ts",
   "symbol": "graphifyHasRelationBetween",
   "purpose": "Heuristic — soft corroboration that graphify has the relation; absence is unconfirmed (info).",
   "process": "subsystems-studio/host",
   "alias": "c52"
  },
  {
   "name": "graphifyHasRelationTowardHints",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/topology-audit.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/topology-audit.ts",
   "symbol": "graphifyHasRelationTowardHints",
   "purpose": "Heuristic — soft label match toward an unanchored/external target; absence is unconfirmed.",
   "process": "subsystems-studio/host",
   "alias": "c53"
  },
  {
   "name": "renderStaticView",
   "construct": "function",
   "role": "entry",
   "file": "packages/subsystems-studio/src/mainview/App.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/App.tsx",
   "symbol": "renderStaticView",
   "purpose": "Mount Maintenance Sessions as AgentSessionsOverviewView with scope maintain.",
   "process": "subsystems-studio/renderer",
   "layer": 0,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "tabId",
      "type": "string"
     },
     {
      "name": "active",
      "type": "boolean"
     }
    ],
    "returnType": "ReactNode | null"
   },
   "declarationProvenance": "authored",
   "alias": "c54"
  },
  {
   "name": "AgentSessionsOverviewView",
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/views/AgentSessions.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/AgentSessions.tsx",
   "symbol": "AgentSessionsOverviewView",
   "purpose": "List and render Maintain sessions in the File City agent panel when scope is maintain.",
   "process": "subsystems-studio/renderer",
   "layer": 1,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "active",
      "type": "boolean"
     },
     {
      "name": "scope",
      "type": "\"agents\" | \"maintain\""
     }
    ],
    "returnType": "JSX.Element"
   },
   "declarationProvenance": "authored",
   "alias": "c55"
  },
  {
   "name": "buildAgentSessionsView",
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/views/AgentSessions.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/AgentSessions.tsx",
   "symbol": "buildAgentSessionsView",
   "purpose": "Turn processed SessionEventRow timelines into panel AgentSessionView rows.",
   "process": "subsystems-studio/renderer",
   "layer": 2,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "opts",
      "type": "object"
     }
    ],
    "returnType": "AgentSessionsView | null"
   },
   "declarationProvenance": "authored",
   "alias": "c56"
  },
  {
   "name": "listMaintainSessions",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/maintain-sessions.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-sessions.ts",
   "symbol": "listMaintainSessions",
   "purpose": "Discover Maintain runs from session_v2 (and legacy session) by agent or Maintain title.",
   "process": "subsystems-studio/host",
   "layer": 2,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "opts",
      "type": "{ days?: number; limit?: number }"
     }
    ],
    "returnType": "Promise<{ sessions: SessionSummary[]; hasMore: boolean }>"
   },
   "declarationProvenance": "authored",
   "alias": "c57"
  },
  {
   "name": "getAgentSessionsOverview",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "symbol": "getAgentSessionsOverview",
   "purpose": "Host RPC that lists Maintain sessions then processes each id into a timeline snapshot.",
   "process": "subsystems-studio/host",
   "layer": 2,
   "declarationProvenance": "authored",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "days",
      "type": "number?"
     },
     {
      "name": "scope",
      "type": "\"agents\" | \"maintain\"?"
     }
    ],
    "returnType": "Promise<OverviewResponse>"
   },
   "alias": "c58"
  },
  {
   "name": "processSessionEvents",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/session-pipeline.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/session-pipeline.ts",
   "symbol": "processSessionEvents",
   "purpose": "Load a session timeline from the legacy event table and normalize it for the panel.",
   "process": "subsystems-studio/host",
   "layer": 3,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "sessionId",
      "type": "string"
     },
     {
      "name": "opts",
      "type": "{ includeRaw?: boolean; useCache?: boolean }"
     }
    ],
    "returnType": "Promise<BuiltSessionEvents>"
   },
   "declarationProvenance": "authored",
   "alias": "c59"
  },
  {
   "name": "runOpencodeV2AgentSession",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2-live.ts",
   "symbol": "runOpencodeV2AgentSession",
   "purpose": "Create and prompt a Maintain session on the running opencode2 HTTP service.",
   "process": "subsystems-studio/host",
   "layer": 1,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "opts",
      "type": "RunOpencodeV2AgentSessionOpts"
     }
    ],
    "returnType": "Promise<{ ok: boolean; sessionId?: string }>"
   },
   "declarationProvenance": "authored",
   "alias": "c60"
  },
  {
   "name": "resolveOpencodeSessionKind",
   "construct": "function",
   "proposed": true,
   "file": "packages/subsystems-studio/src/bun/opencode-v2-messages.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2-messages.ts",
   "symbol": "resolveOpencodeSessionKind",
   "purpose": "Classify an OpenCode id as v2 (session_v2 row) or v1 (session row) before choosing a transcript reader.",
   "process": "subsystems-studio/host",
   "layer": 2,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "sessionId",
      "type": "string"
     }
    ],
    "returnType": "\"v2\" | \"v1\" | null"
   },
   "declarationProvenance": "authored",
   "alias": "c61"
  },
  {
   "name": "opencodeRowsToUniversalEvents",
   "construct": "function",
   "file": "packages/subsystems-core/src/opencode/pipeline.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-core/src/opencode/pipeline.ts",
   "symbol": "opencodeRowsToUniversalEvents",
   "purpose": "Map legacy OpenCode event table rows into UniversalAgentSessionEvent.",
   "process": "subsystems-studio/host",
   "layer": 3,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "rows",
      "type": "OpencodeEventRow[]"
     }
    ],
    "returnType": "UniversalAgentSessionEvent[]"
   },
   "declarationProvenance": "authored",
   "alias": "c62"
  },
  {
   "name": "sessionMessagesToUniversalEvents",
   "construct": "function",
   "proposed": true,
   "file": "packages/subsystems-studio/src/bun/opencode-v2-messages.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2-messages.ts",
   "symbol": "sessionMessagesToUniversalEvents",
   "purpose": "Map V2 session_message user/assistant parts into UniversalAgentSessionEvent.",
   "process": "subsystems-studio/host",
   "layer": 3,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "sessionId",
      "type": "string"
     },
     {
      "name": "messages",
      "type": "SessionMessageRow[]"
     }
    ],
    "returnType": "UniversalAgentSessionEvent[]"
   },
   "declarationProvenance": "authored",
   "alias": "c63"
  },
  {
   "name": "accumulateEvents",
   "construct": "function",
   "file": "packages/subsystems-core/src/opencode/pipeline.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-core/src/opencode/pipeline.ts",
   "symbol": "accumulateEvents",
   "purpose": "Turn normalized universal events into panel AgentSessionEvent timeline rows.",
   "process": "subsystems-studio/host",
   "layer": 4,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "normalized",
      "type": "RepoNormalizedUniversalAgentSessionEvent[]"
     },
     {
      "name": "sessionTitle",
      "type": "string"
     }
    ],
    "returnType": "AccumulatedEntry[]"
   },
   "declarationProvenance": "authored",
   "alias": "c64"
  },
  {
   "alias": "c65",
   "name": "resolveComponentPackageKeys",
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/packageKeys.ts",
   "module": "packages/subsystems-react/src/subsystem/packageKeys.ts",
   "process": "principal-studio/renderer",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/packageKeys.ts",
   "symbol": "resolveComponentPackageKeys",
   "purpose": "Proposed: return a component → workspace-package map for a model using the cached PackageLayer list.",
   "proposed": true,
   "layer": 1
  },
  {
   "alias": "c66",
   "name": "buildSubsystemGraph",
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/model.ts",
   "module": "packages/subsystems-react/src/subsystem/model.ts",
   "process": "principal-studio/renderer",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
   "symbol": "buildSubsystemGraph",
   "purpose": "Builds React Flow nodes, edges, and the boundary frame tree for a model.",
   "layer": 1
  },
  {
   "alias": "c67",
   "name": "buildBoundaryLayoutGroups",
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/model.ts",
   "module": "packages/subsystems-react/src/subsystem/model.ts",
   "process": "principal-studio/renderer",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
   "symbol": "buildBoundaryLayoutGroups",
   "purpose": "Builds the package → process → module → leaf frame tree for ELK.",
   "layer": 2
  },
  {
   "alias": "c68",
   "name": "BoundaryFrameOptions",
   "construct": "interface",
   "file": "packages/subsystems-react/src/subsystem/model.ts",
   "module": "packages/subsystems-react/src/subsystem/model.ts",
   "process": "principal-studio/renderer",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
   "symbol": "BoundaryFrameOptions",
   "purpose": "Options that gate which boundary frames are drawn; would carry the package-key map.",
   "layer": 2
  },
  {
   "alias": "c69",
   "name": "scopeProcessMembersToPackage",
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/model.ts",
   "module": "packages/subsystems-react/src/subsystem/model.ts",
   "process": "principal-studio/renderer",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
   "symbol": "scopeProcessMembersToPackage",
   "purpose": "Proposed: keep a process frame to its own package's members so consumed libraries sit outside it.",
   "proposed": true,
   "layer": 2
  },
  {
   "alias": "c70",
   "name": "getSubsystemPackageRegions",
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/model.ts",
   "module": "packages/subsystems-react/src/subsystem/model.ts",
   "process": "principal-studio/renderer",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
   "symbol": "getSubsystemPackageRegions",
   "purpose": "Derives one package region per distinct package identity.",
   "layer": 3
  },
  {
   "alias": "c71",
   "name": "componentPackageKey",
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/model.ts",
   "module": "packages/subsystems-react/src/subsystem/model.ts",
   "process": "principal-studio/renderer",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
   "symbol": "componentPackageKey",
   "purpose": "Resolves the package key for one component; today it only reads the purl repo key.",
   "layer": 3
  },
  {
   "alias": "c72",
   "name": "ensureCurrentPackageCachesForModel",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/package-layer-store.ts",
   "module": "packages/subsystems-studio/src/bun/package-layer-store.ts",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/package-layer-store.ts",
   "symbol": "ensureCurrentPackageCachesForModel",
   "purpose": "Ensures current HEAD(+dirty) package layers exist for every model purl.",
   "layer": 0
  },
  {
   "alias": "c73",
   "name": "getCachedPackageLayers",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/package-layer-store.ts",
   "module": "packages/subsystems-studio/src/bun/package-layer-store.ts",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/package-layer-store.ts",
   "symbol": "getCachedPackageLayers",
   "purpose": "Reads the cached package-layer slot and metadata for a repo purl.",
   "layer": 1
  },
  {
   "alias": "c74",
   "name": "readEnsuredPackageLayers",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/package-layer-store.ts",
   "module": "packages/subsystems-studio/src/bun/package-layer-store.ts",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/package-layer-store.ts",
   "symbol": "readEnsuredPackageLayers",
   "purpose": "Loads the packages.json slice, a PackageLayer list plus summary, for matching.",
   "layer": 2
  },
  {
   "alias": "c75",
   "name": "PackageLayersReposView",
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/views/PackageLayersReposView.tsx",
   "module": "packages/subsystems-studio/src/mainview/views/PackageLayersReposView.tsx",
   "process": "principal-studio/renderer",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/PackageLayersReposView.tsx",
   "symbol": "PackageLayersReposView",
   "purpose": "Package Layers tab; its Ensure action is what builds a repo's package layers.",
   "layer": 0
  },
  {
   "alias": "c76",
   "name": "ensurePackageLayers",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/package-layer-store.ts",
   "module": "packages/subsystems-studio/src/bun/package-layer-store.ts",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/package-layer-store.ts",
   "symbol": "ensurePackageLayers",
   "purpose": "Builds and caches package layers for one purl at the current HEAD(+dirty).",
   "layer": 2
  },
  {
   "alias": "c77",
   "name": "runPackageLayerDiscover",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/package-layer-runner.ts",
   "module": "packages/subsystems-studio/src/bun/package-layer-runner.ts",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/package-layer-runner.ts",
   "symbol": "runPackageLayerDiscover",
   "purpose": "Walks package manifests and produces PackageLayer[] for a checkout.",
   "layer": 3
  },
  {
   "alias": "c78",
   "name": "dirtyFingerprint",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/graphify-store.ts",
   "module": "packages/subsystems-studio/src/bun/graphify-store.ts",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/graphify-store.ts",
   "symbol": "dirtyFingerprint",
   "purpose": "Hashes the whole working tree (HEAD diff plus untracked contents) for cache-slot identity.",
   "layer": 1
  },
  {
   "alias": "c79",
   "name": "cacheSlotKey",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/graphify-store.ts",
   "module": "packages/subsystems-studio/src/bun/graphify-store.ts",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/graphify-store.ts",
   "symbol": "cacheSlotKey",
   "purpose": "Slot folder name: headSha, or headSha+dirtyHash when the tree is dirty.",
   "layer": 1
  },
  {
   "alias": "c80",
   "name": "fingerprintPackageManifests",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/package-layer-store.ts",
   "module": "packages/subsystems-studio/src/bun/package-layer-store.ts",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/package-layer-store.ts",
   "symbol": "fingerprintPackageManifests",
   "purpose": "Proposed: hash only the manifests and lockfiles discovery reads, plus a discovery-logic version, so a rebuild happens only when the package set can change.",
   "proposed": true,
   "layer": 1
  },
  {
   "alias": "c81",
   "name": "ensurePackageLayersOnModelOpen",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/package-layer-store.ts",
   "module": "packages/subsystems-studio/src/bun/package-layer-store.ts",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/package-layer-store.ts",
   "symbol": "ensurePackageLayersOnModelOpen",
   "purpose": "Proposed: ensure layers at the point of use (model open, audit); a cache hit is a no-op.",
   "proposed": true,
   "layer": 1
  },
  {
   "name": "Gist",
   "construct": "function",
   "role": "entry",
   "file": "site/src/pages/Gist.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#site/src/pages/Gist.tsx",
   "symbol": "Gist",
   "purpose": "Consumer surface: open a public gist URL and render the portable model.",
   "process": "site/web",
   "layer": 0,
   "alias": "c82"
  },
  {
   "name": "loadSubsystemModelFromGist",
   "construct": "function",
   "file": "site/src/lib/gist.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#site/src/lib/gist.ts",
   "symbol": "loadSubsystemModelFromGist",
   "purpose": "Fetch and parse a public gist into a portable document (site viewer today).",
   "process": "site/web",
   "layer": 1,
   "alias": "c83"
  },
  {
   "name": "toPortableDocument",
   "construct": "function",
   "file": "site/src/lib/gist.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#site/src/lib/gist.ts",
   "symbol": "toPortableDocument",
   "purpose": "Keep only shareable fields — what a gist file must contain.",
   "process": "site/web",
   "layer": 2,
   "alias": "c84"
  },
  {
   "name": "isSubsystemModelDocument",
   "construct": "function",
   "file": "packages/subsystems-core/src/types/subsystem-model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-core/src/types/subsystem-model.ts",
   "symbol": "isSubsystemModelDocument",
   "purpose": "Shallow-guard title + components[] + edges[].",
   "process": "subsystems-core/types",
   "layer": 2,
   "alias": "c85"
  },
  {
   "name": "SubsystemModelDocument",
   "construct": "interface",
   "file": "packages/subsystems-core/src/types/subsystem-model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-core/src/types/subsystem-model.ts",
   "symbol": "SubsystemModelDocument",
   "purpose": "Shareable standard — no host paths, store ids, or gist provenance.",
   "process": "subsystems-core/types",
   "layer": 3,
   "alias": "c86"
  },
  {
   "name": "SubsystemModelHydrated",
   "construct": "interface",
   "file": "packages/subsystems-core/src/types/subsystem-model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-core/src/types/subsystem-model.ts",
   "symbol": "SubsystemModelHydrated",
   "purpose": "Machine envelope layered onto a portable document for local Studio use.",
   "process": "subsystems-core/types",
   "layer": 3,
   "alias": "c87"
  },
  {
   "name": "createAction",
   "construct": "function",
   "role": "entry",
   "file": "packages/principal-studio-cli/src/commands/subsystem-model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/principal-studio-cli/src/commands/subsystem-model.ts",
   "symbol": "createAction",
   "purpose": "Author path: validate payload and persist a new local sg- id.",
   "process": "principal-studio-cli",
   "layer": 0,
   "alias": "c88"
  },
  {
   "name": "updateSubsystemModel",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "symbol": "updateSubsystemModel",
   "purpose": "Patch a local record in place — used to stamp or refresh the host gist ref.",
   "process": "subsystems-studio/host",
   "layer": 1,
   "alias": "c89"
  },
  {
   "name": "indexEntryFor",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "symbol": "indexEntryFor",
   "purpose": "Build the lightweight listing row written into _index.json.",
   "process": "subsystems-studio/host",
   "layer": 2,
   "alias": "c90"
  },
  {
   "name": "openSubsystemModelTab",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "symbol": "openSubsystemModelTab",
   "purpose": "Focus or create a subsystem-model tab for a stored sg- id.",
   "process": "subsystems-studio/host",
   "layer": 1,
   "alias": "c91"
  },
  {
   "name": "handleSubsystemModelRequest",
   "construct": "function",
   "role": "entry",
   "file": "packages/subsystems-studio/src/bun/http-server.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/http-server.ts",
   "symbol": "handleSubsystemModelRequest",
   "purpose": "Accepts PUT /api/subsystem-model/:id and patches the stored graph.",
   "process": "subsystems-studio/host",
   "layer": 1,
   "alias": "c92"
  },
  {
   "name": "emitSubsystemModelChange",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "symbol": "emitSubsystemModelChange",
   "purpose": "Fan a graphId change into the registered host listener.",
   "process": "subsystems-studio/host",
   "layer": 2,
   "alias": "c93"
  },
  {
   "name": "broadcastSubsystemModelChanged",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "symbol": "broadcastSubsystemModelChanged",
   "purpose": "Push subsystemModelChanged to the renderer over Electrobun RPC.",
   "process": "subsystems-studio/host",
   "layer": 3,
   "alias": "c94"
  },
  {
   "name": "subsystemModelChangeSubscribers",
   "construct": "store",
   "file": "packages/subsystems-studio/src/mainview/rpc.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/rpc.ts",
   "symbol": "subsystemModelChangeSubscribers",
   "purpose": "Retained Set of renderer callbacks for subsystemModelChanged pushes.",
   "process": "subsystems-studio/renderer",
   "layer": 4,
   "alias": "c95"
  },
  {
   "name": "Inner",
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
   "symbol": "Inner",
   "purpose": "Owns two-pass ELK layout and layoutReady.\nLanded: after Pass 1, kick Pass 2 from built — do not wait on remount.",
   "process": "subsystems-react",
   "layer": 6,
   "alias": "c96"
  },
  {
   "name": "subsystemGraphLayoutKey",
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
   "symbol": "subsystemGraphLayoutKey",
   "purpose": "Hash layout-affecting fields so Pass 1 re-runs on content updates.",
   "process": "subsystems-react",
   "layer": 6,
   "alias": "c97"
  },
  {
   "name": "measuredDimsRef",
   "construct": "store",
   "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
   "symbol": "measuredDimsRef",
   "purpose": "Leaf node width/height bag.\nLanded: prune stale ids on Pass 1; do not wipe the whole Map.",
   "process": "subsystems-react",
   "layer": 7,
   "declaration": {
    "kind": "store",
    "properties": [
     {
      "name": "current",
      "type": "Map<string, { width: number; height: number }>"
     }
    ]
   },
   "declarationProvenance": "authored",
   "alias": "c98"
  },
  {
   "name": "baseNodesKey",
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
   "symbol": "baseNodesKey",
   "purpose": "Remount ReactFlow only when node/edge id sets change.\nKeep id-only — do not key on layoutKey (async Pass 1 race).",
   "process": "subsystems-react",
   "layer": 7,
   "alias": "c99"
  },
  {
   "name": "triggerPass2",
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
   "symbol": "triggerPass2",
   "purpose": "Sets layoutReady true after measured ELK.\nLanded: also invoked from a built effect after Pass 1, not only dimensions.",
   "process": "subsystems-react",
   "layer": 7,
   "alias": "c100"
  },
  {
   "name": "GraphLayoutCover",
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/GraphLayoutCover.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/GraphLayoutCover.tsx",
   "symbol": "GraphLayoutCover",
   "purpose": "Shows Laying out graph until revealed flips true, then fades out.",
   "process": "subsystems-react",
   "layer": 8,
   "alias": "c101"
  },
  {
   "alias": "c102",
   "construct": "store",
   "file": "packages/subsystems-studio/src/mainview/rpc.ts",
   "layer": 2,
   "module": "packages/subsystems-studio/src/mainview/rpc.ts",
   "name": "electrobun",
   "process": "subsystems-studio/renderer",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/rpc.ts",
   "purpose": "Owns the renderer RPC bridge with a 30s request timeout.",
   "symbol": "electrobun"
  },
  {
   "alias": "c103",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/audit-report-store.ts",
   "layer": 3,
   "module": "packages/subsystems-studio/src/bun/audit-report-store.ts",
   "name": "getSubsystemModelAuditListSummary",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/audit-report-store.ts",
   "purpose": "Loads the saved audit report summary for list badges.",
   "symbol": "getSubsystemModelAuditListSummary"
  },
  {
   "alias": "c104",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/proposal-store.ts",
   "layer": 3,
   "module": "packages/subsystems-studio/src/bun/proposal-store.ts",
   "name": "pendingProposalCount",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/proposal-store.ts",
   "purpose": "Counts pending agent proposals for one graph.",
   "symbol": "pendingProposalCount"
  },
  {
   "alias": "c105",
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/ui.tsx",
   "framework": "react",
   "layer": 2,
   "module": "packages/subsystems-studio/src/mainview/ui.tsx",
   "name": "CenteredMessage",
   "process": "subsystems-studio/renderer",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/ui.tsx",
   "purpose": "Renders the empty-state error panel for the tab.",
   "stereotype": "component",
   "symbol": "CenteredMessage"
  },
  {
   "name": "SubsystemComponent",
   "construct": "interface",
   "role": "entry",
   "file": "packages/subsystems-core/src/types/subsystem-model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-core/src/types/subsystem-model.ts",
   "symbol": "SubsystemComponent",
   "purpose": "Own the portable schema contract, including authored declaration shape and provenance.",
   "process": "subsystems-core",
   "layer": 1,
   "declaration": {
    "kind": "type",
    "properties": [
     {
      "name": "declaration",
      "type": "SubsystemConstructDeclaration?"
     },
     {
      "name": "declarationProvenance",
      "type": "SubsystemDeclarationProvenance?"
     },
     {
      "name": "declarationRef",
      "type": "SubsystemDeclarationRef?"
     }
    ]
   },
   "declarationProvenance": "authored",
   "alias": "c106",
   "declarationRef": {
    "file": "packages/subsystems-core/src/types/subsystem-model.ts",
    "startLine": 271,
    "lineHash": "89717fb6c214f8a650fdfa3fe89d617d",
    "capturedAt": "2026-10-02T03:21:57.501Z",
    "graphifyNodeId": "packages_subsystems_core_src_types_subsystem_model_subsystemcomponent"
   }
  },
  {
   "name": "SubsystemConstructDeclaration",
   "construct": "type_alias",
   "file": "packages/subsystems-core/src/types/subsystem-model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-core/src/types/subsystem-model.ts",
   "symbol": "SubsystemConstructDeclaration",
   "purpose": "Discriminated declaration union (params, members, type buckets) that agents and the CLI are told to author.",
   "process": "subsystems-core",
   "layer": 1,
   "declaration": {
    "kind": "type",
    "unionOf": [
     "SubsystemClassDeclaration",
     "SubsystemFunctionDeclaration",
     "SubsystemMethodDeclaration",
     "SubsystemTypeDeclaration",
     "SubsystemModuleDeclaration",
     "SubsystemExternalDeclaration",
     "SubsystemStoreDeclaration",
     "SubsystemCustomEntityDeclaration"
    ],
    "properties": []
   },
   "declarationProvenance": "authored",
   "alias": "c107",
   "declarationRef": {
    "file": "packages/subsystems-core/src/types/subsystem-model.ts",
    "startLine": 261,
    "lineHash": "ffe942627983745a8ae31e55497cf40f",
    "capturedAt": "2026-10-02T03:22:01.942Z",
    "graphifyNodeId": "packages_subsystems_core_src_types_subsystem_model_subsystemconstructdeclaration"
   }
  },
  {
   "name": "SubsystemComponent",
   "construct": "interface",
   "file": "packages/subsystems-react/src/subsystem/model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
   "symbol": "SubsystemComponent",
   "purpose": "Mirror the node in the react package, still carrying the vestigial detail drill-down fields the renderer consumes.",
   "process": "subsystems-react",
   "layer": 2,
   "declaration": {
    "kind": "type",
    "properties": [
     {
      "name": "detail",
      "type": "GraphifyComponentDetail?"
     },
     {
      "name": "detailProvenance",
      "type": "'verified' | 'authored'?"
     },
     {
      "name": "tokens",
      "type": "SubsystemDeclToken[]?"
     },
     {
      "name": "declarationRef",
      "type": "SubsystemDeclarationRef?"
     }
    ]
   },
   "declarationProvenance": "authored",
   "alias": "c108",
   "declarationRef": {
    "file": "packages/subsystems-react/src/subsystem/model.ts",
    "startLine": 204,
    "lineHash": "89717fb6c214f8a650fdfa3fe89d617d",
    "capturedAt": "2026-10-02T03:21:59.958Z",
    "graphifyNodeId": "packages_subsystems_react_src_subsystem_model_subsystemcomponent"
   }
  },
  {
   "name": "GraphifyComponentDetail",
   "construct": "type_alias",
   "file": "packages/subsystems-react/src/graphify/consolidated.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/graphify/consolidated.ts",
   "symbol": "GraphifyComponentDetail",
   "purpose": "Parallel kind-discriminated payload that covers the same ground as schema declaration inside the react/graphify layer.",
   "process": "subsystems-react",
   "layer": 2,
   "declaration": {
    "kind": "type",
    "unionOf": [
     "GraphifyClassDetail",
     "GraphifyFunctionDetail",
     "GraphifyMethodDetail",
     "GraphifyTypeDetail",
     "GraphifyModuleDetail",
     "GraphifyExternalDetail",
     "GraphifyCustomEntityDetail",
     "GraphifyStoreDetail"
    ],
    "properties": []
   },
   "declarationProvenance": "authored",
   "alias": "c109",
   "declarationRef": {
    "file": "packages/subsystems-react/src/graphify/consolidated.ts",
    "startLine": 280,
    "lineHash": "8d20e9c18babf3f9e9f388a1c45406e8",
    "capturedAt": "2026-10-02T03:21:43.662Z",
    "graphifyNodeId": "packages_subsystems_react_src_graphify_consolidated_graphifycomponentdetail"
   }
  },
  {
   "name": "normalizeDeclarationProvenance",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "symbol": "normalizeDeclarationProvenance",
   "purpose": "Backfill detail provenance and per-kind arrays so the store stays synced with the vestigial detail schema.",
   "process": "subsystems-studio/host",
   "layer": 2,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "components",
      "type": "unknown"
     }
    ],
    "returnType": "void"
   },
   "declarationProvenance": "authored",
   "alias": "c110",
   "declarationRef": {
    "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
    "startLine": 384,
    "lineHash": "91dfc7372a4b08967f7bfd43deb845f2",
    "capturedAt": "2026-10-02T03:21:53.207Z",
    "graphifyNodeId": "packages_subsystems_studio_src_bun_subsystem_model_store_normalizedeclarationprovenance"
   }
  },
  {
   "name": "buildDetailFromAdoptedSignature",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
   "symbol": "buildDeclarationFromAdoptedSignature",
   "purpose": "Map graphify verified parameter and return bags into a detail payload during audit adopt-signature fixes.",
   "process": "subsystems-studio/host",
   "layer": 2,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "component",
      "type": "SubsystemComponent"
     },
     {
      "name": "parameterTypes",
      "type": "string[]"
     },
     {
      "name": "returnTypes",
      "type": "string[]"
     }
    ],
    "returnType": "NonNullable<SubsystemComponent['detail']>"
   },
   "declarationProvenance": "authored",
   "alias": "c111",
   "declarationRef": {
    "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
    "startLine": 147,
    "lineHash": "93724709149f0af6d649931227b74186",
    "capturedAt": "2026-10-02T03:21:27.012Z",
    "graphifyNodeId": "packages_subsystems_studio_src_bun_verify_subsystem_component_builddeclarationfromadoptedsignature"
   }
  },
  {
   "name": "generateDeclarationString",
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/formatDeclaration.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/formatDeclaration.ts",
   "symbol": "generateDeclarationString",
   "purpose": "Turn the click-panel source string from component.detail only — missing detail yields construct defaults like type X = unknown.",
   "process": "subsystems-react",
   "layer": 3,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "component",
      "type": "SubsystemComponent"
     }
    ],
    "returnType": "string"
   },
   "declarationProvenance": "authored",
   "alias": "c112",
   "declarationRef": {
    "file": "packages/subsystems-react/src/subsystem/formatDeclaration.ts",
    "startLine": 52,
    "lineHash": "ecad06378cd3ce0c922aa385c4b69313",
    "capturedAt": "2026-10-02T03:21:31.359Z",
    "graphifyNodeId": "packages_subsystems_react_src_subsystem_formatdeclaration_generatedeclarationstring"
   }
  },
  {
   "name": "tokenizeComponent",
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/tokenizeComponent.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/tokenizeComponent.ts",
   "symbol": "tokenizeComponent",
   "purpose": "Prefer wire tokens, otherwise generate, Prettier-format, and tokenize the declaration string for the panel.",
   "process": "subsystems-react",
   "layer": 3,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "component",
      "type": "SubsystemComponent"
     },
     {
      "name": "printWidth",
      "type": "number"
     },
     {
      "name": "themeName",
      "type": "PierreSyntaxThemeName"
     }
    ],
    "returnType": "Promise<SubsystemDeclToken[]>"
   },
   "declarationProvenance": "authored",
   "alias": "c113"
  },
  {
   "name": "ComponentDeclaration",
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/ComponentDeclaration.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/ComponentDeclaration.tsx",
   "symbol": "ComponentDeclaration",
   "purpose": "Render the click panel by tokenizing the selected component and painting declaration lines.",
   "process": "subsystems-react",
   "layer": 4,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "props",
      "type": "ComponentDeclarationProps"
     }
    ],
    "returnType": "JSX.Element"
   },
   "declarationProvenance": "authored",
   "alias": "c114"
  },
  {
   "name": "MaintainModelPickerModal",
   "construct": "function",
   "role": "entry",
   "file": "packages/subsystems-studio/src/mainview/components/MaintainModelPickerModal.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/MaintainModelPickerModal.tsx",
   "symbol": "MaintainModelPickerModal",
   "purpose": "Lets the user pick a free OpenCode model and start a Maintain run over Electrobun RPC.",
   "process": "subsystems-studio/renderer",
   "layer": 0,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "graphId",
      "type": "string"
     },
     {
      "name": "mode",
      "type": "\"issues\" | \"gaps\""
     },
     {
      "name": "onStarted",
      "type": "(info) => void"
     }
    ],
    "returnType": "JSX.Element"
   },
   "declarationProvenance": "authored",
   "alias": "c115"
  },
  {
   "name": "maintainSubsystemModelInBackground",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "symbol": "maintainSubsystemModelInBackground",
   "purpose": "Returns immediately from RPC, tracks in-flight graphs, and broadcasts Maintain lifecycle to the renderer.",
   "process": "subsystems-studio/host",
   "layer": 1,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "graphId",
      "type": "string"
     },
     {
      "name": "opts",
      "type": "{ model?: string }"
     }
    ],
    "returnType": "void"
   },
   "declarationProvenance": "authored",
   "alias": "c116"
  },
  {
   "name": "maintainSubsystemModel",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
   "symbol": "maintainSubsystemModel",
   "purpose": "Ensures OpenCode V2 runtime and Maintain agents, audits the model, routes by verdict, builds the brief, then runs the chosen agent.",
   "process": "subsystems-studio/host",
   "layer": 2,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "graphId",
      "type": "string"
     },
     {
      "name": "opts",
      "type": "{ model?: string }"
     }
    ],
    "returnType": "Promise<MaintainModelResult>"
   },
   "declarationProvenance": "authored",
   "alias": "c117"
  },
  {
   "name": "runMaintainAgent",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
   "symbol": "runMaintainAgent",
   "purpose": "After Studio has ensured the V2 runtime, create/prompt a session and subscribe to SSE. Today this still spawns opencode run.",
   "process": "subsystems-studio/host",
   "layer": 3,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "agent",
      "type": "MaintainAgentId"
     },
     {
      "name": "task",
      "type": "string"
     },
     {
      "name": "model",
      "type": "string"
     }
    ],
    "returnType": "Promise<{ ok: boolean; summary?: string; error?: string }>"
   },
   "declarationProvenance": "authored",
   "alias": "c118"
  },
  {
   "name": "createSubsystemModelProposal",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/proposal-store.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/proposal-store.ts",
   "symbol": "createSubsystemModelProposal",
   "purpose": "Persists a pending human-confirmable proposal with rationale, changes, and preview.",
   "process": "subsystems-studio/host",
   "layer": 4,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "input",
      "type": "{ graphId; rationale; changes; author? }"
     }
    ],
    "returnType": "Promise<{ ok: true; proposal } | { ok: false; error }>"
   },
   "declarationProvenance": "authored",
   "alias": "c119"
  },
  {
   "name": "resolveOpencode2Bin",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/opencode-v2.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2.ts",
   "symbol": "resolveOpencode2Bin",
   "purpose": "Resolve the opencode2 binary from OPENCODE2_BIN, PATH, or ~/.opencode/bin.",
   "process": "subsystems-studio/host",
   "layer": 3,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "bin",
      "type": "string?"
     }
    ],
    "returnType": "string | null"
   },
   "declarationProvenance": "authored",
   "alias": "c120"
  },
  {
   "name": "OpencodeV2DebugView",
   "construct": "function",
   "role": "entry",
   "file": "packages/subsystems-studio/src/mainview/views/OpencodeV2DebugView.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/OpencodeV2DebugView.tsx",
   "symbol": "OpencodeV2DebugView",
   "purpose": "Debug tab that shows whether opencode2 is installed and can install or update the beta CLI.",
   "process": "subsystems-studio/renderer",
   "layer": 0,
   "declaration": {
    "kind": "function",
    "parameters": [],
    "returnType": "JSX.Element"
   },
   "declarationProvenance": "authored",
   "alias": "c121"
  },
  {
   "name": "getOpencodeV2Status",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/opencode-v2.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2.ts",
   "symbol": "getOpencodeV2Status",
   "purpose": "Detect whether opencode2 is on PATH or under OPENCODE2_BIN and report install metadata.",
   "process": "subsystems-studio/host",
   "layer": 3,
   "declaration": {
    "kind": "function",
    "parameters": [],
    "returnType": "OpencodeV2Status"
   },
   "declarationProvenance": "authored",
   "alias": "c122"
  },
  {
   "name": "installOpencodeV2",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/opencode-v2.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2.ts",
   "symbol": "installOpencodeV2",
   "purpose": "Install @opencode-ai/cli@beta globally when opencode2 is missing.",
   "process": "subsystems-studio/host",
   "layer": 3,
   "declaration": {
    "kind": "function",
    "parameters": [],
    "returnType": "Promise<InstallOpencodeV2Result>"
   },
   "declarationProvenance": "authored",
   "alias": "c123"
  },
  {
   "name": "StudioMessageSubscriber",
   "construct": "type_alias",
   "proposed": true,
   "file": "packages/subsystems-studio/src/mainview/rpc.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/rpc.ts",
   "symbol": "StudioMessageSubscriber",
   "purpose": "Parametrized callback contract — (payload: StudioMessages[K]) => void — that every subscriber Set instantiates. Migration preview: extracting the inline Set generics into this named alias so the contract is a verifiable type_alias instead of store claims.",
   "process": "subsystems-studio/renderer",
   "layer": 1,
   "declarationProvenance": "authored",
   "declaration": {
    "kind": "type",
    "properties": []
   },
   "alias": "c124"
  },
  {
   "name": "closeTabById",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "symbol": "closeTabById",
   "purpose": "Host choke point every close path funnels through: refuses permanent tabs, deletes the tab record, re-picks a fallback suggestion, and re-broadcasts the strip.",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/index.ts",
   "layer": 1,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "id",
      "type": "string"
     }
    ],
    "returnType": "{ ok: boolean; error?: string }"
   },
   "declarationProvenance": "authored",
   "alias": "c125"
  },
  {
   "name": "isPermanentTabId",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "symbol": "isPermanentTabId",
   "purpose": "True for the fixed tabs (Trails, Subsystems, Agent Sessions, …) so a close can never dismiss them.",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/index.ts",
   "layer": 2,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "id",
      "type": "string"
     }
    ],
    "returnType": "boolean"
   },
   "declarationProvenance": "authored",
   "alias": "c126"
  },
  {
   "name": "tabs",
   "construct": "store",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "symbol": "tabs",
   "purpose": "Module-scope map of open tab id → tab state; the single list listTabs serves and every view renders from.",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/index.ts",
   "layer": 1,
   "alias": "c127"
  },
  {
   "name": "broadcastTabsChanged",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "symbol": "broadcastTabsChanged",
   "purpose": "Sends the tabsChanged notification (with an optional focus hint) to the renderer over RPC.",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/index.ts",
   "layer": 2,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "focusTabId",
      "type": "string"
     }
    ],
    "returnType": "void"
   },
   "declarationProvenance": "authored",
   "alias": "c128"
  },
  {
   "name": "App",
   "construct": "function",
   "framework": "react",
   "stereotype": "component",
   "role": "entry",
   "file": "packages/subsystems-studio/src/mainview/App.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/App.tsx",
   "symbol": "App",
   "purpose": "Renderer shell; owns the tab list and active tab and re-runs listTabs whenever the host broadcasts a change.",
   "process": "subsystems-studio/renderer",
   "module": "packages/subsystems-studio/src/mainview/App.tsx",
   "layer": 0,
   "alias": "c129"
  },
  {
   "name": "TabStrip",
   "construct": "function",
   "framework": "react",
   "stereotype": "component",
   "file": "packages/subsystems-studio/src/mainview/components/TabStrip.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/TabStrip.tsx",
   "symbol": "TabStrip",
   "purpose": "Draws the tab row and each non-permanent tab's × close affordance.",
   "process": "subsystems-studio/renderer",
   "module": "packages/subsystems-studio/src/mainview/components/TabStrip.tsx",
   "layer": 1,
   "alias": "c130",
   "declarationRef": {
    "file": "packages/subsystems-studio/src/mainview/components/TabStrip.tsx",
    "startLine": 44,
    "lineHash": "270390e15a89a55e0a55f3a520097642",
    "capturedAt": "2026-10-02T03:40:29.438Z",
    "graphifyNodeId": "packages_subsystems_studio_src_mainview_components_tabstrip_tabstrip"
   }
  },
  {
   "name": "reloadSubscribers",
   "construct": "store",
   "file": "packages/subsystems-studio/src/mainview/rpc.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/rpc.ts",
   "symbol": "reloadSubscribers",
   "purpose": "Set of tab-refresh callbacks; the tabsChanged handler invokes each so the shell re-fetches its list.",
   "process": "subsystems-studio/renderer",
   "module": "packages/subsystems-studio/src/mainview/rpc.ts",
   "layer": 2,
   "alias": "c131"
  },
  {
   "name": "StudioRequests",
   "construct": "type_alias",
   "file": "packages/subsystems-studio/src/shared/contract.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/shared/contract.ts",
   "symbol": "StudioRequests",
   "purpose": "Renderer→host request contract; declares listTabs, getTab, setActiveTab, and closeTab.",
   "process": "subsystems-studio/shared",
   "module": "packages/subsystems-studio/src/shared/contract.ts",
   "layer": 3,
   "alias": "c132"
  },
  {
   "name": "StudioMessages",
   "construct": "type_alias",
   "file": "packages/subsystems-studio/src/shared/contract.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/shared/contract.ts",
   "symbol": "StudioMessages",
   "purpose": "Host→renderer notification contract; declares the tabsChanged message the strip refresh rides on.",
   "process": "subsystems-studio/shared",
   "module": "packages/subsystems-studio/src/shared/contract.ts",
   "layer": 3,
   "alias": "c133"
  },
  {
   "alias": "c134",
   "name": "maintainSubsystemModel RPC",
   "construct": "function",
   "role": "entry",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/index.ts",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "purpose": "Fire-and-forget RPC: returns started:true and hands off to the background runner."
  },
  {
   "alias": "c135",
   "name": "ensureServiceRunning",
   "construct": "function",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
   "file": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2-live.ts",
   "symbol": "ensureServiceRunning",
   "purpose": "Starts the opencode2 service when the daemon is not healthy."
  },
  {
   "alias": "c136",
   "name": "readSse",
   "construct": "function",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
   "file": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2-live.ts",
   "symbol": "readSse",
   "purpose": "Streams /api/event once and routes raw events into the wait loop."
  },
  {
   "alias": "c137",
   "name": "isTerminalEvent",
   "construct": "function",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
   "file": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2-live.ts",
   "symbol": "isTerminalEvent",
   "purpose": "True when an event ends the session (execution finished/succeeded/failed or session idle)."
  },
  {
   "alias": "c138",
   "name": "OpencodeLiveFeedState store",
   "construct": "store",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
   "file": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2-live.ts",
   "symbol": "feeds",
   "purpose": "Retains per-session live status (starting/running/done/error) pushed to the renderer.",
   "declaration": {
    "kind": "store",
    "storage": "memory",
    "properties": [
     {
      "name": "feeds",
      "type": "Map<string, OpencodeLiveFeedState>"
     },
     {
      "name": "feedListeners",
      "type": "Set<FeedListener>"
     },
     {
      "name": "feedPublishTimers",
      "type": "Map<string, ReturnType<typeof setTimeout>>"
     }
    ]
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c139",
   "name": "MaintainerProbeRegistry",
   "construct": "store",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/maintainer-probe.ts",
   "file": "packages/subsystems-studio/src/bun/maintainer-probe.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintainer-probe.ts",
   "symbol": "shared",
   "purpose": "Records when a maintain run's liveness probe lands.",
   "declaration": {
    "kind": "store",
    "storage": "memory",
    "properties": [
     {
      "name": "landed",
      "type": "Map<string, number>"
     }
    ]
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c140",
   "name": "POST /api/maintainer/probe",
   "construct": "function",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/http-server.ts",
   "file": "packages/subsystems-studio/src/bun/http-server.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/http-server.ts",
   "purpose": "Liveness endpoint the agent's first tool call curls; proves the model can run tools headless."
  },
  {
   "alias": "c141",
   "name": "openMaintainLive",
   "construct": "function",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/index.ts",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "symbol": "openMaintainLive",
   "purpose": "Focuses a model's graph tab and opens (or retargets) its collapsible live Maintain events panel for a session."
  },
  {
   "name": "boundaryGroupNodeId",
   "construct": "function",
   "symbol": "boundaryGroupNodeId",
   "file": "packages/subsystems-react/src/subsystem/model.ts",
   "module": "packages/subsystems-react/src/subsystem/model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react",
   "purpose": "Maps a region to process:… or module:… RF/ELK group id.",
   "layer": 4,
   "alias": "c142"
  },
  {
   "name": "moduleGroupNodeId",
   "construct": "function",
   "symbol": "moduleGroupNodeId",
   "file": "packages/subsystems-react/src/subsystem/model.ts",
   "module": "packages/subsystems-react/src/subsystem/model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react",
   "purpose": "Stable RF id for a module frame.",
   "layer": 4,
   "alias": "c143"
  },
  {
   "name": "processGroupNodeId",
   "construct": "function",
   "symbol": "processGroupNodeId",
   "file": "packages/subsystems-react/src/subsystem/model.ts",
   "module": "packages/subsystems-react/src/subsystem/model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react",
   "purpose": "Stable RF id for a process frame.",
   "layer": 4,
   "alias": "c144"
  },
  {
   "name": "SubsystemProcessRegion",
   "construct": "interface",
   "symbol": "SubsystemProcessRegion",
   "file": "packages/subsystems-react/src/subsystem/model.ts",
   "module": "packages/subsystems-react/src/subsystem/model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react",
   "purpose": "Boundary region payload — kind process|module plus memberIds.",
   "layer": 4,
   "declaration": {
    "kind": "type",
    "properties": [
     {
      "name": "kind",
      "type": "'process' | 'module'"
     },
     {
      "name": "key",
      "type": "string"
     },
     {
      "name": "label",
      "type": "string"
     },
     {
      "name": "memberIds",
      "type": "string[]"
     }
    ]
   },
   "declarationProvenance": "authored",
   "alias": "c145"
  },
  {
   "name": "nestCompoundGroups",
   "construct": "function",
   "symbol": "nestCompoundGroups",
   "proposed": true,
   "file": "packages/subsystems-react/src/utils/elkLayout.ts",
   "module": "packages/subsystems-react/src/utils/elkLayout.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react",
   "purpose": "Proposed — build process→module→leaf ELK children and recursive groupBounds.",
   "layer": 3,
   "alias": "c146"
  },
  {
   "alias": "c147",
   "name": "buildMaintainBrief",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
   "symbol": "buildMaintainBrief",
   "purpose": "Builds the brief sent to the agent, including the propose curl and the migrate/session context. Stamping seam A: embed the runId here so it rides with the brief and the curl.",
   "process": "packages/subsystems-studio/run",
   "module": "packages/subsystems-studio/src/bun/maintain-model.ts",
   "layer": 4
  },
  {
   "alias": "c148",
   "name": "SubsystemModelRunStore",
   "construct": "store",
   "file": "packages/subsystems-studio/src/bun/subsystem-model-runs.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-runs.ts",
   "symbol": "noteSubsystemModelRunStart",
   "purpose": "Persists runs keyed by graphId (~/.principal/subsystem-model-runs/<graphId>.json). Records sessionId <-> graphId pairing and pendingCount snapshot. Stamping seam C: add runId field here and backfill proposalIds on finish.",
   "process": "packages/subsystems-studio/run",
   "module": "packages/subsystems-studio/src/bun/subsystem-model-runs.ts",
   "layer": 5
  },
  {
   "alias": "c149",
   "name": "proposeSubsystemModelCorrection",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "symbol": "proposeSubsystemModelCorrection",
   "purpose": "RPC handler the agent hits to submit a proposed correction. Seam B caller: forward runId from the HTTP body -> RPC -> store.",
   "process": "packages/subsystems-studio/run",
   "module": "packages/subsystems-studio/src/bun/index.ts",
   "layer": 4
  },
  {
   "alias": "c150",
   "name": "Propose HTTP route",
   "construct": "custom_entity",
   "file": "packages/subsystems-studio/src/bun/http-server.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/http-server.ts",
   "symbol": "POST /api/subsystem-model/:id/proposals",
   "purpose": "HTTP endpoint (line ~399) that parses the propose curl body then calls proposeSubsystemModelCorrection. Seam B entry: parse an optional runId field off the body.",
   "process": "packages/subsystems-studio/run",
   "module": "packages/subsystems-studio/src/bun/http-server.ts",
   "layer": 6
  },
  {
   "name": "FileDrawer",
   "construct": "function",
   "framework": "react",
   "stereotype": "component",
   "file": "packages/subsystems-react/src/subsystem/FileDrawer.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/FileDrawer.tsx",
   "symbol": "FileDrawer",
   "purpose": "Bottom panel that animates open and hosts the injected file or walkthrough viewer.",
   "process": "principal-studio/renderer",
   "alias": "c151"
  },
  {
   "name": "PierreFileView",
   "construct": "function",
   "framework": "react",
   "stereotype": "component",
   "file": "packages/subsystems-react/src/pierre/PierreFileView.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/pierre/PierreFileView.tsx",
   "symbol": "PierreFileView",
   "purpose": "Fetches a full file and renders it through Pierre once the highlighter is warm.",
   "process": "principal-studio/renderer",
   "alias": "c152"
  },
  {
   "name": "PierreSnippetView",
   "construct": "function",
   "framework": "react",
   "stereotype": "component",
   "file": "packages/subsystems-react/src/pierre/PierreSnippetView.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/pierre/PierreSnippetView.tsx",
   "symbol": "PierreSnippetView",
   "purpose": "Renders a focused line-range snippet with context for declaration links.",
   "process": "principal-studio/renderer",
   "alias": "c153"
  },
  {
   "name": "readFile",
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
   "symbol": "readFile",
   "purpose": "RPC closure that fetches repo-relative file content for the graph.",
   "process": "principal-studio/renderer",
   "module": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
   "alias": "c154"
  },
  {
   "name": "resolveSandboxed",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/sandboxed-path.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/sandboxed-path.ts",
   "symbol": "resolveSandboxed",
   "purpose": "Resolves a repo-relative path under the graph's root and rejects traversal.",
   "process": "principal-studio/host",
   "alias": "c155"
  },
  {
   "alias": "c156",
   "name": "WalkthroughFlow",
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/WalkthroughsPanel.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/WalkthroughsPanel.tsx",
   "symbol": "WalkthroughFlow",
   "purpose": "One collapsible walkthrough row: a header (title, play, close, drag grip) above its ordered step list.",
   "process": "subsystems-studio/renderer",
   "module": "packages/subsystems-react/src/subsystem/WalkthroughsPanel.tsx"
  },
  {
   "alias": "c157",
   "name": "WalkthroughsPanel",
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/WalkthroughsPanel.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/WalkthroughsPanel.tsx",
   "symbol": "WalkthroughsPanel",
   "purpose": "Extracted flows panel: renders the ordered walkthrough rows, forwards focus/hover events, and owns the inline drag-to-reorder controller.",
   "process": "subsystems-studio/renderer",
   "module": "packages/subsystems-react/src/subsystem/WalkthroughsPanel.tsx"
  },
  {
   "alias": "c158",
   "name": "reorder controller",
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/WalkthroughsPanel.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/WalkthroughsPanel.tsx",
   "purpose": "Inline drag controller in WalkthroughsPanel: tracks the dragged row and insertion boundary, draws the landing line, and suppresses stale hover after a drop.",
   "process": "subsystems-studio/renderer",
   "module": "packages/subsystems-react/src/subsystem/WalkthroughsPanel.tsx"
  },
  {
   "alias": "c159",
   "name": "reorderWalkthroughs",
   "construct": "function",
   "file": "packages/subsystems-react/src/subsystem/model.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
   "symbol": "reorderWalkthroughs",
   "purpose": "Pure helper that returns a new walkthroughs array with the dragged item moved to the drop index; reorderTargetIndex maps a boundary to that index.",
   "process": "subsystems-studio/renderer",
   "module": "packages/subsystems-react/src/subsystem/model.ts"
  },
  {
   "alias": "c160",
   "name": "updateSubsystemModel RPC",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "purpose": "Renderer-to-host request that forwards a walkthroughs patch to the store and returns the updated record.",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/index.ts"
  },
  {
   "alias": "c161",
   "construct": "function",
   "file": "packages/subsystems-react/src/pierre/PierreTrailCodeView.tsx",
   "framework": "react",
   "layer": 2,
   "module": "packages/subsystems-react/src/pierre/PierreTrailCodeView.tsx",
   "name": "PierreTrailCodeView",
   "process": "subsystems-studio/renderer",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/pierre/PierreTrailCodeView.tsx",
   "purpose": "Loads every walkthrough step file by bare path for the code view.",
   "stereotype": "component",
   "symbol": "PierreTrailCodeView"
  },
  {
   "alias": "c162",
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/rpc.ts",
   "layer": 2,
   "module": "packages/subsystems-studio/src/mainview/rpc.ts",
   "name": "callReadFile",
   "process": "subsystems-studio/renderer",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/rpc.ts",
   "purpose": "Forwards tab-scoped bare-path file reads to the host.",
   "symbol": "callReadFile"
  },
  {
   "alias": "c163",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "layer": 3,
   "module": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "name": "purlRepoKey",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "purpose": "Strips a purl to its repo key for checkout lookup.",
   "symbol": "purlRepoKey"
  },
  {
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "layer": 3,
   "name": "touchSubsystemModelOpened",
   "process": "subsystems-studio/host",
   "purpose": "Stamps lastOpenedAt with rewrite suppress window.",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "symbol": "touchSubsystemModelOpened",
   "alias": "c164"
  },
  {
   "construct": "function",
   "file": "packages/subsystems-react/src/utils/elkLayout.ts",
   "layer": 5,
   "name": "computeElkLayout",
   "process": "subsystems-studio/renderer",
   "purpose": "Computes orthogonal ELK layout on the main thread.",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/utils/elkLayout.ts",
   "symbol": "computeElkLayout",
   "alias": "c165"
  },
  {
   "name": "findSubsystemModelProblems",
   "construct": "function",
   "role": "entry",
   "file": "packages/subsystems-studio/src/bun/subsystem-model-validation.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-validation.ts",
   "symbol": "findSubsystemModelProblems",
   "purpose": "Rejects a create/update payload before anything is stored.",
   "process": "subsystems-studio/host",
   "layer": 1,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "input",
      "type": "Record<string, unknown>"
     }
    ],
    "returnType": "string[]"
   },
   "declarationProvenance": "authored",
   "alias": "c166"
  },
  {
   "name": "validateSubsystemModelCrossField",
   "construct": "function",
   "file": "packages/subsystems-core/src/validation.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-core/src/validation.ts",
   "symbol": "validateSubsystemModelCrossField",
   "purpose": "Checks the rules the JSON schema cannot express (unique ids, endpoint refs, module implies file).",
   "process": "subsystems-core",
   "layer": 2,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "doc",
      "type": "SubsystemModelDocument"
     }
    ],
    "returnType": "SubsystemValidationProblem[]"
   },
   "declarationProvenance": "authored",
   "alias": "c167"
  },
  {
   "name": "registerSuppliedRoots",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/http-server.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/http-server.ts",
   "symbol": "registerSuppliedRoots",
   "purpose": "Learns roots shipped with a payload into Alexandria instead of storing them.",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/http-server.ts",
   "layer": 2,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "body",
      "type": "Record<string, unknown>"
     }
    ],
    "returnType": "void"
   },
   "declarationProvenance": "authored",
   "alias": "c168"
  },
  {
   "name": "registerProjectInAlexandria",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/alexandria.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/alexandria.ts",
   "symbol": "registerProjectInAlexandria",
   "purpose": "Records a repo path and remote in the Alexandria registry, idempotently.",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/alexandria.ts",
   "layer": 3,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "gitRoot",
      "type": "string"
     },
     {
      "name": "remoteUrl",
      "type": "string"
     }
    ],
    "returnType": "void"
   },
   "declarationProvenance": "authored",
   "alias": "c169"
  },
  {
   "name": "resolveRepoRootForPurl",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/graphify-store.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/graphify-store.ts",
   "symbol": "resolveRepoRootForPurl",
   "purpose": "Resolves a repo purl to a checkout for graphify cache keying.",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/graphify-store.ts",
   "layer": 4,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "purl",
      "type": "string"
     }
    ],
    "returnType": "string | null"
   },
   "declarationProvenance": "authored",
   "alias": "c170"
  },
  {
   "name": "resolveRepoRootFromAlexandria",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/alexandria.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/alexandria.ts",
   "symbol": "resolveRepoRootFromAlexandria",
   "purpose": "Maps owner and name to a registered checkout by matching remotes.",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/alexandria.ts",
   "layer": 5,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "owner",
      "type": "string"
     },
     {
      "name": "name",
      "type": "string"
     }
    ],
    "returnType": "string | null"
   },
   "declarationProvenance": "authored",
   "alias": "c171"
  },
  {
   "name": "githubReposFromComponents",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "symbol": "githubReposFromComponents",
   "purpose": "Derives a model's repos from its component purls for the listing.",
   "process": "subsystems-studio/host",
   "layer": 3,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "components",
      "type": "ReadonlyArray<{ purl?: string }>"
     }
    ],
    "returnType": "Array<{ owner: string; name: string }>"
   },
   "declarationProvenance": "authored",
   "alias": "c172"
  },
  {
   "name": "assessSubsystemGraphifyReadiness",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/graphify-store.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/graphify-store.ts",
   "symbol": "assessSubsystemGraphifyReadiness",
   "purpose": "Reports whether each component purl has a current graphify cache slot.",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/graphify-store.ts",
   "layer": 3,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "graph",
      "type": "{ components: Array<{ purl?: string }> }"
     },
     {
      "name": "buildingPurls",
      "type": "ReadonlySet<string>"
     },
     {
      "name": "storeRoot",
      "type": "string"
     }
    ],
    "returnType": "SubsystemGraphifyReadiness"
   },
   "declarationProvenance": "authored",
   "alias": "c173"
  },
  {
   "name": "acceptSubsystemModelProposal",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/proposal-store.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/proposal-store.ts",
   "symbol": "acceptSubsystemModelProposal",
   "purpose": "Applies an accepted proposal's changes to the model — rewriting components/relations by their ids.",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/proposal-store.ts",
   "layer": 2,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "graphId",
      "type": "string"
     },
     {
      "name": "proposalId",
      "type": "string"
     }
    ],
    "returnType": "Promise<{ ok: boolean; error?: string }>"
   },
   "declarationProvenance": "authored",
   "alias": "c174"
  },
  {
   "name": "applySubsystemModelAuditFix",
   "construct": "function",
   "role": "entry",
   "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
   "symbol": "applySubsystemModelAuditFix",
   "purpose": "Adopts a graphify signature/file/declaration-ref fix onto one componentId (or every component).",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
   "layer": 1,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "opts",
      "type": "{ graphId: string; fixId: \"adopt_graphify_signature\" | \"adopt_graphify_file\" | \"adopt_graphify_declaration_ref\"; componentId?: string }"
     }
    ],
    "returnType": "Promise<{ ok: boolean; applied?: number; report?: SubsystemModelAuditReport }>"
   },
   "declarationProvenance": "authored",
   "alias": "c175"
  },
  {
   "name": "principalMetaForComponent",
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/excalidraw/subsystemToExcalidraw.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/excalidraw/subsystemToExcalidraw.ts",
   "symbol": "principalMetaForComponent",
   "purpose": "Stamps a component's id onto its Excalidraw element so the scene can be read back verbatim.",
   "process": "principal-studio/renderer",
   "module": "packages/subsystems-studio/src/mainview/excalidraw/subsystemToExcalidraw.ts",
   "layer": 4,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "c",
      "type": "SubsystemComponent"
     }
    ],
    "returnType": "PrincipalComponentMeta"
   },
   "declarationProvenance": "authored",
   "alias": "c176"
  },
  {
   "name": "excalidrawSceneToSubsystemModel",
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/excalidraw/excalidrawToSubsystem.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/excalidraw/excalidrawToSubsystem.ts",
   "symbol": "excalidrawSceneToSubsystemModel",
   "purpose": "Rebuilds a model document from an edited scene, reading component ids from element metadata.",
   "process": "principal-studio/renderer",
   "module": "packages/subsystems-studio/src/mainview/excalidraw/excalidrawToSubsystem.ts",
   "layer": 4,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "scene",
      "type": "ExcalidrawLikeScene"
     }
    ],
    "returnType": "RebuiltSubsystemModel"
   },
   "declarationProvenance": "authored",
   "alias": "c177"
  },
  {
   "name": "AppHeader",
   "construct": "function",
   "role": "entry",
   "file": "packages/subsystems-studio/src/mainview/components/AppHeader.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/AppHeader.tsx",
   "symbol": "AppHeader",
   "purpose": "Poll the host for OpenCode v2 server health and open the live-sessions chip.",
   "process": "subsystems-studio/renderer",
   "layer": 0,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "libraryActive",
      "type": "boolean"
     }
    ],
    "returnType": "JSX.Element"
   },
   "declarationProvenance": "authored",
   "alias": "c178"
  },
  {
   "name": "ServerSessionsModal",
   "construct": "function",
   "role": "entry",
   "file": "packages/subsystems-studio/src/mainview/components/ServerSessionsModal.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/ServerSessionsModal.tsx",
   "symbol": "ServerSessionsModal",
   "purpose": "Poll recent OpenCode server sessions and merge live SSE last-event updates.",
   "process": "subsystems-studio/renderer",
   "layer": 0,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "onClose",
      "type": "() => void"
     }
    ],
    "returnType": "JSX.Element"
   },
   "declarationProvenance": "authored",
   "alias": "c179"
  },
  {
   "name": "resolveOpencodeConnection",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/server-sessions.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/server-sessions.ts",
   "symbol": "resolveOpencodeConnection",
   "purpose": "Read service.json or server.json (or env overrides) to locate the running OpenCode v2 HTTP server.",
   "process": "subsystems-studio/host",
   "layer": 1,
   "declaration": {
    "kind": "function",
    "parameters": [],
    "returnType": "OpencodeConnection | null"
   },
   "declarationProvenance": "authored",
   "alias": "c180"
  },
  {
   "name": "probeOpencodeServer",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/server-sessions.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/server-sessions.ts",
   "symbol": "probeOpencodeServer",
   "purpose": "GET /api/health with Basic auth and report whether the OpenCode v2 server is healthy.",
   "process": "subsystems-studio/host",
   "layer": 1,
   "declaration": {
    "kind": "function",
    "parameters": [],
    "returnType": "Promise<OpencodeServerStatus>"
   },
   "declarationProvenance": "authored",
   "alias": "c181"
  },
  {
   "name": "listRecentServerSessions",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/server-sessions.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/server-sessions.ts",
   "symbol": "listRecentServerSessions",
   "purpose": "Merge /api/session, /api/session/active, and the live watch into recent ServerSessionRow rows.",
   "process": "subsystems-studio/host",
   "layer": 1,
   "declaration": {
    "kind": "function",
    "parameters": [],
    "returnType": "Promise<{ ok: boolean; running: boolean; sessions: ServerSessionRow[] }>"
   },
   "declarationProvenance": "authored",
   "alias": "c182"
  },
  {
   "name": "setServerEventWatch",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/server-sessions.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/server-sessions.ts",
   "symbol": "setServerEventWatch",
   "purpose": "Start or stop the single /api/event SSE subscription that feeds live last-event state.",
   "process": "subsystems-studio/host",
   "layer": 1,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "active",
      "type": "boolean"
     },
     {
      "name": "listener",
      "type": "(sessions: ServerSessionRow[]) => void"
     }
    ],
    "returnType": "void"
   },
   "declarationProvenance": "authored",
   "alias": "c183"
  },
  {
   "name": "buildSessionIndex",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/session-pipeline.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/session-pipeline.ts",
   "symbol": "buildSessionIndex",
   "purpose": "Scan opencode.db for windowed session summaries, parent/child task groups, and hasMore.",
   "process": "subsystems-studio/host",
   "layer": 1,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "days",
      "type": "number"
     }
    ],
    "returnType": "Promise<{ groups: SessionGroup[]; standalone: SessionSummary[]; hasMore?: boolean }>"
   },
   "declarationProvenance": "authored",
   "alias": "c184"
  },
  {
   "name": "analyzeSessionInBackground",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "symbol": "analyzeSessionInBackground",
   "purpose": "Load session events, segment beats, build the extractor brief, and run OpenCode concept extraction.",
   "process": "subsystems-studio/host",
   "layer": 1,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "id",
      "type": "string"
     },
     {
      "name": "opts",
      "type": "{ sessionId: string; title?: string; agent?: string }"
     }
    ],
    "returnType": "void"
   },
   "declarationProvenance": "authored",
   "alias": "c185"
  },
  {
   "name": "analyzeBeats",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/beat-analysis.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/beat-analysis.ts",
   "symbol": "analyzeBeats",
   "purpose": "Segment a session timeline into host-computed beats for the extractor brief.",
   "process": "subsystems-studio/host",
   "layer": 2,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "sessionId",
      "type": "string"
     },
     {
      "name": "events",
      "type": "SessionEventRow[]"
     }
    ],
    "returnType": "BeatAnalysis"
   },
   "declarationProvenance": "authored",
   "alias": "c186"
  },
  {
   "name": "runOpenCodeExtraction",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/extraction.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/extraction.ts",
   "symbol": "runOpenCodeExtraction",
   "purpose": "Spawn opencode run with the concept-extractor agent and parse arc-summary JSON from the stream.",
   "process": "subsystems-studio/host",
   "layer": 2,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "opts",
      "type": "{ primaryRepoRoot?: string; task: string }"
     }
    ],
    "returnType": "Promise<ExtractionResult>"
   },
   "declarationProvenance": "authored",
   "alias": "c187"
  },
  {
   "alias": "c188",
   "name": "TrailsPanel",
   "construct": "function",
   "framework": "react",
   "stereotype": "component",
   "file": "packages/subsystems-react/src/subsystem/TrailsPanel.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/TrailsPanel.tsx",
   "symbol": "TrailsPanel",
   "purpose": "Lists each flow's steps; clicking a step focuses its hop and opens the bottom drawer.",
   "process": "principal-studio/renderer"
  },
  {
   "alias": "c189",
   "name": "modelProvenance",
   "construct": "function",
   "role": "entry",
   "framework": "bun",
   "stereotype": "service",
   "file": "packages/subsystems-studio/src/bun/purl-commits.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/purl-commits.ts",
   "symbol": "modelProvenance",
   "module": "packages/subsystems-studio/src/bun/purl-commits.ts",
   "process": "subsystems-studio/host",
   "layer": 2,
   "purpose": "Measure per-purl anchor contact between a model's verified pin and the current checkout, cheaply enough for a list pass.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "stored",
      "type": "ProvenanceSource"
     },
     {
      "name": "probes",
      "type": "ProvenanceProbes"
     }
    ],
    "returnType": "Promise<ModelProvenanceSnapshot>"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c190",
   "name": "referencedFilesByPurl",
   "construct": "function",
   "framework": "bun",
   "file": "packages/subsystems-studio/src/bun/purl-commits.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/purl-commits.ts",
   "symbol": "referencedFilesByPurl",
   "module": "packages/subsystems-studio/src/bun/purl-commits.ts",
   "process": "subsystems-studio/host",
   "layer": 3,
   "purpose": "Derive the repo-root-relative pathspec of everything a model anchors to, including walkthrough step sites.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "components",
      "type": "ReadonlyArray<ComponentLike>"
     },
     {
      "name": "walkthroughs",
      "type": "ReadonlyArray<WalkthroughLike>"
     }
    ],
    "returnType": "Map<string, string[]>"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c191",
   "name": "diffScopedFiles",
   "construct": "function",
   "framework": "bun",
   "file": "packages/subsystems-studio/src/bun/git-repo.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/git-repo.ts",
   "symbol": "diffScopedFiles",
   "module": "packages/subsystems-studio/src/bun/git-repo.ts",
   "process": "subsystems-studio/host",
   "layer": 4,
   "purpose": "Report which anchored paths differ between the pin and head, and null when git cannot answer so callers never read a failure as clean.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "repoRoot",
      "type": "string"
     },
     {
      "name": "from",
      "type": "string"
     },
     {
      "name": "to",
      "type": "string"
     },
     {
      "name": "relPaths",
      "type": "ReadonlyArray<string>"
     }
    ],
    "returnType": "Promise<string[] | null>"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c192",
   "name": "filesDirty",
   "construct": "function",
   "framework": "bun",
   "file": "packages/subsystems-studio/src/bun/git-repo.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/git-repo.ts",
   "symbol": "filesDirty",
   "module": "packages/subsystems-studio/src/bun/git-repo.ts",
   "process": "subsystems-studio/host",
   "layer": 4,
   "purpose": "Name the anchored paths with uncommitted edits, treating an unreadable repo as fully dirty rather than clean.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "repoRoot",
      "type": "string"
     },
     {
      "name": "relPaths",
      "type": "ReadonlyArray<string>"
     }
    ],
    "returnType": "Promise<string[]>"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c193",
   "name": "revDistance",
   "construct": "function",
   "framework": "bun",
   "file": "packages/subsystems-studio/src/bun/git-repo.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/git-repo.ts",
   "symbol": "revDistance",
   "module": "packages/subsystems-studio/src/bun/git-repo.ts",
   "process": "subsystems-studio/host",
   "layer": 4,
   "purpose": "Measure commit distance in both directions, suppressing the counts entirely when a rebase orphaned the pin.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "repoRoot",
      "type": "string"
     },
     {
      "name": "from",
      "type": "string"
     },
     {
      "name": "to",
      "type": "string"
     }
    ],
    "returnType": "Promise<RevDistance>"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c194",
   "name": "commitTouches",
   "construct": "function",
   "framework": "bun",
   "file": "packages/subsystems-studio/src/bun/git-repo.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/git-repo.ts",
   "symbol": "commitTouches",
   "module": "packages/subsystems-studio/src/bun/git-repo.ts",
   "process": "subsystems-studio/host",
   "layer": 4,
   "purpose": "Walk the range oldest-first, flagging each commit that touched an anchor, because a net diff cannot say when a model went stale.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "repoRoot",
      "type": "string"
     },
     {
      "name": "from",
      "type": "string"
     },
     {
      "name": "to",
      "type": "string"
     },
     {
      "name": "relPaths",
      "type": "ReadonlyArray<string>"
     },
     {
      "name": "limit",
      "type": "number"
     }
    ],
    "returnType": "Promise<CommitTouches[] | null>"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c195",
   "name": "remoteRefSha",
   "construct": "function",
   "framework": "bun",
   "file": "packages/subsystems-studio/src/bun/git-repo.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/git-repo.ts",
   "symbol": "remoteRefSha",
   "module": "packages/subsystems-studio/src/bun/git-repo.ts",
   "process": "subsystems-studio/host",
   "layer": 4,
   "purpose": "Resolve the sha the remote's default branch points at, which a local HEAD read structurally cannot see.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "repoRoot",
      "type": "string"
     }
    ],
    "returnType": "Promise<string | null>"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c196",
   "name": "modelProvenanceDetail",
   "construct": "function",
   "framework": "bun",
   "file": "packages/subsystems-studio/src/bun/purl-commits.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/purl-commits.ts",
   "symbol": "modelProvenanceDetail",
   "module": "packages/subsystems-studio/src/bun/purl-commits.ts",
   "process": "subsystems-studio/host",
   "layer": 2,
   "purpose": "Add the per-commit walk and the remote's position, kept off the list path because it is a whole-log read per referenced repo.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "id",
      "type": "string"
     },
     {
      "name": "stored",
      "type": "ProvenanceSource"
     },
     {
      "name": "anchorChanges",
      "type": "Record<string, AnchorChanges>"
     },
     {
      "name": "probes",
      "type": "ProvenanceProbes"
     }
    ],
    "returnType": "Promise<ModelProvenanceDetail>"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c197",
   "name": "planAutoRePin",
   "construct": "function",
   "framework": "bun",
   "file": "packages/subsystems-studio/src/bun/purl-commits.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/purl-commits.ts",
   "symbol": "planAutoRePin",
   "module": "packages/subsystems-studio/src/bun/purl-commits.ts",
   "process": "subsystems-studio/host",
   "layer": 3,
   "purpose": "Decide per repo whether the verified pin can be carried forward, on the proof that unchanged anchored files imply an unchanged verdict.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "stored",
      "type": "ProvenanceSource"
     },
     {
      "name": "anchorChanges",
      "type": "Record<string, AnchorChanges>"
     },
     {
      "name": "probes",
      "type": "ProvenanceProbes"
     }
    ],
    "returnType": "Promise<Record<string, AutoRePinOutcome>>"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c198",
   "name": "applyAutoRePin",
   "construct": "function",
   "framework": "bun",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "symbol": "applyAutoRePin",
   "module": "packages/subsystems-studio/src/bun/index.ts",
   "process": "subsystems-studio/host",
   "layer": 2,
   "purpose": "Write the promoted pins for repos that earned one, skipping the record rewrite entirely when nothing moved.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "graphId",
      "type": "string"
     },
     {
      "name": "snapshot",
      "type": "ModelProvenanceSnapshot"
     },
     {
      "name": "full",
      "type": "StoredSubsystemModel"
     }
    ],
    "returnType": "Promise<void>"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c199",
   "name": "stampVerifiedCommits",
   "construct": "function",
   "framework": "bun",
   "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "symbol": "stampVerifiedCommits",
   "module": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
   "process": "subsystems-studio/host",
   "layer": 4,
   "purpose": "Persist the pin map while preserving updatedAt, since bumping it would invalidate the saved audit fingerprint.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "id",
      "type": "string"
     },
     {
      "name": "commits",
      "type": "Record<string, PurlCommit>"
     }
    ],
    "returnType": "Promise<StoredSubsystemModel | null>"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c200",
   "name": "getMaintenanceOverview",
   "construct": "function",
   "role": "entry",
   "framework": "bun",
   "stereotype": "controller",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "symbol": "getMaintenanceOverview",
   "module": "packages/subsystems-studio/src/bun/index.ts",
   "process": "subsystems-studio/host",
   "layer": 1,
   "purpose": "Serve the Maintain tab's model rows, attaching the cheap provenance snapshot to each.",
   "declaration": {
    "kind": "function",
    "parameters": [],
    "returnType": "Promise<{ overview: MaintenanceOverview }>"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c201",
   "name": "getModelProvenanceDetail",
   "construct": "function",
   "role": "entry",
   "framework": "bun",
   "stereotype": "controller",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "symbol": "getModelProvenanceDetail",
   "module": "packages/subsystems-studio/src/bun/index.ts",
   "process": "subsystems-studio/host",
   "layer": 1,
   "purpose": "Serve the expensive tier on demand, recomputing the cheap snapshot to decide whether a re-pin is warranted.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "params",
      "type": "{ id: string }"
     }
    ],
    "returnType": "Promise<ModelProvenanceDetail>"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c202",
   "name": "MaintenancePanel",
   "construct": "function",
   "role": "entry",
   "framework": "react",
   "stereotype": "component",
   "file": "packages/subsystems-studio/src/mainview/views/MaintenancePanel.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/MaintenancePanel.tsx",
   "symbol": "MaintenancePanel",
   "module": "packages/subsystems-studio/src/mainview/views/MaintenancePanel.tsx",
   "process": "subsystems-studio/renderer",
   "layer": 1,
   "purpose": "Own the expanded strip's state and fetch the detail tier once per model the first time a row opens.",
   "declaration": {
    "kind": "function",
    "parameters": [],
    "returnType": "JSX.Element"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c203",
   "name": "mergeProvenance",
   "construct": "function",
   "framework": "react",
   "file": "packages/subsystems-studio/src/mainview/components/MaintenanceModelList.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/MaintenanceModelList.tsx",
   "symbol": "mergeProvenance",
   "module": "packages/subsystems-studio/src/mainview/components/MaintenanceModelList.tsx",
   "process": "subsystems-studio/renderer",
   "layer": 2,
   "purpose": "Fold the detail tier over the snapshot per purl, keeping the measurement the walk never recomputes.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "snapshot",
      "type": "ModelProvenanceData"
     },
     {
      "name": "detail",
      "type": "ModelProvenanceDetail"
     }
    ],
    "returnType": "ModelProvenanceData | undefined"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c204",
   "name": "ProvenanceBadge",
   "construct": "function",
   "framework": "react",
   "stereotype": "component",
   "file": "packages/subsystems-studio/src/mainview/components/ModelProvenance.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/ModelProvenance.tsx",
   "symbol": "ProvenanceBadge",
   "module": "packages/subsystems-studio/src/mainview/components/ModelProvenance.tsx",
   "process": "subsystems-studio/renderer",
   "layer": 3,
   "purpose": "State how stale a model is at list density, leading with the commit count and file blast radius rather than any sha.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "provenance",
      "type": "ModelProvenanceData"
     },
     {
      "name": "onToggle",
      "type": "() => void"
     },
     {
      "name": "open",
      "type": "boolean"
     }
    ],
    "returnType": "JSX.Element | null"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c205",
   "name": "CommitDots",
   "construct": "function",
   "framework": "react",
   "stereotype": "component",
   "file": "packages/subsystems-studio/src/mainview/components/ModelProvenance.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/ModelProvenance.tsx",
   "symbol": "CommitDots",
   "module": "packages/subsystems-studio/src/mainview/components/ModelProvenance.tsx",
   "process": "subsystems-studio/renderer",
   "layer": 4,
   "purpose": "Draw one dot per commit with the remote's position outlined, so the recency of the damage is readable at a glance.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "commits",
      "type": "ReadonlyArray<CommitDot>"
     },
     {
      "name": "remoteIndex",
      "type": "number"
     },
     {
      "name": "remoteAhead",
      "type": "number"
     },
     {
      "name": "limit",
      "type": "number"
     }
    ],
    "returnType": "JSX.Element | null"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c206",
   "name": "DirtyBadge",
   "construct": "function",
   "framework": "react",
   "stereotype": "component",
   "file": "packages/subsystems-studio/src/mainview/components/ModelProvenance.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/ModelProvenance.tsx",
   "symbol": "DirtyBadge",
   "module": "packages/subsystems-studio/src/mainview/components/ModelProvenance.tsx",
   "process": "subsystems-studio/renderer",
   "layer": 4,
   "purpose": "Report uncommitted edits to anchored files separately, since working-tree state and verification currency are orthogonal.",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "provenance",
      "type": "ModelProvenanceData"
     }
    ],
    "returnType": "JSX.Element | null"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c207",
   "name": "upsertFeed",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2-live.ts",
   "symbol": "upsertFeed",
   "purpose": "In-memory Map of live OpenCode feeds keyed by sessionId, each snapshot stamped with its graphId.",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
   "layer": 4,
   "declaration": {
    "kind": "store",
    "properties": [
     {
      "name": "feeds",
      "type": "Map<string, OpencodeLiveFeedState>"
     }
    ],
    "storage": "memory"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c208",
   "name": "ensureLiveFeedBroadcast",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/index.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
   "symbol": "ensureLiveFeedBroadcast",
   "purpose": "Subscribes to live feeds once and re-broadcasts every snapshot, including graphId, to the renderer.",
   "process": "subsystems-studio/host",
   "layer": 3,
   "declaration": {
    "kind": "function",
    "parameters": [],
    "returnType": "void"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c209",
   "name": "isMaintainSession",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/maintain-sessions.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-sessions.ts",
   "symbol": "isMaintainSession",
   "purpose": "Decides whether a stored session is a Maintain run from its title prefix or agent name.",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/maintain-sessions.ts",
   "layer": 3,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "opts",
      "type": "{ title?: string; agent?: string | null }"
     }
    ],
    "returnType": "boolean"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c210",
   "name": "MaintenancePanel",
   "construct": "function",
   "framework": "react",
   "stereotype": "component",
   "file": "packages/subsystems-studio/src/mainview/components/MaintenanceAgentModal.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/MaintenanceAgentModal.tsx",
   "symbol": "MaintenancePanel",
   "purpose": "Per-model Maintain surface: shows lanes, starts runs, and keys live progress by graphId.",
   "process": "subsystems-studio/renderer",
   "layer": 1,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "overlay",
      "type": "boolean"
     },
     {
      "name": "onClose",
      "type": "() => void"
     }
    ],
    "returnType": "JSX.Element"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c211",
   "name": "copyRowContext",
   "construct": "function",
   "file": "packages/subsystems-react/src/components/session-events/SessionEventFeed.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/components/session-events/SessionEventFeed.tsx",
   "symbol": "copyRowContext",
   "purpose": "Copies a session row's context (task, session id, resume command) for a discussion.",
   "process": "subsystems-react/session-ui",
   "layer": 2,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "row",
      "type": "SessionEventFeedRow"
     },
     {
      "name": "sessionTitle",
      "type": "string | undefined"
     }
    ],
    "returnType": "Promise<boolean>"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c212",
   "name": "MaintenanceOverviewModel",
   "construct": "interface",
   "file": "packages/subsystems-studio/src/shared/contract.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/shared/contract.ts",
   "symbol": "MaintenanceOverviewModel",
   "purpose": "Per-model Maintain row: verdict, verification ledger, pending counts — no run history.",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/shared/contract.ts",
   "layer": 2,
   "declaration": {
    "kind": "type",
    "properties": [
     {
      "name": "graphId",
      "type": "string"
     },
     {
      "name": "verdict",
      "type": "\"fully_verified\" | \"partially_verified\" | \"issues\" | \"unknown\""
     },
     {
      "name": "pendingProposalCount",
      "type": "number"
     }
    ]
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c213",
   "name": "SessionSummary",
   "construct": "interface",
   "file": "packages/subsystems-studio/src/shared/contract.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/shared/contract.ts",
   "symbol": "SessionSummary",
   "purpose": "Durable session metadata (title, agent, times, models) that carries no graph id field.",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/shared/contract.ts",
   "layer": 2,
   "declaration": {
    "kind": "type",
    "properties": [
     {
      "name": "id",
      "type": "string"
     },
     {
      "name": "title",
      "type": "string"
     },
     {
      "name": "agent",
      "type": "string | undefined"
     },
     {
      "name": "repoRoot",
      "type": "string | undefined"
     }
    ]
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c214",
   "name": "SubsystemModelRunStore",
   "construct": "store",
   "proposed": true,
   "file": "packages/subsystems-studio/src/bun/subsystem-model-runs.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-runs.ts",
   "symbol": "SubsystemModelRunStore",
   "purpose": "Proposed per-model run log under ~/.principal/subsystem-model-runs that records sessionId, agent, model, times, and outcome.",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/subsystem-model-runs.ts",
   "layer": 3,
   "declaration": {
    "kind": "store",
    "properties": [
     {
      "name": "runs",
      "type": "SubsystemModelRun[]"
     }
    ],
    "storage": "disk"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c215",
   "name": "listSubsystemModelRuns",
   "construct": "function",
   "proposed": true,
   "file": "packages/subsystems-studio/src/bun/subsystem-model-runs.ts",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-runs.ts",
   "symbol": "listSubsystemModelRuns",
   "purpose": "Proposed RPC that returns a model's recent runs, joined with durable session metadata.",
   "process": "subsystems-studio/host",
   "module": "packages/subsystems-studio/src/bun/subsystem-model-runs.ts",
   "layer": 2,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "graphId",
      "type": "string"
     },
     {
      "name": "opts",
      "type": "{ days?: number }"
     }
    ],
    "returnType": "Promise<SubsystemModelRun[]>"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c216",
   "name": "RecentRunsSection",
   "construct": "function",
   "proposed": true,
   "framework": "react",
   "stereotype": "component",
   "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
   "symbol": "RecentRunsSection",
   "purpose": "Proposed expanded-row panel listing a model's recent runs with a copy-session affordance.",
   "process": "subsystems-studio/renderer",
   "module": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
   "layer": 2,
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "runs",
      "type": "SubsystemModelRun[]"
     }
    ],
    "returnType": "JSX.Element"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c217",
   "construct": "function",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "report",
      "type": "SubsystemModelAuditReport"
     }
    ],
    "returnType": "MaintainRoute | null"
   },
   "declarationProvenance": "authored",
   "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
   "layer": 2,
   "module": "packages/subsystems-studio/src/bun/maintain-model.ts",
   "name": "selectMaintainRoute",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
   "purpose": "Pick the next maintenance agent by layer then severity.",
   "symbol": "selectMaintainRoute"
  },
  {
   "alias": "c218",
   "construct": "function",
   "file": "packages/subsystems-studio/src/bun/jev-maintenance.ts",
   "layer": 3,
   "module": "packages/subsystems-studio/src/bun/jev-maintenance.ts",
   "name": "autoAcceptProposalIfConfident",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/jev-maintenance.ts",
   "purpose": "Score a proposal with Jev and auto-accept only when confidence clears the threshold.",
   "symbol": "autoAcceptProposalIfConfident",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "graphId",
      "type": "string"
     },
     {
      "name": "proposal",
      "type": "SubsystemModelProposal"
     },
     {
      "name": "opts",
      "type": "{ enabled: boolean; threshold: number; apiKey?: string; sourceContext?: string }"
     }
    ],
    "returnType": "Promise<{ accepted: boolean; proposal: SubsystemModelProposal; error?: string }>"
   },
   "declarationProvenance": "authored"
  },
  {
   "alias": "c219",
   "name": "ProposalsModal",
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/components/ProposalsModal.tsx",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/ProposalsModal.tsx",
   "symbol": "ProposalsModal",
   "purpose": "Render pending proposals with Jev second-opinion confidence.",
   "process": "subsystems-studio/renderer",
   "module": "packages/subsystems-studio/src/mainview/components/ProposalsModal.tsx",
   "layer": 3
  },
  {
   "alias": "c220",
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/components/SettingsModal.tsx",
   "layer": 1,
   "module": "packages/subsystems-studio/src/mainview/components/SettingsModal.tsx",
   "name": "SettingsModal",
   "process": "subsystems-studio/renderer",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/SettingsModal.tsx",
   "purpose": "Expose the Jev confidence threshold next to the auto-accept toggle.",
   "role": "entry",
   "symbol": "SettingsModal"
  },
  {
   "alias": "c221",
   "construct": "function",
   "declaration": {
    "kind": "function",
    "parameters": [
     {
      "name": "current",
      "type": "ViewerSettings"
     },
     {
      "name": "patch",
      "type": "PartialViewerSettings"
     }
    ],
    "returnType": "ViewerSettings"
   },
   "declarationProvenance": "authored",
   "file": "packages/subsystems-studio/src/bun/viewer-settings.ts",
   "layer": 2,
   "module": "packages/subsystems-studio/src/bun/viewer-settings.ts",
   "name": "patchViewerSettings",
   "process": "subsystems-studio/host",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/viewer-settings.ts",
   "purpose": "Merge and persist viewer settings, including the confidence threshold, to ~/.principal/principal-studio-settings.json.",
   "symbol": "patchViewerSettings"
  },
  {
   "alias": "c222",
   "construct": "interface",
   "file": "packages/subsystems-studio/src/shared/contract.ts",
   "name": "StoredSubsystemModel",
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/shared/contract.ts",
   "purpose": "Hold updatedAt edit stamp plus host-local lastOpenedAt open stamp.",
   "symbol": "StoredSubsystemModel"
  },
  {
   "alias": "c223",
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
   "name": "isModelViewed",
   "proposed": true,
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
   "purpose": "Derive viewed as lastOpenedAt at or after updatedAt.",
   "symbol": "isModelViewed"
  },
  {
   "alias": "c224",
   "construct": "function",
   "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
   "framework": "react",
   "name": "ViewedBadge",
   "proposed": true,
   "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
   "purpose": "Mark rows with unseen changes and filter to unviewed models.",
   "stereotype": "component",
   "symbol": "ViewedBadge"
  }
 ],
 "trails": [
  {
   "id": "all",
   "title": "all trails",
   "steps": [
    {
     "from": "c1",
     "to": "c10",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2030,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "loadSubsystemModelAudit",
     "annotation": "The getSubsystemModelAudit RPC is served here by reading the saved report."
    },
    {
     "from": "c1",
     "to": "c2",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 318,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "auditReportToIssues",
     "annotation": "Map the report's findings to presentation issues."
    },
    {
     "from": "c1",
     "to": "c5",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 377,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "SubsystemComponentGraph",
     "annotation": "Pass issues, diagnostic status, and (planned) verification into the graph."
    },
    {
     "from": "c5",
     "to": "c6",
     "mechanism": "feeds",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 226,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "nodeTypes",
     "annotation": "Each node's data carries the verification ladder and hover issue."
    },
    {
     "from": "c5",
     "to": "c7",
     "mechanism": "feeds",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 1547,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "SubsystemDiagnosticToggle",
     "annotation": "The title row renders the status chip."
    },
    {
     "from": "c5",
     "to": "c8",
     "mechanism": "feeds",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 1614,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "SubsystemIssueList",
     "annotation": "The sidebar bottom panel renders the grouped issue list."
    },
    {
     "from": "c1",
     "to": "c4",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 294,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "runSubsystemModelAuditFlow",
     "annotation": "Chip click with no or stale report runs the audit flow."
    },
    {
     "from": "c4",
     "to": "c0",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/auditSubsystemModelFlow.ts",
     "line": 271,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/auditSubsystemModelFlow.ts",
     "symbol": "auditSubsystemModel",
     "annotation": "Run the host audit over the RPC bridge."
    },
    {
     "from": "c0",
     "to": "c9",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "line": 1333,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "symbol": "saveSubsystemModelAudit",
     "annotation": "Persist the fresh report so the view can fetch it."
    },
    {
     "from": "c11",
     "to": "c12",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 424,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "SubsystemComponentGraph",
     "annotation": "Document change triggers buildSubsystemGraph."
    },
    {
     "from": "c12",
     "to": "c14",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/model.ts",
     "line": 1002,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
     "symbol": "buildSubsystemGraph",
     "annotation": "Leaves first — convertSubsystemToNodes stamps module/process parentId."
    },
    {
     "from": "c12",
     "to": "c13",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/model.ts",
     "line": 1005,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
     "symbol": "buildSubsystemGraph",
     "annotation": "buildBoundaryLayoutGroups nests module groups under shared process."
    },
    {
     "from": "c13",
     "to": "c16",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/model.ts",
     "line": 533,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
     "symbol": "buildBoundaryLayoutGroups",
     "annotation": "Multi-member modules become frames; parentId set when process is unanimous."
    },
    {
     "from": "c12",
     "to": "c17",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/model.ts",
     "line": 1081,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
     "symbol": "buildSubsystemGraph",
     "annotation": "computeElkLayout gets nested groups[] with parentId."
    },
    {
     "from": "c11",
     "to": "c18",
     "mechanism": "uses",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 178,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "SubsystemComponentGraph",
     "annotation": "RF registers SubsystemGroupNode for type subsystem-group."
    },
    {
     "from": "c22",
     "to": "c21",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "line": 701,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "symbol": "refresh",
     "annotation": "Polls listSubsystemModels every 10s. Summaries carry counts and repos, never files."
    },
    {
     "from": "c21",
     "to": "c19",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 1950,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "listSubsystemModels",
     "annotation": "Reads the lightweight index with counts and timestamps only."
    },
    {
     "from": "c21",
     "to": "c20",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 1953,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "listSubsystemModels",
     "annotation": "Loads each full model to derive repos, graphify and audit, then drops component files before replying."
    },
    {
     "from": "c26",
     "to": "c20",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "line": 958,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "symbol": "onShowAuditReport",
     "annotation": "Loads the full model once per selected id and caches it, invalidating on subsystemModelChanged."
    },
    {
     "from": "c26",
     "to": "c24",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/paths.ts",
     "line": 93,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/paths.ts",
     "symbol": "buildRepoGroups",
     "annotation": "Groups the selected components file and purl pairs by repo."
    },
    {
     "from": "c24",
     "to": "c25",
     "mechanism": "feeds",
     "file": "packages/subsystems-react/src/subsystem/SubsystemFileTree.tsx",
     "line": 29,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemFileTree.tsx",
     "symbol": "SubsystemFileTree",
     "annotation": "Renders one tree per repo group like the detail graph. Clicking a file opens the graph tab with the file drawer."
    },
    {
     "from": "c27",
     "to": "c22",
     "mechanism": "uses",
     "file": "packages/subsystems-studio/src/mainview/components/FilesDrilldown.tsx",
     "line": 190,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/FilesDrilldown.tsx",
     "symbol": "FilesDrilldown",
     "annotation": "The combined toggle flips combinedActive in the list view."
    },
    {
     "from": "c22",
     "to": "c28",
     "mechanism": "uses",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "line": 1732,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "symbol": "ComposedGraphPane",
     "annotation": "Renders ComposedGraphPane for the drilled-in repo; on the permanent tab scopeOrder is null, so no modelIds prop."
    },
    {
     "from": "c28",
     "to": "c19",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/ComposedGraphPane.tsx",
     "line": 74,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/ComposedGraphPane.tsx",
     "symbol": "getComposedSubsystemModel",
     "annotation": "RPC getComposedSubsystemModel({ repoKey, modelIds }) — modelIds is undefined here."
    },
    {
     "from": "c19",
     "to": "c29",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2170,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "mergeSubsystemModels",
     "annotation": "With no scope, every stored model touching the repo key reaches the merge."
    },
    {
     "from": "c29",
     "to": "c28",
     "mechanism": "produces",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2173,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "mergeSubsystemModels",
     "annotation": "Merged document, sidecar and the contributing model ids return to the pane."
    },
    {
     "from": "c28",
     "to": "c30",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/ComposedGraphPane.tsx",
     "line": 99,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/ComposedGraphPane.tsx",
     "symbol": "aggregateToFrames",
     "annotation": "Roll the composed document up to frames."
    },
    {
     "from": "c30",
     "to": "c31",
     "mechanism": "produces",
     "file": "packages/subsystems-studio/src/mainview/views/ComposedGraphPane.tsx",
     "line": 174,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/ComposedGraphPane.tsx",
     "symbol": "SubsystemAggregateGraph",
     "annotation": "The aggregate renders every repo model."
    },
    {
     "from": "c22",
     "to": "c28",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "line": 1740,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "symbol": "ComposedGraphPane",
     "annotation": "Passes modelIds={scopeOrder} — the showcase's ordered id set — into the pane."
    },
    {
     "from": "c28",
     "to": "c19",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/ComposedGraphPane.tsx",
     "line": 74,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/ComposedGraphPane.tsx",
     "symbol": "getComposedSubsystemModel",
     "annotation": "The RPC request now carries modelIds."
    },
    {
     "from": "c19",
     "to": "c29",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2162,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "mergeSubsystemModels",
     "annotation": "Handler builds a Set from modelIds and skips ids outside it, then merges the survivors that touch the repo."
    },
    {
     "from": "c29",
     "to": "c28",
     "mechanism": "produces",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2173,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "mergeSubsystemModels",
     "annotation": "Only scoped models come back; the composite count and frames match the showcase."
    },
    {
     "from": "c1",
     "to": "c32",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 347,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "SubsystemModelView",
     "annotation": "Collect unique component purls that need a graphify cache, skipping externals."
    },
    {
     "from": "c1",
     "to": "c33",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 364,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "SubsystemModelView",
     "annotation": "Subscribe to graphifyChanged pushes while a background build runs."
    },
    {
     "from": "c1",
     "to": "c34",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 374,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "SubsystemModelView",
     "annotation": "Ensure the graphify cache over RPC and wait when the status is building."
    },
    {
     "from": "c1",
     "to": "c0",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 443,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "SubsystemModelView",
     "annotation": "Invoke the host dry-run audit once caches are ready."
    },
    {
     "from": "c0",
     "to": "c38",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 452,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "SubsystemModelView",
     "annotation": "Deliver the report into the modal done phase without mutating the graph."
    },
    {
     "from": "c0",
     "to": "c35",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "line": 598,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "symbol": "auditSubsystemModel",
     "annotation": "Check every file exists and every claimed symbol is declared."
    },
    {
     "from": "c0",
     "to": "c36",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "line": 667,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "symbol": "auditSubsystemModel",
     "annotation": "Verify each source component dry-run against the graphify cache."
    },
    {
     "from": "c36",
     "to": "c37",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "line": 227,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "symbol": "verifySubsystemComponent",
     "annotation": "Test the claimed symbol declaration against file contents."
    },
    {
     "from": "c39",
     "to": "c40",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2683,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "auditOne",
     "annotation": "Hand the next stored model to the quiet re-audit once the timer fires."
    },
    {
     "from": "c40",
     "to": "c0",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2662,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "reauditSubsystemModelQuietly",
     "annotation": "Re-run the deterministic dry-run audit for the model."
    },
    {
     "from": "c0",
     "to": "c40",
     "mechanism": "produces",
     "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "line": 871,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "symbol": "auditSubsystemModel",
     "annotation": "Produce the fresh report the quiet pass persists."
    },
    {
     "from": "c39",
     "to": "c41",
     "mechanism": "produces",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2686,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "broadcastRegularAuditChanged",
     "annotation": "Emit scheduler status on every enable, tick and pass finish."
    },
    {
     "from": "c41",
     "to": "c42",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/rpc.ts",
     "line": 151,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/rpc.ts",
     "symbol": "broadcastRegularAuditChanged",
     "annotation": "Fan the pushed status out to every registered renderer callback."
    },
    {
     "from": "c42",
     "to": "c22",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "line": 645,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "symbol": "regularAuditChangeSubscribers",
     "annotation": "Re-render the model list countdown and running badge."
    },
    {
     "from": "c43",
     "to": "c35",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "line": 991,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "symbol": "verifyModelFiles",
     "annotation": "Create runs the write-time pass and stores the result on the record."
    },
    {
     "from": "c35",
     "to": "c44",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "line": 670,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "symbol": "resolveRepoRootForComponent",
     "annotation": "Each component's file is resolved against its local repo root and checked on disk."
    },
    {
     "from": "c0",
     "to": "c36",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "line": 950,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "symbol": "verifySubsystemComponent",
     "annotation": "Per component, run the graphify-backed verification in dry-run mode."
    },
    {
     "from": "c36",
     "to": "c47",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "line": 429,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "symbol": "resolveComponentAnchor",
     "annotation": "Anchor file+symbol onto a graphify definition node before construct/signature checks."
    },
    {
     "from": "c0",
     "to": "c45",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "line": 1233,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "symbol": "auditTopologyRelations",
     "annotation": "Layer 2: relations[] endpoints + soft corroboration."
    },
    {
     "from": "c0",
     "to": "c46",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "line": 1263,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "symbol": "auditBoundaryFields",
     "annotation": "Layer 3: module/file membership + process nesting."
    },
    {
     "from": "c36",
     "to": "c50",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "line": 530,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "symbol": "inferConstructFromGraphify",
     "annotation": "Infer the construct kind from the anchored node (heuristic hint)."
    },
    {
     "from": "c36",
     "to": "c51",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "line": 581,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "symbol": "constructsMatch",
     "annotation": "Compare the claimed construct against the inferred one."
    },
    {
     "from": "c36",
     "to": "c49",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "line": 649,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "symbol": "compareSignatures",
     "annotation": "Compare authored named types against graphify signature edges."
    },
    {
     "from": "c45",
     "to": "c52",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/topology-audit.ts",
     "line": 453,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/topology-audit.ts",
     "symbol": "graphifyHasRelationBetween",
     "annotation": "Soft corroboration: does graphify have this relation?"
    },
    {
     "from": "c45",
     "to": "c53",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/topology-audit.ts",
     "line": 464,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/topology-audit.ts",
     "symbol": "graphifyHasRelationTowardHints",
     "annotation": "Soft label match when the target has no exact anchor."
    },
    {
     "from": "c46",
     "to": "c48",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/boundary-audit.ts",
     "line": 144,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/boundary-audit.ts",
     "symbol": "moduleAgreesWithFile",
     "annotation": "Is the module the file or a directory prefix of it?"
    },
    {
     "from": "c54",
     "to": "c55",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/App.tsx",
     "line": 119,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/App.tsx",
     "symbol": "renderStaticView",
     "annotation": "Maintenance Sessions tab mounts the shared overview with scope=maintain."
    },
    {
     "from": "c55",
     "to": "c57",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/AgentSessions.tsx",
     "line": 360,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/AgentSessions.tsx",
     "symbol": "AgentSessionsOverviewView",
     "annotation": "Renderer RPC listMaintainSessions for the day window."
    },
    {
     "from": "c55",
     "to": "c58",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/AgentSessions.tsx",
     "line": 411,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/AgentSessions.tsx",
     "symbol": "AgentSessionsOverviewView",
     "annotation": "Seed the panel via getAgentSessionsOverview({ scope: maintain })."
    },
    {
     "from": "c58",
     "to": "c57",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 1805,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "getAgentSessionsOverview",
     "annotation": "Host lists Maintain session ids from session_v2."
    },
    {
     "from": "c58",
     "to": "c59",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 179,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "buildSessionEvents",
     "annotation": "buildSessionEvents delegates to processSessionEvents for each Maintain id."
    },
    {
     "from": "c55",
     "to": "c56",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/AgentSessions.tsx",
     "line": 439,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/AgentSessions.tsx",
     "symbol": "buildAgentSessionsView",
     "annotation": "Empty events → buildAgentSessionsView returns null → drawer shows no timeline."
    },
    {
     "from": "c60",
     "to": "c57",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
     "line": 291,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2-live.ts",
     "symbol": "runOpencodeV2AgentSession",
     "annotation": "Service persists session_v2 metadata (title Maintain — …, agent) that the tab lists."
    },
    {
     "from": "c55",
     "to": "c57",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/AgentSessions.tsx",
     "line": 360,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/AgentSessions.tsx",
     "symbol": "AgentSessionsOverviewView",
     "annotation": "scope=maintain calls listMaintainSessions for the day window."
    },
    {
     "from": "c55",
     "to": "c59",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/AgentSessions.tsx",
     "line": 411,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/AgentSessions.tsx",
     "symbol": "AgentSessionsOverviewView",
     "annotation": "Overview loads processed timelines via getAgentSessionsOverview → processSessionEvents."
    },
    {
     "from": "c59",
     "to": "c61",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/session-pipeline.ts",
     "line": 1200,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/session-pipeline.ts",
     "symbol": "processSessionEvents",
     "annotation": "Planned: resolveOpencodeSessionKind before choosing a reader (v1 for session-table ids)."
    },
    {
     "from": "c59",
     "to": "c62",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/session-pipeline.ts",
     "line": 1318,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/session-pipeline.ts",
     "symbol": "opencodeRowsToUniversalEvents",
     "annotation": "Map event rows to UniversalAgentSessionEvent."
    },
    {
     "from": "c62",
     "to": "c64",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/bun/session-pipeline.ts",
     "line": 1336,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/session-pipeline.ts",
     "symbol": "accumulateEvents",
     "annotation": "Accumulate into SessionEventRow for the panel."
    },
    {
     "from": "c55",
     "to": "c59",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/AgentSessions.tsx",
     "line": 411,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/AgentSessions.tsx",
     "symbol": "AgentSessionsOverviewView",
     "annotation": "Same overview load path; kind routing chooses the V2 reader."
    },
    {
     "from": "c59",
     "to": "c61",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/session-pipeline.ts",
     "line": 1200,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/session-pipeline.ts",
     "symbol": "processSessionEvents",
     "annotation": "Planned: session_v2 row → kind v2 (e.g. Maintain — … beta sessions)."
    },
    {
     "from": "c59",
     "to": "c63",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/session-pipeline.ts",
     "line": 1200,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/session-pipeline.ts",
     "symbol": "processSessionEvents",
     "annotation": "Planned: sessionMessagesToUniversalEvents maps user/tool/text parts."
    },
    {
     "from": "c63",
     "to": "c64",
     "mechanism": "feeds",
     "file": "packages/subsystems-core/src/opencode/pipeline.ts",
     "line": 85,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-core/src/opencode/pipeline.ts",
     "symbol": "accumulateEvents",
     "annotation": "Same accumulate path as V1 — panel format stays shared."
    },
    {
     "from": "c5",
     "to": "c66",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 668,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "buildSubsystemGraph",
     "annotation": "Renderer builds the graph before ELK lays it out."
    },
    {
     "from": "c66",
     "to": "c67",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/model.ts",
     "line": 1557,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
     "symbol": "buildBoundaryLayoutGroups",
     "annotation": "Assemble the package → process → module → leaf tree first."
    },
    {
     "from": "c67",
     "to": "c70",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/model.ts",
     "line": 812,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
     "symbol": "getSubsystemPackageRegions",
     "annotation": "Package regions decide the frames; keying these on workspace packages is the change."
    },
    {
     "from": "c70",
     "to": "c71",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/model.ts",
     "line": 763,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
     "symbol": "componentPackageKey",
     "annotation": "Per-component resolver: prefer the workspace-package lookup, fall back to purl repo key."
    },
    {
     "from": "c5",
     "to": "c65",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 668,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "buildSubsystemGraph",
     "annotation": "Ask for a component → workspace-package map before framing."
    },
    {
     "from": "c65",
     "to": "c73",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/package-layer-store.ts",
     "line": 429,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/package-layer-store.ts",
     "symbol": "getCachedPackageLayers",
     "annotation": "Host reads the cached slot for the model's repo purl."
    },
    {
     "from": "c65",
     "to": "c74",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/package-layer-store.ts",
     "line": 472,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/package-layer-store.ts",
     "symbol": "readEnsuredPackageLayers",
     "annotation": "Load PackageLayer[] and match each component file to its package."
    },
    {
     "from": "c75",
     "to": "c76",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/PackageLayersReposView.tsx",
     "line": 79,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/PackageLayersReposView.tsx",
     "symbol": "ensurePackageLayers",
     "annotation": "Ensure button: renderer asks the host to build layers for a repo purl."
    },
    {
     "from": "c72",
     "to": "c76",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/package-layer-store.ts",
     "line": 735,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/package-layer-store.ts",
     "symbol": "ensurePackageLayers",
     "annotation": "Batch helper iterates model purls — exists, but not yet wired to model open."
    },
    {
     "from": "c76",
     "to": "c77",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/package-layer-store.ts",
     "line": 602,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/package-layer-store.ts",
     "symbol": "runPackageLayerDiscover",
     "annotation": "On a cache miss, discover packages and write packages.json for the slot."
    },
    {
     "from": "c76",
     "to": "c78",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/package-layer-store.ts",
     "line": 524,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/package-layer-store.ts",
     "symbol": "dirtyFingerprint",
     "annotation": "Whole-tree dirty hash feeds the slot key today."
    },
    {
     "from": "c76",
     "to": "c79",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/package-layer-store.ts",
     "line": 525,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/package-layer-store.ts",
     "symbol": "cacheSlotKey",
     "annotation": "Slot = headSha + dirtyHash; a hit means no rebuild."
    },
    {
     "from": "c81",
     "to": "c72",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/package-layer-store.ts",
     "line": 735,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/package-layer-store.ts",
     "symbol": "ensurePackageLayers",
     "annotation": "Planned: model open runs the batch ensure per purl; a hit is free."
    },
    {
     "from": "c81",
     "to": "c80",
     "mechanism": "uses",
     "file": "packages/subsystems-studio/src/bun/package-layer-store.ts",
     "line": 696,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/package-layer-store.ts",
     "symbol": "ensureCurrentPackageCachesForModel",
     "annotation": "Proposed: gate rebuilds on a manifest-scoped fingerprint plus discovery version."
    },
    {
     "from": "c82",
     "to": "c83",
     "mechanism": "calls",
     "file": "site/src/pages/Gist.tsx",
     "line": 67,
     "purl": "pkg:github/principal-ai/subsystem-modeling#site/src/pages/Gist.tsx",
     "symbol": "Gist.load",
     "annotation": "Consumer lands on /gist?gist=... — the end of a Studio share."
    },
    {
     "from": "c83",
     "to": "c84",
     "mechanism": "calls",
     "file": "site/src/lib/gist.ts",
     "line": 154,
     "purl": "pkg:github/principal-ai/subsystem-modeling#site/src/lib/gist.ts",
     "symbol": "loadSubsystemModelFromGist",
     "annotation": "Only portable fields are shown — host gist refs never travel in the file."
    },
    {
     "from": "c82",
     "to": "c5",
     "mechanism": "uses",
     "file": "site/src/pages/Gist.tsx",
     "line": 184,
     "purl": "pkg:github/principal-ai/subsystem-modeling#site/src/pages/Gist.tsx",
     "symbol": "Gist",
     "annotation": "Render the shared model in the browser."
    },
    {
     "from": "c88",
     "to": "c43",
     "mechanism": "calls",
     "file": "packages/principal-studio-cli/src/commands/subsystem-model.ts",
     "line": 186,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/principal-studio-cli/src/commands/subsystem-model.ts",
     "symbol": "createAction",
     "annotation": "CLI/agent create path — always a new local sg- id today."
    },
    {
     "from": "c43",
     "to": "c90",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "line": 951,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "symbol": "createSubsystemModel",
     "annotation": "Mirror listing fields into _index.json."
    },
    {
     "from": "c88",
     "to": "c91",
     "mechanism": "calls",
     "file": "packages/principal-studio-cli/src/commands/subsystem-model.ts",
     "line": 205,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/principal-studio-cli/src/commands/subsystem-model.ts",
     "symbol": "createAction",
     "annotation": "Open the local model in Studio."
    },
    {
     "from": "c1",
     "to": "c96",
     "mechanism": "uses",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 258,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "SubsystemModelView",
     "annotation": "Mount SubsystemComponentGraph for a freshly loaded graph."
    },
    {
     "from": "c96",
     "to": "c97",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 383,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "Inner",
     "annotation": "Compute layoutKey from components and edges."
    },
    {
     "from": "c96",
     "to": "c66",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 407,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "Inner",
     "annotation": "Pass 1: buildSubsystemGraph without measured sizes."
    },
    {
     "from": "c96",
     "to": "c99",
     "mechanism": "uses",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 1484,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "Inner",
     "annotation": "Fresh mount: ReactFlow key is new, so nodes remount and measure."
    },
    {
     "from": "c98",
     "to": "c100",
     "mechanism": "feeds",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 754,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "Inner",
     "annotation": "dimensions changes fill measuredDimsRef."
    },
    {
     "from": "c96",
     "to": "c100",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 762,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "Inner",
     "annotation": "queueMicrotask triggers Pass 2 from onNodesChange."
    },
    {
     "from": "c100",
     "to": "c66",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 454,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "triggerPass2",
     "annotation": "Pass 2 re-runs buildSubsystemGraph with measured widths."
    },
    {
     "from": "c96",
     "to": "c101",
     "mechanism": "uses",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 1694,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "Inner",
     "annotation": "layoutReady true reveals GraphLayoutCover."
    },
    {
     "from": "c92",
     "to": "c89",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/http-server.ts",
     "line": 324,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/http-server.ts",
     "symbol": "handleSubsystemModelRequest",
     "annotation": "Agent PUT patches the open graph."
    },
    {
     "from": "c89",
     "to": "c93",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "line": 995,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "symbol": "updateSubsystemModel",
     "annotation": "Persist then emit reason updated."
    },
    {
     "from": "c94",
     "to": "c95",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2007,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "broadcastSubsystemModelChanged",
     "annotation": "Send subsystemModelChanged into the renderer."
    },
    {
     "from": "c95",
     "to": "c1",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/rpc.ts",
     "line": 95,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/rpc.ts",
     "symbol": "subsystemModelChangeSubscribers",
     "annotation": "Fan the push out to every subscribed tab."
    },
    {
     "from": "c1",
     "to": "c96",
     "mechanism": "uses",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 258,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "SubsystemModelView",
     "annotation": "Same Inner instance gets new components/edges props."
    },
    {
     "from": "c96",
     "to": "c98",
     "mechanism": "writes",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 416,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "Inner",
     "annotation": "Before: wiped measuredDimsRef; now only deletes removed leaf ids."
    },
    {
     "from": "c96",
     "to": "c66",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 407,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "Inner",
     "annotation": "Pass 1 rebuilds then setLayoutReady(false) drops the cover."
    },
    {
     "from": "c96",
     "to": "c101",
     "mechanism": "uses",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 1694,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "Inner",
     "annotation": "GraphLayoutCover stays up while layoutReady is false."
    },
    {
     "from": "c96",
     "to": "c99",
     "mechanism": "uses",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 1484,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "Inner",
     "annotation": "Same ids → ReactFlow key unchanged → no remount."
    },
    {
     "from": "c96",
     "to": "c100",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 762,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "Inner",
     "annotation": "Before: only dimensions path — no events → stuck forever."
    },
    {
     "from": "c92",
     "to": "c89",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/http-server.ts",
     "line": 324,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/http-server.ts",
     "symbol": "handleSubsystemModelRequest",
     "annotation": "Same live PUT into an open tab."
    },
    {
     "from": "c95",
     "to": "c1",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 69,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "SubsystemModelView",
     "annotation": "Tab reloads; Inner stays mounted."
    },
    {
     "from": "c96",
     "to": "c97",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 383,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "Inner",
     "annotation": "layoutKey changes; Pass 1 effect re-runs."
    },
    {
     "from": "c96",
     "to": "c98",
     "mechanism": "writes",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 416,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "Inner",
     "annotation": "Prune stale ids only — keep prior leaf measurements."
    },
    {
     "from": "c96",
     "to": "c66",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 407,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "Inner",
     "annotation": "Pass 1 still estimates; cover drops via setLayoutReady(false)."
    },
    {
     "from": "c96",
     "to": "c100",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 477,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "Inner",
     "annotation": "built effect queueMicrotasks triggerPass2 after Pass 1."
    },
    {
     "from": "c100",
     "to": "c98",
     "mechanism": "reads",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 436,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "triggerPass2",
     "annotation": "Pass 2 reads retained measuredDimsRef — no remount needed."
    },
    {
     "from": "c100",
     "to": "c66",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 454,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "triggerPass2",
     "annotation": "Measured ELK; .catch reveals on error."
    },
    {
     "from": "c96",
     "to": "c99",
     "mechanism": "uses",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 1484,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "Inner",
     "annotation": "ReactFlow still keyed on id sets only."
    },
    {
     "from": "c96",
     "to": "c101",
     "mechanism": "uses",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 1694,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "Inner",
     "annotation": "layoutReady true — cover fades; graph shows again."
    },
    {
     "from": "c22",
     "to": "c102",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "line": 1047,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "symbol": "refresh",
     "annotation": "Poll asks the host for the graph list via listSubsystemModels."
    },
    {
     "from": "c102",
     "to": "c19",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "line": 763,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "symbol": "listSubsystemModels",
     "annotation": "Host handler (bun/index.ts:2217) fans out over every index entry."
    },
    {
     "from": "c19",
     "to": "c20",
     "mechanism": "reads",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "line": 768,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "symbol": "getSubsystemModel",
     "annotation": "Each entry loads its full graph file (bun/index.ts:2221)."
    },
    {
     "from": "c19",
     "to": "c103",
     "mechanism": "reads",
     "file": "packages/subsystems-studio/src/bun/audit-report-store.ts",
     "line": 357,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/audit-report-store.ts",
     "symbol": "getSubsystemModelAuditListSummary",
     "annotation": "Each graph loads its saved audit summary for badges (bun/index.ts:2241)."
    },
    {
     "from": "c19",
     "to": "c104",
     "mechanism": "reads",
     "file": "packages/subsystems-studio/src/bun/proposal-store.ts",
     "line": 520,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/proposal-store.ts",
     "symbol": "pendingProposalCount",
     "annotation": "Each graph counts pending proposals for badges (bun/index.ts:2256)."
    },
    {
     "from": "c39",
     "to": "c19",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "line": 763,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "symbol": "listSubsystemModels",
     "annotation": "Audit pass lists every model (bun/index.ts:3118) then audits each, holding the single Bun host thread."
    },
    {
     "from": "c22",
     "to": "c102",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "line": 1047,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "symbol": "refresh",
     "annotation": "Ten-second poll fires while the host is busy and waits up to 30s (maxRequestTime in rpc.ts:106)."
    },
    {
     "from": "c22",
     "to": "c105",
     "mechanism": "produces",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "line": 1477,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "symbol": "SubsystemModelsView",
     "annotation": "Catch stores the timeout and the empty list renders the error panel."
    },
    {
     "from": "c5",
     "to": "c114",
     "mechanism": "uses",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 1776,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "SubsystemComponentGraph",
     "annotation": "Selected node opens ComponentDeclaration with the raw component."
    },
    {
     "from": "c114",
     "to": "c113",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/ComponentDeclaration.tsx",
     "line": 565,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/ComponentDeclaration.tsx",
     "symbol": "ComponentDeclaration",
     "annotation": "Panel tokenizes from the component, never remapping declaration."
    },
    {
     "from": "c113",
     "to": "c112",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/tokenizeComponent.ts",
     "line": 66,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/tokenizeComponent.ts",
     "symbol": "tokenizeComponent",
     "annotation": "Without wire tokens, generate a TypeScript declaration string."
    },
    {
     "from": "c112",
     "to": "c108",
     "mechanism": "reads",
     "file": "packages/subsystems-react/src/subsystem/formatDeclaration.ts",
     "line": 20,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/formatDeclaration.ts",
     "symbol": "generateDeclarationString",
     "annotation": "Reads component.detail only — authored schema declaration is invisible."
    },
    {
     "from": "c111",
     "to": "c108",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "line": 1428,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "symbol": "buildDetailFromAdoptedSignature",
     "annotation": "Audit adopt-signature writes verified detail onto the component."
    },
    {
     "from": "c110",
     "to": "c108",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "line": 486,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "symbol": "normalizeDetailProvenance",
     "annotation": "Store defaults provenance and backfills required detail arrays."
    },
    {
     "from": "c112",
     "to": "c108",
     "mechanism": "reads",
     "file": "packages/subsystems-react/src/subsystem/formatDeclaration.ts",
     "line": 20,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/formatDeclaration.ts",
     "symbol": "generateDeclarationString",
     "annotation": "Same renderer path — now detail is populated so the signature shows."
    },
    {
     "from": "c113",
     "to": "c112",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/tokenizeComponent.ts",
     "line": 66,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/tokenizeComponent.ts",
     "symbol": "tokenizeComponent",
     "annotation": "Format and tokenize the populated declaration string."
    },
    {
     "from": "c114",
     "to": "c113",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/ComponentDeclaration.tsx",
     "line": 565,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/ComponentDeclaration.tsx",
     "symbol": "ComponentDeclaration",
     "annotation": "Click panel paints the verified signature."
    },
    {
     "from": "c112",
     "to": "c107",
     "mechanism": "reads",
     "file": "packages/subsystems-core/src/types/subsystem-model.ts",
     "line": 224,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-core/src/types/subsystem-model.ts",
     "symbol": "SubsystemConstructDeclaration",
     "annotation": "Repoint generateDeclarationString at this union (and migrate capture into it)."
    },
    {
     "from": "c121",
     "to": "c122",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/OpencodeV2DebugView.tsx",
     "line": 22,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/OpencodeV2DebugView.tsx",
     "symbol": "OpencodeV2DebugView",
     "annotation": "Tab loads status over RPC getOpencodeV2Status."
    },
    {
     "from": "c122",
     "to": "c120",
     "mechanism": "reads",
     "file": "packages/subsystems-studio/src/bun/opencode-v2.ts",
     "line": 24,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2.ts",
     "symbol": "resolveOpencode2Bin",
     "annotation": "Detect opencode2 via OPENCODE2_BIN, PATH, or ~/.opencode/bin."
    },
    {
     "from": "c121",
     "to": "c123",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/OpencodeV2DebugView.tsx",
     "line": 66,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/OpencodeV2DebugView.tsx",
     "symbol": "OpencodeV2DebugView",
     "annotation": "Install button kicks installOpencodeV2 in the background."
    },
    {
     "from": "c115",
     "to": "c116",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/components/MaintainModelPickerModal.tsx",
     "line": 89,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/MaintainModelPickerModal.tsx",
     "symbol": "MaintainModelPickerModal",
     "annotation": "RPC maintainSubsystemModel kicks the host; UI returns as soon as the run is accepted."
    },
    {
     "from": "c116",
     "to": "c117",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2328,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "maintainSubsystemModelInBackground",
     "annotation": "Background task calls the Maintain orchestrator after broadcasting status running."
    },
    {
     "from": "c117",
     "to": "c118",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
     "line": 769,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
     "symbol": "maintainSubsystemModel",
     "annotation": "After runtime is ready, hand off the brief to the agent runner seam."
    },
    {
     "from": "c116",
     "to": "c124",
     "mechanism": "produces",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2325,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "maintainSubsystemModelInBackground",
     "annotation": "Host pushes subsystemModelMaintainChanged. StudioMessageSubscriber now types the payload; renderer subscription sites are the fan-out."
    },
    {
     "from": "c92",
     "to": "c119",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/http-server.ts",
     "line": 354,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/http-server.ts",
     "symbol": "handleSubsystemModelRequest",
     "annotation": "HTTP handler validates body and creates a pending proposal in the proposal store."
    },
    {
     "from": "c92",
     "to": "c124",
     "mechanism": "produces",
     "file": "packages/subsystems-studio/src/mainview/rpc.ts",
     "line": 71,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/rpc.ts",
     "symbol": "subsystemModelProposalsChangeSubscribers",
     "annotation": "HTTP onProposalsChanged dispatch lands on the contract type node — the fan-out bag is plumbing under the refactor."
    },
    {
     "from": "c125",
     "to": "c126",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 3681,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "closeTabById",
     "annotation": "Permanent tabs are rejected - Cmd+W never dismisses the fixed strip."
    },
    {
     "from": "c125",
     "to": "c127",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 3685,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "closeTabById",
     "annotation": "Delete the tab record from the host in-memory map."
    },
    {
     "from": "c125",
     "to": "c128",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 3692,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "closeTabById",
     "annotation": "Re-broadcast so every renderer view refreshes its tab list and picks a fallback."
    },
    {
     "from": "c128",
     "to": "c131",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/rpc.ts",
     "line": 111,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/rpc.ts",
     "symbol": "tabsChanged",
     "annotation": "Host pushes tabsChanged across the RPC bridge; the renderer handler fans it out to every subscriber."
    },
    {
     "from": "c131",
     "to": "c129",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/rpc.ts",
     "line": 111,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/rpc.ts",
     "symbol": "tabsChanged",
     "annotation": "App registered refresh callback runs, dropping the closed tab from local state."
    },
    {
     "from": "c129",
     "to": "c102",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/App.tsx",
     "line": 381,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/App.tsx",
     "symbol": "refresh",
     "annotation": "The shell asks the host for the current tab list."
    },
    {
     "from": "c102",
     "to": "c127",
     "mechanism": "reads",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 1678,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "listTabs",
     "annotation": "listTabs serializes the registry plus the resume suggestion; the shell re-derives its active tab."
    },
    {
     "from": "c129",
     "to": "c130",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/App.tsx",
     "line": 512,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/App.tsx",
     "symbol": "App",
     "annotation": "App wires its optimistic onClose into the strip - the X affordance invokes it with the clicked tab id."
    },
    {
     "from": "c129",
     "to": "c102",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/App.tsx",
     "line": 472,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/App.tsx",
     "symbol": "onClose",
     "annotation": "onClose drops the tab from local tabs and history and falls back the active tab first, then persists with closeTab; the next listTabs reconciles."
    },
    {
     "from": "c102",
     "to": "c125",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 1704,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "closeTab",
     "annotation": "The host closeTab handler funnels into the same closeTabById choke point Cmd+W uses."
    },
    {
     "from": "c125",
     "to": "c127",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 3685,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "closeTabById",
     "annotation": "Delete the tab record from the host in-memory map."
    },
    {
     "from": "c125",
     "to": "c128",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 3692,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "closeTabById",
     "annotation": "Re-broadcast so every renderer view refreshes; the optimistic shell state is reconciled here."
    },
    {
     "from": "c128",
     "to": "c131",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/rpc.ts",
     "line": 111,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/rpc.ts",
     "symbol": "tabsChanged",
     "annotation": "Same host notification, same renderer fan-out."
    },
    {
     "from": "c131",
     "to": "c129",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/rpc.ts",
     "line": 111,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/rpc.ts",
     "symbol": "tabsChanged",
     "annotation": "The shell refreshes via listTabs and restores the tab if the host rejected the close."
    },
    {
     "from": "c115",
     "to": "c134",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/components/MaintainModelPickerModal.tsx",
     "line": 116,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/MaintainModelPickerModal.tsx",
     "symbol": "MaintainModelPickerModal",
     "annotation": "Fire the maintainSubsystemModel RPC with the selected model."
    },
    {
     "from": "c134",
     "to": "c116",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2522,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "maintainSubsystemModelInBackground",
     "annotation": "RPC returns started:true immediately and hands off to the guarded runner."
    },
    {
     "from": "c116",
     "to": "c117",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 3160,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "maintainSubsystemModelInBackground",
     "annotation": "Run the full install → audit → route-by-verdict → brief pipeline."
    },
    {
     "from": "c117",
     "to": "c118",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
     "line": 854,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
     "symbol": "runMaintainAgent",
     "annotation": "Resolve the model then launch the agent run, retrying once on the credentialed fallback if unusable."
    },
    {
     "from": "c118",
     "to": "c60",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
     "line": 742,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
     "symbol": "runOpencodeV2AgentSession",
     "annotation": "Hand the brief, agent, and directory to the V2 session runner."
    },
    {
     "from": "c116",
     "to": "c141",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 3164,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "maintainSubsystemModelInBackground",
     "annotation": "Open the live feed tab the instant the session id exists."
    },
    {
     "from": "c60",
     "to": "c136",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
     "line": 355,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2-live.ts",
     "symbol": "runOpencodeV2AgentSession",
     "annotation": "Open the /api/event subscription before creating the session."
    },
    {
     "from": "c60",
     "to": "c135",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
     "line": 326,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2-live.ts",
     "symbol": "runOpencodeV2AgentSession",
     "annotation": "Ensure the opencode2 daemon is healthy, starting the service if it is not."
    },
    {
     "from": "c136",
     "to": "c137",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
     "line": 365,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2-live.ts",
     "symbol": "readSse",
     "annotation": "Flag sawTerminal when the event is an execution finish or session idle."
    },
    {
     "from": "c137",
     "to": "c60",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
     "line": 469,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2-live.ts",
     "symbol": "runOpencodeV2AgentSession",
     "annotation": "Wait loop polls every 400ms until sawTerminal or the 15-minute deadline."
    },
    {
     "from": "c60",
     "to": "c139",
     "mechanism": "reads",
     "file": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
     "line": 484,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2-live.ts",
     "symbol": "runOpencodeV2AgentSession",
     "annotation": "Confirm the model's first tool call landed the liveness probe; abort as unusable on timeout."
    },
    {
     "from": "c60",
     "to": "c138",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
     "line": 529,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2-live.ts",
     "symbol": "runOpencodeV2AgentSession",
     "annotation": "Stamp the feed done (or error) when the wait loop exits."
    },
    {
     "from": "c116",
     "to": "c115",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 3187,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "maintainSubsystemModelInBackground",
     "annotation": "Broadcast done/error so the Maintain row flips off Running."
    },
    {
     "from": "c140",
     "to": "c139",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/http-server.ts",
     "line": 318,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/http-server.ts",
     "symbol": "getMaintainerProbeRegistry",
     "annotation": "mark(runId) records when the probe landed."
    },
    {
     "from": "c60",
     "to": "c139",
     "mechanism": "reads",
     "file": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
     "line": 484,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2-live.ts",
     "symbol": "runOpencodeV2AgentSession",
     "annotation": "Each loop tick checks whether the token landed before the probe deadline."
    },
    {
     "from": "c11",
     "to": "c12",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 424,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "SubsystemComponentGraph",
     "annotation": "Document change triggers buildSubsystemGraph."
    },
    {
     "from": "c12",
     "to": "c14",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/model.ts",
     "line": 936,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
     "symbol": "buildSubsystemGraph",
     "annotation": "Leaves first — convertSubsystemToNodes stamps parentId."
    },
    {
     "from": "c14",
     "to": "c143",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/model.ts",
     "line": 834,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
     "symbol": "convertSubsystemToNodes",
     "annotation": "If module is set, parentId is module:… — process is ignored for the leaf."
    },
    {
     "from": "c12",
     "to": "c15",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/model.ts",
     "line": 942,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
     "symbol": "buildSubsystemGraph",
     "annotation": "Collect process regions (multi-member only after filter)."
    },
    {
     "from": "c12",
     "to": "c16",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/model.ts",
     "line": 943,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
     "symbol": "buildSubsystemGraph",
     "annotation": "Collect module regions — flat list merged with process regions."
    },
    {
     "from": "c12",
     "to": "c142",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/model.ts",
     "line": 1019,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
     "symbol": "buildSubsystemGraph",
     "annotation": "Each region becomes a flat ELK group id via boundaryGroupNodeId."
    },
    {
     "from": "c12",
     "to": "c17",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/model.ts",
     "line": 1009,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
     "symbol": "buildSubsystemGraph",
     "annotation": "computeElkLayout gets a flat groups[] — one parent level only."
    },
    {
     "from": "c11",
     "to": "c18",
     "mechanism": "uses",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 178,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "SubsystemComponentGraph",
     "annotation": "RF registers SubsystemGroupNode for type subsystem-group."
    },
    {
     "from": "c14",
     "to": "c144",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/model.ts",
     "line": 836,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
     "symbol": "convertSubsystemToNodes",
     "annotation": "Today process parentId only applies when module is absent. Nesting needs module group parentId = process:…."
    },
    {
     "from": "c17",
     "to": "c146",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/utils/elkLayout.ts",
     "line": 535,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/utils/elkLayout.ts",
     "symbol": "computeElkLayout",
     "annotation": "elkParents are siblings under root. Nesting would push module parents into process children and recurse groupBounds."
    },
    {
     "from": "c117",
     "to": "c0",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
     "line": 824,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
     "symbol": "auditSubsystemModel",
     "annotation": "Deterministic audit decides whether the agent should run. A runId is minted here and threaded through the whole session."
    },
    {
     "from": "c117",
     "to": "c147",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
     "line": 878,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
     "symbol": "buildMaintainBrief",
     "annotation": "Seam A: brief + propose curl built. Drop the runId into the brief so it rides to the agent."
    },
    {
     "from": "c117",
     "to": "c148",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
     "line": 892,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
     "symbol": "noteSubsystemModelRunStart",
     "annotation": "Session start logged: sessionId <-> graphId paired, pendingCount snapshot. The run record is where runId lives."
    },
    {
     "from": "c117",
     "to": "c148",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
     "line": 908,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
     "symbol": "noteSubsystemModelRunFinish",
     "annotation": "Seam C: session close-out backfills the run with the proposalIds created during the session."
    },
    {
     "from": "c150",
     "to": "c149",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/http-server.ts",
     "line": 404,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/http-server.ts",
     "symbol": "proposeSubsystemModelCorrection",
     "annotation": "RPC handler forwards body; runId must be forwarded explicitly (RPC currently drops it)."
    },
    {
     "from": "c149",
     "to": "c119",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2493,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "createSubsystemModelProposal",
     "annotation": "Seam B: stamp runId onto the stored proposal so it can be matched back to its run."
    },
    {
     "from": "c1",
     "to": "c5",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 291,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "SubsystemModelView",
     "annotation": "Host injects the path-keyed file viewer and readFile closure into the graph."
    },
    {
     "from": "c5",
     "to": "c151",
     "mechanism": "feeds",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 2198,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "FileDrawer",
     "annotation": "A file click sets the drawer target; the shared bottom FileDrawer animates open and re-tags nodes so the open file's components spotlight."
    },
    {
     "from": "c1",
     "to": "c152",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 160,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "renderFileViewer",
     "annotation": "renderFileViewer mounts the full-file viewer, or PierreSnippetView when a declaration line is given."
    },
    {
     "from": "c114",
     "to": "c5",
     "mechanism": "feeds",
     "file": "packages/subsystems-react/src/subsystem/ComponentDeclaration.tsx",
     "line": 404,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/ComponentDeclaration.tsx",
     "symbol": "ComponentDeclaration",
     "annotation": "Clicking the declaration panel's file badge (or L# chip) calls onOpenFile(file, { startLine })."
    },
    {
     "from": "c5",
     "to": "c151",
     "mechanism": "feeds",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 1155,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "onOpenDeclarationFile",
     "annotation": "onOpenDeclarationFile sets the drawer target; clicking the same file+line again toggles it closed."
    },
    {
     "from": "c1",
     "to": "c153",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 165,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "renderFileViewer",
     "annotation": "With a start line the drawer renders a focused snippet with 40 lines of context instead of the whole file."
    },
    {
     "from": "c152",
     "to": "c154",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/pierre/PierreFileView.tsx",
     "line": 61,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/pierre/PierreFileView.tsx",
     "symbol": "PierreFileView",
     "annotation": "Viewer calls the host readFile closure for this path."
    },
    {
     "from": "c154",
     "to": "c20",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 1558,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "readFile",
     "annotation": "A legacy bare-path open re-reads and JSON-parses the entire graph record to find the owning checkout, because the host caches nothing."
    },
    {
     "from": "c154",
     "to": "c155",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 1547,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "readFile",
     "annotation": "Handler resolves the repo-relative path under the graph's root and rejects traversal."
    },
    {
     "from": "c5",
     "to": "c157",
     "mechanism": "uses",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 1695,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "SubsystemComponentGraph",
     "annotation": "Replace the inline walkthroughs.map list with <WalkthroughsPanel/>, passing order, expansion, and focus props."
    },
    {
     "from": "c157",
     "to": "c156",
     "mechanism": "uses",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 2223,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "WalkthroughFlow",
     "annotation": "The panel renders one WalkthroughFlow per row and forwards its focus/hover callbacks."
    },
    {
     "from": "c157",
     "to": "c158",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 1695,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "SubsystemComponentGraph",
     "annotation": "Panel hosts the reorder controller directly beside the list it reorders."
    },
    {
     "from": "c156",
     "to": "c158",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 2223,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "WalkthroughFlow",
     "annotation": "New drag-handle props on the row report the drag source index on pointer-down."
    },
    {
     "from": "c158",
     "to": "c159",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 1695,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "WalkthroughsPanel",
     "annotation": "On drop, build the next order from the source and target indices."
    },
    {
     "from": "c158",
     "to": "c1",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 1695,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "WalkthroughsPanel",
     "annotation": "Invoke the new onReorderWalkthroughs callback so the host owns the array."
    },
    {
     "from": "c1",
     "to": "c160",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 58,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "SubsystemModelView",
     "annotation": "The reorder handler sets local state first, then sends the walkthroughs patch."
    },
    {
     "from": "c160",
     "to": "c89",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 44,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "updateSubsystemModel",
     "annotation": "A new request handler delegates the patch to the imported store function, which merges it verbatim."
    },
    {
     "from": "c89",
     "to": "c93",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "line": 833,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "symbol": "emitSubsystemModelChange",
     "annotation": "After the JSON write, the store emits subsystemModelChanged."
    },
    {
     "from": "c93",
     "to": "c1",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "line": 78,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "symbol": "emitSubsystemModelChange",
     "annotation": "The push reaches the open tab, which reloads the model and re-renders the flows panel in the new order."
    },
    {
     "from": "c93",
     "to": "c22",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "line": 78,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "symbol": "emitSubsystemModelChange",
     "annotation": "The list view reloads on the same push so its walkthrough rows re-order too."
    },
    {
     "from": "c22",
     "to": "c44",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "line": 1266,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "symbol": "readPreviewFile",
     "annotation": "Preview calls readSubsystemFile with purl plus file; host resolves root straight from purl (bun/index.ts:1705) with no component lookup."
    },
    {
     "from": "c44",
     "to": "c163",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "line": 407,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "symbol": "resolveRepoRootForComponent",
     "annotation": "Root resolution strips the purl to its repo key and looks up the Alexandria checkout."
    },
    {
     "from": "c161",
     "to": "c162",
     "mechanism": "reads",
     "file": "packages/subsystems-react/src/pierre/PierreWalkthroughCodeView.tsx",
     "line": 137,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/pierre/PierreWalkthroughCodeView.tsx",
     "symbol": "PierreWalkthroughCodeView",
     "annotation": "Code view reads every step file by bare path only, fanning out over the distinct step files."
    },
    {
     "from": "c162",
     "to": "c20",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/rpc.ts",
     "line": 160,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/rpc.ts",
     "symbol": "callReadFile",
     "annotation": "Bridge forwards tab plus path to the host readFile handler (bun/index.ts:1716)."
    },
    {
     "from": "c20",
     "to": "c44",
     "mechanism": "reads",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "line": 768,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "symbol": "getSubsystemModel",
     "annotation": "Host loads the graph and finds the component with c.file equal to path (bun/index.ts:1723-1728); no match yields graph has no local root for this file, a match resolves the root from the component purl."
    },
    {
     "from": "c22",
     "to": "c91",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "line": 981,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "symbol": "onOpen",
     "annotation": "Row click fires openSubsystemModel RPC; host takes the zero-IO focus path."
    },
    {
     "from": "c91",
     "to": "c1",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 1018,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "openSubsystemModelTab",
     "annotation": "Host broadcasts focus before any disk IO so the tab switches instantly."
    },
    {
     "from": "c91",
     "to": "c164",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 1019,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "openSubsystemModelTab",
     "annotation": "Background fire-and-forget: stamp lastOpenedAt after broadcast."
    },
    {
     "from": "c164",
     "to": "c20",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "line": 829,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "symbol": "touchSubsystemModelOpened",
     "annotation": "Stamp path re-reads the graph file, then writes record plus index."
    },
    {
     "from": "c1",
     "to": "c20",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 79,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "SubsystemModelView",
     "annotation": "Remount fetches the full graph over the bridge."
    },
    {
     "from": "c1",
     "to": "c5",
     "mechanism": "uses",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 377,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "SubsystemModelView",
     "annotation": "Detail mounts the React Flow graph with full components and edges."
    },
    {
     "from": "c5",
     "to": "c66",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 537,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "SubsystemComponentGraph",
     "annotation": "Graph runs pass 1 ELK layout with estimated node sizes."
    },
    {
     "from": "c66",
     "to": "c165",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/model.ts",
     "line": 1408,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/model.ts",
     "symbol": "buildSubsystemGraph",
     "annotation": "Builder runs orthogonal ELK on the main thread."
    },
    {
     "from": "c5",
     "to": "c101",
     "mechanism": "uses",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 2122,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "SubsystemComponentGraph",
     "annotation": "Cover stays opaque 650ms after layout ready plus 200ms fade."
    },
    {
     "from": "c22",
     "to": "c91",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "line": 981,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "symbol": "onOpen",
     "annotation": "Row click fires RPC; host resolves title from the small index file."
    },
    {
     "from": "c91",
     "to": "c127",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 1051,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "openSubsystemModelTab",
     "annotation": "Host creates tab from index title, no full graph read."
    },
    {
     "from": "c91",
     "to": "c129",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 1054,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "openSubsystemModelTab",
     "annotation": "Host broadcasts focus immediately; stamp moves to background."
    },
    {
     "from": "c129",
     "to": "c1",
     "mechanism": "uses",
     "file": "packages/subsystems-studio/src/mainview/App.tsx",
     "line": 303,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/App.tsx",
     "symbol": "App",
     "annotation": "Renderer switches tab and mounts detail view without waiting."
    },
    {
     "from": "c1",
     "to": "c105",
     "mechanism": "uses",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 361,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "SubsystemModelView",
     "annotation": "Detail shows Loading placeholder while graph fetches."
    },
    {
     "from": "c1",
     "to": "c20",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 79,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "SubsystemModelView",
     "annotation": "Detail fetches full graph in background and fills in on arrival."
    },
    {
     "from": "c91",
     "to": "c164",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 1057,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "openSubsystemModelTab",
     "annotation": "Background fire-and-forget: stamp lastOpenedAt after broadcast."
    },
    {
     "from": "c1",
     "to": "c5",
     "mechanism": "uses",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 377,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "SubsystemModelView",
     "annotation": "Once loaded, detail mounts graph canvas; tab already visible."
    },
    {
     "from": "c92",
     "to": "c166",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/http-server.ts",
     "line": 337,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/http-server.ts",
     "symbol": "handleSubsystemModelRequest",
     "annotation": "Reject an invalid document before anything is persisted."
    },
    {
     "from": "c92",
     "to": "c168",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/http-server.ts",
     "line": 341,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/http-server.ts",
     "symbol": "handleSubsystemModelRequest",
     "annotation": "Hand any supplied roots to the registry."
    },
    {
     "from": "c168",
     "to": "c169",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/http-server.ts",
     "line": 132,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/http-server.ts",
     "symbol": "registerSuppliedRoots",
     "annotation": "Learn the roots into Alexandria, not the record."
    },
    {
     "from": "c92",
     "to": "c43",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/http-server.ts",
     "line": 343,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/http-server.ts",
     "symbol": "handleSubsystemModelRequest",
     "annotation": "Persist the validated document."
    },
    {
     "from": "c43",
     "to": "c35",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "line": 817,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "symbol": "createSubsystemModel",
     "annotation": "Stamp verification before the record hits disk."
    },
    {
     "from": "c35",
     "to": "c44",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "line": 507,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "symbol": "verifyModelFiles",
     "annotation": "Resolve each component's checkout from its purl."
    },
    {
     "from": "c44",
     "to": "c171",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "line": 430,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "symbol": "resolveRepoRootForComponent",
     "annotation": "Delegate the purl lookup to the registry."
    },
    {
     "from": "c22",
     "to": "c19",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "line": 1110,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "symbol": "refresh",
     "annotation": "Renderer asks the host for the model list over RPC."
    },
    {
     "from": "c19",
     "to": "c20",
     "mechanism": "reads",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 1892,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "listSubsystemModels",
     "annotation": "The host handler reads each record to build a summary."
    },
    {
     "from": "c20",
     "to": "c172",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 1939,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "githubReposFromComponents",
     "annotation": "Derive each model's repos from its component purls — no stored repo field."
    },
    {
     "from": "c172",
     "to": "c24",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "line": 821,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "symbol": "buildRepoGroups",
     "annotation": "Group models into repo cards from the derived repos."
    },
    {
     "from": "c0",
     "to": "c173",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "line": 1343,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "symbol": "auditSubsystemModel",
     "annotation": "Ask which component purls have a current graphify cache."
    },
    {
     "from": "c173",
     "to": "c170",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/graphify-store.ts",
     "line": 964,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/graphify-store.ts",
     "symbol": "assessSubsystemGraphifyReadiness",
     "annotation": "Resolve each purl's checkout to key the cache slot."
    },
    {
     "from": "c170",
     "to": "c171",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/graphify-store.ts",
     "line": 336,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/graphify-store.ts",
     "symbol": "resolveRepoRootForPurl",
     "annotation": "Same registry lookup the write path uses."
    },
    {
     "from": "c0",
     "to": "c119",
     "mechanism": "produces",
     "file": "packages/subsystems-studio/src/bun/proposal-store.ts",
     "line": 607,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/proposal-store.ts",
     "symbol": "createSubsystemModelProposal",
     "annotation": "Audit findings drive an agent-proposed correction; the change list targets component ids (and topology endpoints)."
    },
    {
     "from": "c119",
     "to": "c174",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/bun/proposal-store.ts",
     "line": 647,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/proposal-store.ts",
     "symbol": "acceptSubsystemModelProposal",
     "annotation": "An accepted proposal rewrites the model by component id — ids are the binding key."
    },
    {
     "from": "c0",
     "to": "c175",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "line": 1372,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "symbol": "applySubsystemModelAuditFix",
     "annotation": "A fix adopts graphify signature / file / declaration-ref onto the targeted componentId."
    },
    {
     "from": "c175",
     "to": "c20",
     "mechanism": "reads",
     "file": "packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "line": 1396,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/verify-subsystem-component.ts",
     "symbol": "applySubsystemModelAuditFix",
     "annotation": "Re-reads the record and rewrites the component that owns the id."
    },
    {
     "from": "c20",
     "to": "c176",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/excalidraw/subsystemToExcalidraw.ts",
     "line": 152,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/excalidraw/subsystemToExcalidraw.ts",
     "symbol": "principalMetaForComponent",
     "annotation": "Each component carries its id onto its element so the scene holds the model's identity."
    },
    {
     "from": "c176",
     "to": "c177",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/excalidraw/excalidrawToSubsystem.ts",
     "line": 140,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/excalidraw/excalidrawToSubsystem.ts",
     "symbol": "excalidrawSceneToSubsystemModel",
     "annotation": "The edited scene becomes a document again; ids ride through the metadata verbatim."
    },
    {
     "from": "c20",
     "to": "c29",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 1876,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "getComposedSubsystemModel",
     "annotation": "Reads every model touching a repo-key (proposed — this is the compose flow this model is the brief for)."
    },
    {
     "from": "c117",
     "to": "c0",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
     "line": 824,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
     "symbol": "auditSubsystemModel",
     "annotation": "Deterministic audit decides whether the agent should run. A runId is minted here and threaded through the whole session."
    },
    {
     "from": "c117",
     "to": "c147",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
     "line": 878,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
     "symbol": "buildMaintainBrief",
     "annotation": "Seam A: brief + propose curl built. Drop the runId into the brief so it rides to the agent."
    },
    {
     "from": "c117",
     "to": "c148",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
     "line": 892,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
     "symbol": "noteSubsystemModelRunStart",
     "annotation": "Session start logged: sessionId <-> graphId paired, pendingCount snapshot. The run record is where runId lives."
    },
    {
     "from": "c117",
     "to": "c148",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
     "line": 908,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
     "symbol": "noteSubsystemModelRunFinish",
     "annotation": "Seam C: session close-out backfills the run with the proposalIds created during the session."
    },
    {
     "from": "c150",
     "to": "c149",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/http-server.ts",
     "line": 404,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/http-server.ts",
     "symbol": "proposeSubsystemModelCorrection",
     "annotation": "RPC handler forwards body; runId must be forwarded explicitly (RPC currently drops it)."
    },
    {
     "from": "c149",
     "to": "c119",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2493,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "createSubsystemModelProposal",
     "annotation": "Seam B: stamp runId onto the stored proposal so it can be matched back to its run."
    },
    {
     "from": "c178",
     "to": "c181",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 1406,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "probeOpencodeServer",
     "annotation": "RPC getOpencodeServerStatus delegates to probeOpencodeServer."
    },
    {
     "from": "c181",
     "to": "c180",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/server-sessions.ts",
     "line": 104,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/server-sessions.ts",
     "symbol": "probeOpencodeServer",
     "annotation": "Resolve the on-disk registration before probing health."
    },
    {
     "from": "c179",
     "to": "c183",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/components/ServerSessionsModal.tsx",
     "line": 102,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/ServerSessionsModal.tsx",
     "symbol": "ServerSessionsModal",
     "annotation": "Enable the host SSE watch when the modal mounts."
    },
    {
     "from": "c179",
     "to": "c182",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 1407,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "listRecentServerSessions",
     "annotation": "RPC getServerSessions delegates to listRecentServerSessions."
    },
    {
     "from": "c55",
     "to": "c184",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 1286,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "buildSessionIndex",
     "annotation": "listSessions RPC builds the recent-window index from opencode.db."
    },
    {
     "from": "c59",
     "to": "c62",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/session-pipeline.ts",
     "line": 1310,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/session-pipeline.ts",
     "symbol": "processSessionEvents",
     "annotation": "Convert raw OpenCode rows into universal events before normalize/accumulate."
    },
    {
     "from": "c55",
     "to": "c185",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 1961,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "analyzeSessionInBackground",
     "annotation": "analyzeSession RPC starts background extraction for a new analysis id."
    },
    {
     "from": "c185",
     "to": "c59",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2151,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "analyzeSessionInBackground",
     "annotation": "Background job loads the session timeline then segments beats."
    },
    {
     "from": "c185",
     "to": "c186",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2166,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "analyzeSessionInBackground",
     "annotation": "Segment the timeline into host-computed beats for the brief."
    },
    {
     "from": "c185",
     "to": "c187",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2177,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "analyzeSessionInBackground",
     "annotation": "Hand the brief to runOpenCodeExtraction in the background."
    },
    {
     "from": "c188",
     "to": "c5",
     "mechanism": "feeds",
     "file": "packages/subsystems-react/src/subsystem/WalkthroughsPanel.tsx",
     "line": 335,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/WalkthroughsPanel.tsx",
     "symbol": "WalkthroughsPanel",
     "annotation": "Clicking a step focuses that hop and requests the drawer."
    },
    {
     "from": "c5",
     "to": "c151",
     "mechanism": "feeds",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 2294,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "FileDrawer",
     "annotation": "The bottom FileDrawer animates open to host the focused flow's snippets."
    },
    {
     "from": "c5",
     "to": "c1",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 2303,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "SubsystemComponentGraph",
     "annotation": "The graph invokes the host-injected walkthrough renderer, handing it the per-step resolver and the click handler."
    },
    {
     "from": "c1",
     "to": "c161",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 222,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "renderWalkthroughViewer",
     "annotation": "The Studio host forwards resolveSymbol / onSymbolClick straight into PierreWalkthroughCodeView."
    },
    {
     "from": "c161",
     "to": "c5",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/pierre/PierreWalkthroughCodeView.tsx",
     "line": 482,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/pierre/PierreWalkthroughCodeView.tsx",
     "symbol": "onTokenClick",
     "annotation": "The view resolves the token against the step's from/to constructs and invokes the graph's click handler with the alias."
    },
    {
     "from": "c5",
     "to": "c151",
     "mechanism": "feeds",
     "file": "packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "line": 1667,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx",
     "symbol": "openConstructDeclaration",
     "annotation": "openConstructDeclaration opens the component's file at declarationRef.startLine (file top when unanchored)."
    },
    {
     "from": "c1",
     "to": "c153",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "line": 165,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx",
     "symbol": "renderFileViewer",
     "annotation": "Studio's renderFileViewer mounts a focused snippet at that declaration line."
    },
    {
     "from": "c200",
     "to": "c189",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2025,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "getMaintenanceOverview",
     "annotation": "Attach a snapshot per row, reusing the record this handler already fetched."
    },
    {
     "from": "c189",
     "to": "c190",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/purl-commits.ts",
     "line": 283,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/purl-commits.ts",
     "symbol": "modelProvenance",
     "annotation": "Narrow every probe to the files this model actually anchors to."
    },
    {
     "from": "c189",
     "to": "c191",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/purl-commits.ts",
     "line": 312,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/purl-commits.ts",
     "symbol": "modelProvenance",
     "annotation": "Ask whether anything anchored moved, not merely whether the repo did."
    },
    {
     "from": "c189",
     "to": "c192",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/purl-commits.ts",
     "line": 314,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/purl-commits.ts",
     "symbol": "modelProvenance",
     "annotation": "Separate uncommitted edits from committed ones; they owe different amounts."
    },
    {
     "from": "c189",
     "to": "c193",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/purl-commits.ts",
     "line": 317,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/purl-commits.ts",
     "symbol": "modelProvenance",
     "annotation": "Add how far the checkout moved, suppressed when a rebase orphaned the pin."
    },
    {
     "from": "c200",
     "to": "c198",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2035,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "getMaintenanceOverview",
     "annotation": "Offer the pin forward on the same pass that measured the drift."
    },
    {
     "from": "c198",
     "to": "c197",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/purl-commits.ts",
     "line": 381,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/purl-commits.ts",
     "symbol": "planAutoRePin",
     "annotation": "Promote only where the anchor diff came back empty and was actually measured."
    },
    {
     "from": "c198",
     "to": "c199",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 3394,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "applyAutoRePin",
     "annotation": "Persist the new pins without touching updatedAt, or every stored audit reads stale."
    },
    {
     "from": "c202",
     "to": "c201",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/MaintenancePanel.tsx",
     "line": 476,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/MaintenancePanel.tsx",
     "symbol": "MaintenancePanel",
     "annotation": "Fetch once per model the first time a strip opens, mirroring run-history expansion."
    },
    {
     "from": "c201",
     "to": "c196",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2152,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "getModelProvenanceDetail",
     "annotation": "Recompute the cheap snapshot first so the re-pin decision has its evidence."
    },
    {
     "from": "c196",
     "to": "c194",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/purl-commits.ts",
     "line": 430,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/purl-commits.ts",
     "symbol": "modelProvenanceDetail",
     "annotation": "Walk the range so each dot can say whether it touched an anchor."
    },
    {
     "from": "c196",
     "to": "c195",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/purl-commits.ts",
     "line": 431,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/purl-commits.ts",
     "symbol": "modelProvenanceDetail",
     "annotation": "Place the remote on the walk; a remote outside the window means all shown is unpushed."
    },
    {
     "from": "c202",
     "to": "c203",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/components/MaintenanceModelList.tsx",
     "line": 1122,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/MaintenanceModelList.tsx",
     "symbol": "MaintenanceModelList",
     "annotation": "Fold the two tiers per purl before handing the row its props."
    },
    {
     "from": "c203",
     "to": "c205",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/components/ModelProvenance.tsx",
     "line": 1010,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/ModelProvenance.tsx",
     "symbol": "CommitDots",
     "annotation": "Render the timeline with the remote outlined and its exclusive commits hollow."
    },
    {
     "from": "c210",
     "to": "c115",
     "mechanism": "uses",
     "file": "packages/subsystems-studio/src/mainview/components/MaintenanceAgentModal.tsx",
     "line": 1222,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/MaintenanceAgentModal.tsx",
     "symbol": "MaintenancePanel",
     "annotation": "A model's Run maintenance opens the model picker."
    },
    {
     "from": "c115",
     "to": "c117",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/components/MaintainModelPickerModal.tsx",
     "line": 147,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/MaintainModelPickerModal.tsx",
     "symbol": "MaintainModelPickerModal",
     "annotation": "RPC start — the host routes by the audit verdict."
    },
    {
     "from": "c117",
     "to": "c0",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
     "line": 820,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
     "symbol": "maintainSubsystemModel",
     "annotation": "Deterministic audit picks issue-fixer vs gap-filler vs topology agent."
    },
    {
     "from": "c117",
     "to": "c118",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
     "line": 854,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
     "symbol": "maintainSubsystemModel",
     "annotation": "Builds the brief and hands it to the agent."
    },
    {
     "from": "c118",
     "to": "c60",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
     "line": 742,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
     "symbol": "runMaintainAgent",
     "annotation": "OpenCode V2 session is created and prompted."
    },
    {
     "from": "c60",
     "to": "c118",
     "mechanism": "produces",
     "file": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
     "line": 535,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2-live.ts",
     "symbol": "runOpencodeV2AgentSession",
     "annotation": "The create response yields the session id to the host; the graphId it was called with is already in hand."
    },
    {
     "from": "c60",
     "to": "c207",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/opencode-v2-live.ts",
     "line": 547,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/opencode-v2-live.ts",
     "symbol": "upsertFeed",
     "annotation": "Feed state is created with graphId in memory."
    },
    {
     "from": "c208",
     "to": "c210",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 3318,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "ensureLiveFeedBroadcast",
     "annotation": "Every snapshot is re-broadcast with graphId to the renderer."
    },
    {
     "from": "c210",
     "to": "c207",
     "mechanism": "watches",
     "file": "packages/subsystems-studio/src/mainview/components/MaintenanceAgentModal.tsx",
     "line": 417,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/MaintenanceAgentModal.tsx",
     "symbol": "MaintenancePanel",
     "annotation": "Panel keys progress by graphId; the association dies with the process."
    },
    {
     "from": "c55",
     "to": "c57",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/AgentSessions.tsx",
     "line": 661,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/AgentSessions.tsx",
     "symbol": "AgentSessionsOverviewView",
     "annotation": "Maintenance Sessions tab lists runs by title and agent only."
    },
    {
     "from": "c57",
     "to": "c209",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/maintain-sessions.ts",
     "line": 70,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-sessions.ts",
     "symbol": "rowToSummary",
     "annotation": "A title LIKE Maintain% / agent stamp decides inclusion — no model id."
    },
    {
     "from": "c60",
     "to": "c214",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-runs.ts",
     "line": 1,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-runs.ts",
     "symbol": "SubsystemModelRunStore",
     "annotation": "The create response yields the session id; the host pairs it with the graphId it already holds and writes the log."
    },
    {
     "from": "c214",
     "to": "c215",
     "mechanism": "reads",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-runs.ts",
     "line": 1,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-runs.ts",
     "symbol": "listSubsystemModelRuns",
     "annotation": "The per-model log becomes the durable source of recent runs."
    },
    {
     "from": "c22",
     "to": "c215",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "line": 795,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "symbol": "SubsystemModelsView",
     "annotation": "Poll run summaries alongside the model list."
    },
    {
     "from": "c22",
     "to": "c216",
     "mechanism": "uses",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "line": 1240,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "symbol": "SubsystemModelsView",
     "annotation": "Expanded row renders the run list next to today's walkthroughs."
    },
    {
     "from": "c216",
     "to": "c211",
     "mechanism": "calls",
     "file": "packages/subsystems-react/src/components/session-events/SessionEventFeed.tsx",
     "line": 1655,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-react/src/components/session-events/SessionEventFeed.tsx",
     "symbol": "copyRowContext",
     "annotation": "Copy each run's session context in the agent-sessions format."
    },
    {
     "from": "c119",
     "to": "c218",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/proposal-store.ts",
     "line": 554,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/proposal-store.ts",
     "symbol": "createSubsystemModelProposal",
     "annotation": "Persist pending then score async without blocking propose."
    },
    {
     "from": "c218",
     "to": "c219",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/components/ProposalsModal.tsx",
     "line": 49,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/ProposalsModal.tsx",
     "symbol": "listSubsystemModelProposals",
     "annotation": "Show Jev verdict and confidence as second opinion badge."
    },
    {
     "from": "c117",
     "to": "c0",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
     "line": 790,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
     "symbol": "auditSubsystemModel",
     "annotation": "Run deterministic audit before any proposal work."
    },
    {
     "from": "c119",
     "to": "c218",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/proposal-store.ts",
     "line": 554,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/proposal-store.ts",
     "symbol": "createSubsystemModelProposal",
     "annotation": "Persist the agent correction as pending."
    },
    {
     "from": "c218",
     "to": "c174",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/proposal-store.ts",
     "line": 612,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/proposal-store.ts",
     "symbol": "acceptSubsystemModelProposal",
     "annotation": "High confidence applies the patch without waiting for a human click."
    },
    {
     "from": "c220",
     "to": "c221",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/mainview/components/SettingsModal.tsx",
     "line": 260,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/SettingsModal.tsx",
     "symbol": "setSettings",
     "annotation": "Threshold toggle is saved through the host settings RPC."
    },
    {
     "from": "c221",
     "to": "c218",
     "mechanism": "reads",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2495,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "proposeSubsystemModelCorrection",
     "annotation": "Gate reads the stored threshold before deciding to auto-accept."
    },
    {
     "from": "c218",
     "to": "c174",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/proposal-store.ts",
     "line": 612,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/proposal-store.ts",
     "symbol": "acceptSubsystemModelProposal",
     "annotation": "Confidence at or above the threshold applies the proposal automatically."
    },
    {
     "from": "c117",
     "to": "c0",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
     "line": 790,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
     "symbol": "auditSubsystemModel",
     "annotation": "Run deterministic audit before any proposal work."
    },
    {
     "from": "c119",
     "to": "c218",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/proposal-store.ts",
     "line": 554,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/proposal-store.ts",
     "symbol": "createSubsystemModelProposal",
     "annotation": "Persist the agent correction as pending."
    },
    {
     "from": "c218",
     "to": "c117",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/bun/maintain-model.ts",
     "line": 820,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/maintain-model.ts",
     "symbol": "pendingProposalCount",
     "annotation": "Low confidence leaves the proposal pending for human or agent review."
    },
    {
     "from": "c219",
     "to": "c218",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/components/ProposalsModal.tsx",
     "line": 49,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/ProposalsModal.tsx",
     "symbol": "listSubsystemModelProposals",
     "annotation": "User clicks Get second opinion on unscored proposal."
    },
    {
     "from": "c218",
     "to": "c219",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/components/ProposalsModal.tsx",
     "line": 49,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/components/ProposalsModal.tsx",
     "symbol": "listSubsystemModelProposals",
     "annotation": "Return verdict and confidence badge inline without blocking accept."
    },
    {
     "from": "c22",
     "to": "c91",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "line": 1152,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "symbol": "openSubsystemModel",
     "annotation": "Row double-click opens the model tab via RPC."
    },
    {
     "from": "c91",
     "to": "c164",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 1049,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "openSubsystemModelTab",
     "annotation": "Single choke point stamps the open without gating tab visibility."
    },
    {
     "from": "c164",
     "to": "c222",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "line": 832,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "symbol": "touchSubsystemModelOpened",
     "annotation": "Stamp lastOpenedAt without bumping updatedAt or re-verifying."
    },
    {
     "from": "c89",
     "to": "c222",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "line": 788,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "symbol": "updateSubsystemModel",
     "annotation": "Bump updatedAt leaving lastOpenedAt behind so viewed flips to false."
    },
    {
     "from": "c222",
     "to": "c223",
     "mechanism": "reads",
     "file": "packages/subsystems-studio/src/shared/contract.ts",
     "line": 297,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/shared/contract.ts",
     "symbol": "StoredSubsystemModel",
     "annotation": "Viewed reads both stamps from the stored record."
    },
    {
     "from": "c22",
     "to": "c223",
     "mechanism": "calls",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "line": 266,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "symbol": "subsystemModelSortTime",
     "annotation": "Derive viewed per row as lastOpenedAt at or after updatedAt."
    },
    {
     "from": "c164",
     "to": "c23",
     "mechanism": "writes",
     "file": "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "line": 838,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/subsystem-model-store.ts",
     "symbol": "touchSubsystemModelOpened",
     "annotation": "Mirror the fresh lastOpenedAt into the list index entry."
    },
    {
     "from": "c23",
     "to": "c22",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/bun/index.ts",
     "line": 2239,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/index.ts",
     "symbol": "openSubsystemModelTab",
     "annotation": "Carry the open stamp to the renderer list row."
    },
    {
     "from": "c223",
     "to": "c224",
     "mechanism": "feeds",
     "file": "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "line": 1640,
     "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx",
     "symbol": "SubsystemModelsView",
     "annotation": "Flag rows with unseen changes with a dot and Unviewed filter."
    }
   ]
  }
 ]
};
