---
id: TASK-3
title: >-
  Pin per-purl commit provenance on stored subsystem models (createdAtCommits /
  verifiedAtCommits)
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-09-27 02:09'
updated_date: '2026-09-27 02:23'
labels: []
dependencies: []
references:
  - packages/subsystems-core/src/types/subsystem-model.ts
  - packages/subsystems-studio/src/shared/contract.ts
  - packages/subsystems-studio/src/bun/subsystem-model-store.ts
  - packages/subsystems-studio/src/bun/verify-subsystem-component.ts
  - packages/subsystems-studio/src/bun/audit-report-store.ts
priority: medium
type: feature
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stored subsystem models cannot say what code state they were proven correct against. Verification time is implicit (lastAudit.checkedAt plus verdict), and the purls a model was authored against are only recoverable from mutable components[].purl strings. Pin one commit sha per purl (keyed by purlRepoKey, fragment stripped): createdAtCommits written once at create and immutable; verifiedAtCommits written only when a full audit is fully_verified against a clean referenced state. Both are host-binding fields on the stored record, deliberately not part of the portable document, so they drop out of gists via toPortableDocument.

Design context is topic topic-1790217475574-5wwm2ysxr. Two framing decisions: (1) verification is commit-only, because a dirty tree has no reproducible name, so the maps hold a bare commit sha (type PurlCommit = string) with no object and no dirtyHash; dirtyHash stays graphify/package-layer cache-key hygiene and must not re-enter the provenance record (it is whole-tree, so an unrelated README edit would flip a model). (2) Freshness is judged per anchor from the existing per-declaration lineHash, not from headSha equality, which is repo-scoped. Ship latest-only (one mutable commit per purl); an append-only ledger of every verified commit is a possible follow-up.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 createdAtCommits is written on create from each component purl resolved repo headSha, keyed by purlRepoKey (fragment stripped), and never changes on later updates
- [ ] #2 verifiedAtCommits is absent until an audit returns fully_verified, then stamped with each purl live headSha
- [ ] #3 verifiedAtCommits is stamped only when every referenced file is clean (no uncommitted edits to anchored files); a dirty referenced file leaves it unstamped
- [ ] #4 Unresolved purls (no local checkout) are omitted from both maps rather than fabricated
- [ ] #5 Legacy stored records without the fields read cleanly and are treated as unpinned
- [ ] #6 The new fields are stripped from the portable document written to gists
- [ ] #7 The model list summary surfaces createdAtCommits, verifiedAtCommits, and a per-purl freshness comparison
- [ ] #8 Tests cover create capture, audit stamp on fully_verified, no stamp when dirty or not fully_verified, and update preserving verifiedAtCommits
- [ ] #9 bun run typecheck and the subsystems-studio test suite pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract a neutral git helper (packages/subsystems-studio/src/bun/git-repo.ts): headSha(root) (bare git rev-parse HEAD) and filesClean(root, relPaths) (anchor-scoped: git diff --quiet HEAD -- paths + untracked check). Repoint graphify-store.ts probeRepoGit at the shared gitStdout/head read so graphify keeps its (headSha, dirtyHash) slot logic; package-layer untouched.
2. Types: add type PurlCommit = string plus createdAtCommits: Record<string, PurlCommit> and verifiedAtCommits?: Record<string, PurlCommit> to StoredSubsystemModel (subsystem-model-store.ts and shared/contract.ts); extend SubsystemModelSummary with both maps plus per-purl freshness.
3. New purl-commits.ts: capturePurlCommits(components) -> Record<purlRepoKey, sha> (resolve root, headSha, skip unresolved); referencedFilesClean(components, walkthroughs) -> boolean.
4. Writers: createSubsystemModel captures createdAtCommits; updateSubsystemModel leaves both fields untouched; add stampVerifiedCommits(graphId, commits) to the store (noteSelfWrite + emitSubsystemModelChange); auditSubsystemModel stamps it only when classifyAuditReport === fully_verified and referencedFilesClean.
5. Read surface: getSubsystemModelAuditListSummary / list summary expose createdAtCommits, verifiedAtCommits, and per-purl freshness derived from per-declaration lineHash (never headSha equality).
6. Tests: subsystem-model-store.test.ts (create capture, update preserves) + audit-report-store.test.ts (stamp conditions); run bun run typecheck and the subsystems-studio test suite.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented (studio). New neutral git helper git-repo.ts (gitStdout; headSha with a 2s TTL cache so list freshness does not spawn git per purl; filesClean anchor-scoped). graphify-store now imports gitStdout from it; its (headSha, dirtyHash) slot logic is unchanged and package-layer untouched. Types: PurlCommit + createdAtCommits / verifiedAtCommits on StoredSubsystemModel (store + shared/contract) and on SubsystemModelSummary (+ purlFreshness). New purl-commits.ts: referencedPurlKeys, referencedFilesByPurl, capturePurlCommits (skips unresolved), referencedFilesClean (anchor-scoped, unrelated edits do not count), commitStatus, purlCommitFreshness. createSubsystemModel captures createdAtCommits; updateSubsystemModel leaves both maps untouched; new stampVerifiedCommits (latest-only replace, does NOT bump updatedAt so the just-saved audit fingerprint stays valid). auditSubsystemModel stamps only when classifyAuditReport === fully_verified AND referencedFilesClean. List handler attaches createdAtCommits / verifiedAtCommits / purlFreshness. Store root honors PRINCIPAL_SUBSYSTEM_MODELS_HOME for tests. Tests: new purl-commits.test.ts + subsystem-model-store.test.ts additions (create capture, update preserves, stamp, legacy unpinned read, portable strip). Evidence: subsystems-studio suite 250 pass / 0 fail; core suite 20 pass / 0 fail. GAP (out of scope, flagged): principal-studio-cli has its own create path (packages/principal-studio-cli/src/lib/subsystem-model-store.ts) and does not capture createdAtCommits.
<!-- SECTION:NOTES:END -->
