---
id: TASK-1
title: Extract proposal card into its own component with stories
status: Done
assignee:
  - '@griever'
created_date: '2026-09-26 17:34'
updated_date: '2026-09-26 17:42'
labels:
  - frontend
  - storybook
  - refactor
dependencies: []
references:
  - packages/subsystems-studio/src/mainview/components/ProposalsModal.tsx
  - >-
    packages/subsystems-studio/src/mainview/components/ProposalsModal.stories.tsx
priority: medium
type: enhancement
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposal cards are currently rendered inline inside ProposalsModal.tsx (~300 lines of card body inside the map at the bottom). There is no way to view or test a single card in isolation; coverage only comes from the five whole-modal stories in ProposalsModal.stories.tsx, which seed proposals through the RPC mock. Extract the presentational card plus its helpers (lanes, agent labels, change headings, before/after state, second-opinion badge, node preview) so it can be rendered standalone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A ProposalCard component exists in its own file under packages/subsystems-studio/src/mainview/components/ with card-only props (proposal, preview component, busy state, callbacks)
- [x] #2 Pure helpers used only by the card (change heading, now/after state, updatesModel, opinion badge, agent/lane labels) move with it; ProposalsModal imports them if still needed
- [x] #3 ProposalsModal renders cards via the extracted component with no behavior change to accept/reject/score/copy flows
- [x] #4 ProposalCard.stories.tsx covers construct augmentation (low confidence), signature augmentation (accurate), component fix (model change), no-second-opinion, scoring error, and busy accept/reject states
- [x] #5 Existing ProposalsModal stories still pass and Storybook builds
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create ProposalCard.tsx containing the presentational card extracted from ProposalsModal's map body (article at ProposalsModal.tsx:604-906), parameterized by props: proposal, previewComponent, action (busy state), copied, title, and callbacks onAccept/onReject/onScore/onCopyForAgent.
2. Move card-only helpers into ProposalCard.tsx: LANE_LABEL, LANE_ICON, AGENT_LABEL/agentLabel, proposalComponentAlias, ComponentNodePreview + preview constants, formatValue, updatesModel, isConfirmation, changeHeading, UNCONFIRMED_LABEL/unconfirmedLabel, nowState, afterState, opinionBadge, buildAgentPrompt. Export the ones ProposalsModal still uses (buildAgentPrompt for copy; likely LANE_LABEL/LANE_ICON not needed after move).
3. Rewrite ProposalsModal to import ProposalCard and render one per proposal, keeping modal-level state (proposals, error, notice, busy map, copiedId, timers) and handlers unchanged.
4. Add ProposalCard.stories.tsx with 'Proposals/ProposalCard' title, covering construct augmentation low confidence, signature augmentation accurate, component fix model change, no second opinion, scoring error, and busy accept/reject.
5. Verify: tsc/bun typecheck for the studio package, existing ProposalsModal stories, and storybook build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Extracted ProposalCard.tsx (card + card-only helpers: LANE_LABEL/LANE_ICON, AGENT_LABEL/agentLabel, proposalComponentAlias, ComponentNodePreview + preview constants, formatValue, updatesModel, isConfirmation, changeHeading, UNCONFIRMED_LABEL/unconfirmedLabel, nowState, afterState, opinionBadge, buildAgentPrompt, ProposalCardAction). ProposalsModal keeps list/RPC state and now renders ProposalCard per row; its public props are unchanged. Added ProposalCard.stories.tsx with 10 isolated stories. Verified: tsc error set identical to pre-change baseline (no new errors, none in the new files); Storybook build succeeds and indexes 10 Proposals/ProposalCard entries alongside the unchanged Proposals/ProposalsModal stories.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extracted the inline proposal card (ProposalsModal.tsx:604-906) into its own presentational module, ProposalCard.tsx, along with every helper it alone used (lane/agent labels, change heading, before/after state, updatesModel/isConfirmation, opinionBadge, buildAgentPrompt, node preview). ProposalsModal keeps the proposal collection, RPC calls, per-card busy map, copy feedback, and timers, and now renders one ProposalCard per row with its public props (graphId, title, lane, onClose) unchanged. Added ProposalCard.stories.tsx with 10 isolated stories covering construct augmentation (low confidence), signature augmentation (accurate), component fix (model change), multi-change, not-yet-scored, Jev scoring error, accepting/rejecting/scoring in-flight, and copied-for-agent.

Verified with: npx tsc --noEmit -p packages/subsystems-studio/tsconfig.json — error set byte-identical to the pre-change baseline (311 pre-existing errors, zero in the new files); npx storybook build succeeded and index.json lists 10 Proposals/ProposalCard entries plus the unchanged Proposals/ProposalsModal stories.
<!-- SECTION:FINAL_SUMMARY:END -->
