/**
 * CLI entry point for a subsystem-model audit.
 *
 * Runs the shared core audit engine directly against the local stores, so
 * `principal-ai subsystem-model audit <id>` works with Subsystems Studio
 * closed. Only transport adapters live here (model store, Graphify cache,
 * augmentations, C4 elements, persistence, provenance); the audit policy is
 * owned by `@principal-ai/subsystems-core/audit`, which Studio also calls.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import {
  createLocalGraphifyAuditProvider,
  declarationForSymbol,
  disposeSpanTreeCache,
  enclosingDeclaration,
  purlRepoKey,
  runSubsystemModelAudit,
  verifySubsystemComponent as verifyComponentCore,
  type AuditEngineDeps,
  type AuditEngineResult,
  type SpanTreeCache,
  type VerifyComponentDeps,
} from '@principal-ai/subsystems-core/audit';
import type {
  SubsystemComponent,
  SubsystemTrail,
} from '@principal-ai/subsystems-core';
import {
  capturePurlCommits,
  resolveRepoRootForPurlKey,
} from './purl-commits.js';
import { getSubsystemModel } from './subsystem-model-store.js';
import {
  findAcceptedCallSiteAugmentation,
  findAcceptedConstructAugmentation,
  findAcceptedModuleAugmentation,
  findAcceptedSignatureAugmentation,
  findAcceptedSpanAugmentation,
  persistAuditReport,
  readC4Elements,
  referencedFilesClean,
  stampVerifiedCommits,
  verifyModelFiles,
} from './audit-stores.js';

export type CliAuditResult = AuditEngineResult;

/** Run one audit pass with no dependency on the Studio HTTP bridge. */
export async function runCliSubsystemModelAudit(
  graphId: string,
): Promise<CliAuditResult> {
  const localGraphify = createLocalGraphifyAuditProvider({
    // The port receives raw purls (trail step purls include a #file fragment);
    // normalize to the repo key before consulting the Alexandria registry.
    resolveRepoRoot: (purl) =>
      resolveRepoRootForPurlKey(purlRepoKey(purl) ?? purl) ?? null,
  });

  const verifyDeps: VerifyComponentDeps = {
    loadModel: async (id) => {
      const graph = await getSubsystemModel(id);
      if (!graph) return null;
      return {
        id: graph.id,
        components: graph.components as SubsystemComponent[],
      };
    },
    findAcceptedSpanAugmentation,
    findAcceptedConstructAugmentation,
    findAcceptedSignatureAugmentation,
  };

  const deps: AuditEngineDeps = {
    graphifyProvider: localGraphify,
    loadModel: async (id) => {
      const graph = await getSubsystemModel(id);
      if (!graph) return null;
      return {
        graphId: graph.id,
        title: graph.title,
        updatedAt: graph.updatedAt,
        components: graph.components as SubsystemComponent[],
        trails: (graph.trails ?? undefined) as SubsystemTrail[] | undefined,
      };
    },
    verifyModelFiles: (model) => verifyModelFiles(model),
    verifyComponent: (id, componentAlias, options) =>
      verifyComponentCore(
        id,
        componentAlias,
        {
          dryRun: true,
          graphifyProvider: options.graphifyProvider,
          treeCache: options.treeCache as SpanTreeCache,
        },
        verifyDeps,
      ),
    createSpanTreeCache: () => new Map<string, never>(),
    disposeSpanTreeCache: (cache) =>
      disposeSpanTreeCache(cache as SpanTreeCache),
    findAcceptedModuleAugmentation,
    findAcceptedCallSiteAugmentation,
    readC4Elements,
    readFile: (repoRoot, file) => fs.readFile(join(repoRoot, file), 'utf8'),
    enclosingDeclaration,
    declarationForSymbol,
    resolveGraphifySlot: (purl, options) =>
      localGraphify.resolveGraphifySlot(purl, options),
    persistReport: (id, report, fingerprint) =>
      persistAuditReport(id, report, fingerprint),
    referencedFilesClean: (components, trails) =>
      referencedFilesClean(components, trails),
    capturePurlCommits: async (components) => capturePurlCommits(components),
    stampVerifiedCommits: (id, commits) => stampVerifiedCommits(id, commits),
    warn: (message, err) => {
      process.stderr.write(
        `${message}${err !== undefined ? ` ${String(err)}` : ''}\n`,
      );
    },
  };

  return runSubsystemModelAudit(graphId, deps);
}
