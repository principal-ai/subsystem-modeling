/**
 * Dogfood script: run the Phase 1 + Phase 2 path validators against this
 * repo's own canvases. Reports violations and metrics.
 *
 * Run with:   bun packages/subsystems-core/scripts/dogfood-path-validator.ts
 */

import { readFileSync } from 'fs';
import { resolve, relative } from 'path';
import { NodeFileSystemAdapter } from '@principal-ai/repository-abstraction/node';
import { EventsCanvasValidator } from '../src/events/EventsCanvasValidator';
import { OtelEventPathsValidator } from '../src/events/OtelEventPathsValidator';
import type { ExtendedCanvas } from '../src/types/canvas';

const REPO_ROOT = resolve(import.meta.dir, '../../..');

function loadCanvas(p: string): ExtendedCanvas {
  return JSON.parse(readFileSync(p, 'utf-8')) as ExtendedCanvas;
}

function header(title: string) {
  console.log('\n' + '='.repeat(70));
  console.log(title);
  console.log('='.repeat(70));
}

function reportViolations(violations: Array<{ ruleId: string; severity: string; message: string; file?: string; path?: string }>) {
  if (violations.length === 0) {
    console.log('  (none)');
    return;
  }
  for (const v of violations) {
    const sev = v.severity === 'error' ? 'ERROR' : 'WARN ';
    console.log(`  [${sev}] ${v.ruleId}`);
    console.log(`          ${v.message}`);
    if (v.file) console.log(`          at ${v.file}${v.path ? ` :: ${v.path}` : ''}`);
  }
}

async function main() {
  const eventsCanvasPath = resolve(REPO_ROOT, '.principal-views/principal-view-cli.events.canvas');
  const otelCanvasPath = resolve(REPO_ROOT, '.principal-views/validation/validation.otel.canvas');

  const eventsCanvas = loadCanvas(eventsCanvasPath);
  const otelCanvas = loadCanvas(otelCanvasPath);

  header('Phase 1 — EventsCanvasValidator (per-canvas)');
  console.log(`Canvas: ${relative(REPO_ROOT, eventsCanvasPath)}`);

  const p1 = await new EventsCanvasValidator(new NodeFileSystemAdapter()).validate({
    eventsCanvas,
    eventsCanvasPath: relative(REPO_ROOT, eventsCanvasPath),
    basePath: REPO_ROOT,
  });

  console.log(`\nMetrics:`);
  console.log(`  totalNamespaces:      ${p1.metrics.totalNamespaces}`);
  console.log(`  documentedNamespaces: ${p1.metrics.documentedNamespaces.length}`);
  console.log(`  totalEvents:          ${p1.metrics.totalEvents}`);

  const pathRuleIds = [
    'events-namespace-multiple-paths',
    'events-namespace-paths-missing',
    'events-namespace-paths-overlap',
  ];
  const phase1PathViolations = p1.violations.filter((v) => pathRuleIds.includes(v.ruleId));
  console.log(`\nPhase 1 path-specific violations:`);
  reportViolations(phase1PathViolations as any);

  header('Phase 2 — OtelEventPathsValidator (cross-canvas)');
  console.log(`Events canvas: ${relative(REPO_ROOT, eventsCanvasPath)}  scope=principal-view.cli`);
  console.log(`OTEL canvas:   ${relative(REPO_ROOT, otelCanvasPath)}`);

  const p2 = new OtelEventPathsValidator().validate({
    eventsCanvases: [
      {
        canvas: eventsCanvas,
        canvasPath: relative(REPO_ROOT, eventsCanvasPath),
        scope: 'principal-view.cli',
      },
    ],
    otelCanvases: [
      {
        canvas: otelCanvas,
        canvasPath: relative(REPO_ROOT, otelCanvasPath),
      },
    ],
  });

  console.log(`\nMetrics:`);
  console.log(`  eventsChecked:        ${p2.metrics.eventsChecked}`);
  console.log(`  filesChecked:         ${p2.metrics.filesChecked}`);
  console.log(`  eventsSkippedNoPaths: ${p2.metrics.eventsSkippedNoPaths}`);
  console.log(`  eventsSkippedNoFiles: ${p2.metrics.eventsSkippedNoFiles}`);

  console.log(`\nViolations:`);
  reportViolations(p2.violations as any);

  header('Synthetic scenario — inject paths + otel.files in-memory');
  console.log('(Real canvas files on disk are unchanged; this only modifies cloned copies');
  console.log(' to demonstrate that the rules fire as expected on realistic data.)');

  // Deep-clone so we don't mutate the loaded canvases.
  const eventsCanvasSyn = JSON.parse(JSON.stringify(eventsCanvas)) as ExtendedCanvas;
  const otelCanvasSyn = JSON.parse(JSON.stringify(otelCanvas)) as ExtendedCanvas;

  // Declare paths on two namespaces so we can demonstrate the rules.
  //   analysis  → packages/principal-studio-cli/src/commands          (includes validate.ts)
  //   filetree  → packages/principal-studio-cli/src/file-utils.ts     (single-file component)
  for (const node of eventsCanvasSyn.nodes || []) {
    const ns = (node as any)?.namespace;
    if (!ns) continue;
    if (ns.name === 'analysis') ns.paths = ['packages/principal-studio-cli/src/commands'];
    if (ns.name === 'filetree') ns.paths = ['packages/principal-studio-cli/src/file-utils.ts'];
  }

  // Declare otel.files on three otel-event nodes to exercise each outcome.
  for (const node of otelCanvasSyn.nodes || []) {
    if ((node as any).type !== 'otel-event') continue;
    const ev = (node as any).event;
    if (!ev) continue;

    if (ev.name === 'analysis.started') {
      // Two files to show both PASS and ORPHAN from the same event.
      (node as any).otel.files = [
        'packages/principal-studio-cli/src/commands/validate.ts', // PASS: under analysis's path
        'packages/principal-studio-cli/src/index.ts',             // ORPHAN: under no namespace's path
      ];
    }
    if (ev.name === 'filetree.built') {
      // WRONG-NAMESPACE: file is under analysis's path, not filetree's.
      (node as any).otel.files = ['packages/principal-studio-cli/src/commands/list.ts'];
    }
    // packages.discovered is intentionally left alone: the `packages` namespace
    // has no paths declared, so the event is skipped (opt-in behavior).
  }

  const p2Syn = new OtelEventPathsValidator().validate({
    eventsCanvases: [
      {
        canvas: eventsCanvasSyn,
        canvasPath: relative(REPO_ROOT, eventsCanvasPath),
        scope: 'principal-view.cli',
      },
    ],
    otelCanvases: [
      {
        canvas: otelCanvasSyn,
        canvasPath: relative(REPO_ROOT, otelCanvasPath),
      },
    ],
  });

  console.log(`\nMetrics:`);
  console.log(`  eventsChecked:        ${p2Syn.metrics.eventsChecked}`);
  console.log(`  filesChecked:         ${p2Syn.metrics.filesChecked}`);
  console.log(`  eventsSkippedNoPaths: ${p2Syn.metrics.eventsSkippedNoPaths}`);
  console.log(`  eventsSkippedNoFiles: ${p2Syn.metrics.eventsSkippedNoFiles}`);

  console.log(`\nViolations:`);
  reportViolations(p2Syn.violations as any);

  header('Summary');
  console.log(`Phase 1 (real canvases)        : valid=${p1.valid}`);
  console.log(`Phase 2 (real canvases)        : valid=${p2.valid}`);
  console.log(`Phase 2 (synthetic scenario)   : valid=${p2Syn.valid}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
