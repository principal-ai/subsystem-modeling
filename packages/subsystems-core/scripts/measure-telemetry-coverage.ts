#!/usr/bin/env bun

/**
 * Telemetry Coverage Measurement Script
 *
 * Measures observability coverage by:
 * 1. Parsing .otel.canvas files to find all nodes
 * 2. Mapping nodes to source files (via pv.sources)
 * 3. Checking which source files have OTEL instrumentation
 * 4. Calculating coverage: (instrumented canvas files / total canvas files) * 100
 */

import { analyzeCoverage } from '../src/telemetry/coverage';
import type { CoverageMetrics } from '../src/telemetry/coverage';
import { FilesystemService, NodeFileSystemAdapter } from '@principal-ai/codebase-composition/node';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

/**
 * Print detailed coverage report
 */
function printReport(metrics: CoverageMetrics): void {
  console.log('\n' + '='.repeat(70));
  console.log('📈 TELEMETRY COVERAGE REPORT (Canvas-Based)');
  console.log('='.repeat(70));

  console.log(`\n📋 Canvas Files Analyzed: ${metrics.canvasFiles.length}`);
  metrics.canvasFiles.forEach(f => console.log(`   - ${f}`));

  console.log(`\n🎯 Node Summary:`);
  console.log(`   Total nodes: ${metrics.totalNodes}`);
  console.log(`   Nodes with sources: ${metrics.nodesWithFiles}`);
  console.log(`   Nodes without sources: ${metrics.totalNodes - metrics.nodesWithFiles}`);
  console.log(`   Nodes with instrumentation: ${metrics.nodesWithInstrumentation}`);
  console.log(`   Coverage: ${metrics.coveragePercentage.toFixed(1)}%`);

  // Nodes WITHOUT sources (must be fixed first)
  const noSources = metrics.nodeCoverage.filter(n => n.filePaths.length === 0);
  if (noSources.length > 0) {
    console.log(`\n⚠️  Nodes Without Sources (${noSources.length}) - MUST ADD PV.SOURCES:`);
    noSources.slice(0, 15).forEach(node => {
      console.log(`   - ${node.nodeId}`);
    });
    if (noSources.length > 15) {
      console.log(`   ... and ${noSources.length - 15} more`);
    }
  }

  // Nodes WITHOUT instrumentation (the gap)
  const uninstrumented = metrics.nodeCoverage.filter(
    n => n.filePaths.length > 0 && !n.hasInstrumentation
  );

  if (uninstrumented.length > 0) {
    console.log(`\n❌ Nodes Missing Instrumentation (${uninstrumented.length}):`);
    uninstrumented.slice(0, 10).forEach(node => {
      console.log(`\n   Node: ${node.nodeId}`);
      console.log(`   Files: ${node.filePaths.join(', ')}`);
    });
    if (uninstrumented.length > 10) {
      console.log(`\n   ... and ${uninstrumented.length - 10} more nodes`);
    }
  }

  // Nodes WITH instrumentation (success)
  const instrumented = metrics.nodeCoverage.filter(n => n.hasInstrumentation);
  if (instrumented.length > 0) {
    console.log(`\n✅ Nodes With Instrumentation (${instrumented.length}):`);
    instrumented.slice(0, 5).forEach(node => {
      console.log(`   - ${node.nodeId}: ${node.instrumentedFiles.join(', ')}`);
    });
    if (instrumented.length > 5) {
      console.log(`   ... and ${instrumented.length - 5} more`);
    }
  }

  // Nodes with missing files (warning)
  const withMissingFiles = metrics.nodeCoverage.filter(n => n.missingFiles.length > 0);
  if (withMissingFiles.length > 0) {
    console.log(`\n⚠️  Nodes Referencing Missing Files (${withMissingFiles.length}):`);
    withMissingFiles.slice(0, 5).forEach(node => {
      console.log(`   - ${node.nodeId}: ${node.missingFiles.join(', ')}`);
    });
  }

  console.log(`\n💡 Recommendations:`);
  if (noSources.length > 0) {
    console.log('   🔴 REQUIRED: Add pv.sources to canvas nodes before measuring coverage');
  } else if (metrics.coveragePercentage < 30) {
    console.log('   🔴 Low coverage - add OTEL instrumentation to files referenced in canvas');
  } else if (metrics.coveragePercentage < 60) {
    console.log('   🟡 Moderate coverage - continue instrumenting remaining nodes');
  } else {
    console.log('   🟢 Good coverage - maintain instrumentation quality');
  }

  console.log(`\n📝 Next Steps:`);
  if (noSources.length > 0) {
    console.log(`   1. Add pv.sources to ${noSources.length} node(s) without file references`);
    console.log(`   2. Example: { "pv": { "sources": ["packages/subsystems-core/src/File.ts"] } }`);
    console.log(`   3. Re-run: bun run coverage:telemetry`);
  } else if (uninstrumented.length > 0) {
    console.log(`   1. Review the ${uninstrumented.length} uninstrumented node(s) above`);
    console.log(`   2. Add OpenTelemetry spans to their source files`);
    console.log(`   3. Follow patterns from packages/subsystems-core/src/rules/engine.ts`);
    console.log(`   4. Re-run: bun run coverage:telemetry`);
  } else {
    console.log(`   ✅ All canvas nodes have instrumentation!`);
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

// Main execution
const rootDir = process.cwd();
console.log('🔍 Building FileTree...');
const service = new FilesystemService(new NodeFileSystemAdapter());
const fileTree = await service.buildFileSystemTreeFromPath(rootDir);
const fileReader = async (path: string) => readFile(resolve(rootDir, path), 'utf-8');

console.log('📊 Analyzing coverage...');
const metrics = await analyzeCoverage(fileTree, fileReader);
printReport(metrics);

// Exit with code based on coverage threshold
const coverageThreshold = parseFloat(process.env.COVERAGE_THRESHOLD || '0');
if (metrics.coveragePercentage < coverageThreshold) {
  console.error(`❌ Coverage ${metrics.coveragePercentage.toFixed(1)}% below threshold ${coverageThreshold}%`);
  process.exit(1);
}
