/**
 * Coverage command - Measure telemetry coverage for canvas nodes
 *
 * This command analyzes .otel.canvas files and checks which implementation files
 * contain the OpenTelemetry events documented in canvas nodes.
 */

import { Command } from 'commander';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import chalk from 'chalk';
import {
  analyzeCoverage,
  type CoverageMetrics,
} from '@principal-ai/subsystems-core/node';
import { FilesystemService, NodeFileSystemAdapter } from '@principal-ai/codebase-composition/node';

interface CoverageOptions {
  dir?: string;
  json?: boolean;
  threshold?: string;
  verbose?: boolean;
}

/**
 * Print coverage report in human-readable format
 */
function printCoverageReport(metrics: CoverageMetrics, rootDir: string, options: CoverageOptions): void {
  const { verbose } = options;

  console.log(chalk.bold('\n' + '─'.repeat(70)));
  console.log(chalk.bold('📈 TELEMETRY COVERAGE REPORT'));
  console.log(chalk.bold('─'.repeat(70)));

  // Canvas files
  console.log(chalk.bold(`\n📋 Canvas Files Analyzed: ${metrics.canvasFiles.length}`));
  if (verbose) {
    metrics.canvasFiles.forEach(f => console.log(chalk.dim(`   - ${f}`)));
  }

  // Validation errors (show first)
  if (metrics.validationErrors && metrics.validationErrors.length > 0) {
    console.log(chalk.red(`\n⚠️  Validation Errors (${metrics.validationErrors.length}):`));
    metrics.validationErrors.forEach(err => {
      console.log(chalk.yellow(`\n   Canvas: ${err.canvasPath}`));
      console.log(chalk.dim(`   Node ID: ${err.nodeId}`));
      if (err.status) {
        console.log(chalk.dim(`   Status: ${err.status}`));
      }
      console.log(chalk.red(`   Error: ${err.error}`));
    });
  }

  // Node status breakdown
  if (metrics.nodeStatus) {
    const ns = metrics.nodeStatus;
    console.log(chalk.bold('\n📊 Node Status:'));
    if (ns.missingStatusCount > 0) {
      console.log(chalk.red(`   ⚠️  Missing Status: ${ns.missingStatusCount} nodes (must add pv.status field)`));
    }
    console.log(chalk.dim(`   Draft: ${ns.draftCount} nodes (design phase)`));
    console.log(chalk.yellow(`   Approved: ${ns.approvedCount} nodes, ${ns.approvedWithFilesCount} with files specified (awaiting implementation)`));
    console.log(chalk.green(`   Implemented: ${ns.implementedCount} nodes, ${ns.implementedWithFilesCount} with files specified`));
  }

  // File summary
  console.log(chalk.bold('\n🎯 File Coverage Summary:'));
  console.log(`   Implementation files checked: ${metrics.totalImplementationFiles}`);
  console.log(`   Files with instrumentation: ${chalk.green(metrics.filesWithInstrumentation.toString())}`);
  console.log(`   Files without instrumentation: ${chalk.dim((metrics.totalImplementationFiles - metrics.filesWithInstrumentation).toString())}`);

  const coverageColor = metrics.coveragePercentage >= 80
    ? chalk.green
    : metrics.coveragePercentage >= 50
    ? chalk.yellow
    : chalk.red;
  console.log(`   Coverage: ${coverageColor(metrics.coveragePercentage.toFixed(1) + '%')}`);

  // Event summary
  console.log(chalk.bold('\n📊 Event Summary:'));
  console.log(`   Total expected events: ${metrics.totalExpectedEvents}`);
  console.log(`   Events found: ${chalk.green(metrics.totalFoundEvents.toString())}`);
  console.log(`   Events missing: ${chalk.red((metrics.totalExpectedEvents - metrics.totalFoundEvents).toString())}`);

  // Package breakdown
  if (metrics.packageCoverage && metrics.packageCoverage.length > 0) {
    console.log(chalk.bold('\n📦 Package Breakdown:'));
    metrics.packageCoverage.forEach(pkg => {
      const pkgColor = pkg.coveragePercentage >= 80
        ? chalk.green
        : pkg.coveragePercentage >= 50
        ? chalk.yellow
        : chalk.red;

      const extSummary = Object.entries(pkg.filesByExtension)
        .map(([ext, count]) => `${ext}: ${count}`)
        .join(', ');

      console.log(chalk.cyan(`\n   ${pkg.packageName}:`));
      console.log(chalk.dim(`     Path: ${pkg.packagePath || '(root)'}`));
      console.log(`     Files: ${pkg.totalFiles}${extSummary ? ` (${extSummary})` : ''}`);
      console.log(`     Instrumented: ${pkg.filesWithInstrumentation}`);
      console.log(`     Coverage: ${pkgColor(pkg.coveragePercentage.toFixed(1) + '%')}`);
    });
  }

  // Files WITHOUT instrumentation
  const uninstrumented = metrics.fileCoverage.filter(f => !f.hasInstrumentation);
  if (uninstrumented.length > 0) {
    console.log(chalk.red(`\n❌ Files Missing Instrumentation (${uninstrumented.length}):`));
    const display = verbose ? uninstrumented : uninstrumented.slice(0, 5);
    display.forEach(file => {
      console.log(chalk.yellow(`\n   File: ${file.filePath}`));
      console.log(chalk.dim(`   Missing events: ${file.missingEvents.join(', ')}`));
    });
    if (!verbose && uninstrumented.length > 5) {
      console.log(chalk.dim(`\n   ... and ${uninstrumented.length - 5} more (use --verbose to see all)`));
    }
  }

  // Files WITH instrumentation
  const instrumented = metrics.fileCoverage.filter(f => f.hasInstrumentation);
  if (instrumented.length > 0) {
    console.log(chalk.green(`\n✅ Files With Instrumentation (${instrumented.length}):`));
    const display = verbose ? instrumented : instrumented.slice(0, 5);
    display.forEach(file => {
      const eventCount = file.instrumentationCount;
      const totalEvents = file.expectedEvents.length;
      const percentage = ((eventCount / totalEvents) * 100).toFixed(0);

      console.log(chalk.dim(`   - ${file.filePath}: ${eventCount}/${totalEvents} events (${percentage}%)`));

      if (verbose && file.foundEvents.length > 0) {
        console.log(chalk.dim(`     Found: ${file.foundEvents.join(', ')}`));
      }
      if (verbose && file.missingEvents.length > 0) {
        console.log(chalk.yellow(`     Missing: ${file.missingEvents.join(', ')}`));
      }
    });
    if (!verbose && instrumented.length > 5) {
      console.log(chalk.dim(`   ... and ${instrumented.length - 5} more (use --verbose to see all)`));
    }
  }

  // Heat map summary (top 5 most instrumented files)
  if (instrumented.length > 0) {
    console.log(chalk.bold('\n🔥 Top Instrumented Files (Heat Map):'));
    const sorted = [...instrumented].sort((a, b) => b.instrumentationCount - a.instrumentationCount);
    const top5 = sorted.slice(0, 5);
    top5.forEach((file, idx) => {
      const bar = '█'.repeat(Math.ceil(file.instrumentationCount / 2));
      console.log(chalk.cyan(`   ${idx + 1}. ${file.filePath}: ${bar} ${file.instrumentationCount} events`));
    });
  }

  // Recommendations
  console.log(chalk.bold('\n💡 Recommendations:'));
  if (metrics.validationErrors && metrics.validationErrors.length > 0) {
    const missingStatusErrors = metrics.validationErrors.filter(e => !e.status);
    const otherErrors = metrics.validationErrors.filter(e => e.status);

    if (missingStatusErrors.length > 0) {
      console.log(chalk.red(`   🔴 ${missingStatusErrors.length} node(s) missing pv.status field - add status to track implementation lifecycle`));
      console.log(chalk.dim('\n   📚 About the status field:'));
      console.log(chalk.dim('      • "draft" - Design/proposal phase, not counted in coverage'));
      console.log(chalk.dim('      • "approved" - Design finalized, ready to implement (requires pv.otel.files)'));
      console.log(chalk.dim('      • "implemented" - Code exists with instrumentation (requires pv.otel.files)'));
    }
    if (otherErrors.length > 0) {
      console.log(chalk.red(`   🔴 ${otherErrors.length} approved/implemented node(s) missing pv.otel.files`));
    }
  } else if (metrics.totalImplementationFiles === 0) {
    console.log(chalk.red('   🔴 No implemented nodes with pv.otel.files - mark nodes as status="implemented" and add files'));
  } else if (metrics.coveragePercentage === 0) {
    console.log(chalk.red('   🔴 No instrumentation found - add OTEL events to files referenced in canvas'));
  } else if (metrics.coveragePercentage < 30) {
    console.log(chalk.red('   🔴 Low coverage - add OTEL instrumentation to missing files'));
  } else if (metrics.coveragePercentage < 60) {
    console.log(chalk.yellow('   🟡 Moderate coverage - continue instrumenting remaining files'));
  } else if (metrics.coveragePercentage < 100) {
    console.log(chalk.green('   🟢 Good coverage - finish instrumenting remaining files'));
  } else {
    console.log(chalk.green('   🟢 Excellent coverage - all files have instrumentation!'));
  }

  // Next steps
  console.log(chalk.bold('\n📝 Next Steps:'));
  if (metrics.validationErrors && metrics.validationErrors.length > 0) {
    const missingStatusErrors = metrics.validationErrors.filter(e => !e.status);

    if (missingStatusErrors.length > 0) {
      console.log(chalk.dim(`   1. Add pv.status to the ${missingStatusErrors.length} node(s) missing it`));
      console.log(chalk.dim(`   2. Choose based on implementation state:`));
      console.log(chalk.dim(`      - "draft" if designing/proposing the event`));
      console.log(chalk.dim(`      - "approved" if ready to implement`));
      console.log(chalk.dim(`      - "implemented" if code already exists`));
      console.log(chalk.dim(`   3. For approved/implemented, add pv.otel.files`));
      console.log(chalk.dim(`   4. Example: { "pv": { "status": "implemented", "event": {...}, "otel": { "files": ["src/file.ts"] } } }`));
      console.log(chalk.dim(`   5. Re-run: principal-ai coverage`));
    } else {
      console.log(chalk.dim(`   1. Fix the ${metrics.validationErrors.length} validation error(s) above`));
      console.log(chalk.dim(`   2. Add pv.otel.files to approved/implemented nodes`));
      console.log(chalk.dim(`   3. Example: { "pv": { "status": "implemented", "otel": { "files": ["src/file.ts"] } } }`));
      console.log(chalk.dim(`   4. Re-run: principal-ai coverage`));
    }
  } else if (metrics.totalImplementationFiles === 0) {
    console.log(chalk.dim(`   1. Mark canvas nodes with status: "draft", "approved", or "implemented"`));
    console.log(chalk.dim(`   2. Add pv.otel.files to approved/implemented nodes`));
    console.log(chalk.dim(`   3. Example: { "pv": { "status": "implemented", "otel": { "files": ["src/app/api/route.ts"] } } }`));
    console.log(chalk.dim(`   4. Re-run: principal-ai coverage`));
  } else if (uninstrumented.length > 0) {
    console.log(chalk.dim(`   1. Review the ${uninstrumented.length} uninstrumented file(s) above`));
    console.log(chalk.dim(`   2. Add the missing OpenTelemetry events to each file`));
    console.log(chalk.dim(`   3. Use span.addEvent('event.name', { ... }) to emit events`));
    console.log(chalk.dim(`   4. Re-run: principal-ai coverage`));
  } else {
    console.log(chalk.green(`   ✅ All files have instrumentation!`));
  }

  console.log(chalk.bold('\n' + '─'.repeat(70) + '\n'));
}

export function createCoverageCommand(): Command {
  const command = new Command('coverage');

  command
    .description('Measure telemetry coverage for implementation files')
    .option('-d, --dir <path>', 'Project directory (defaults to current directory)')
    .option('--json', 'Output results as JSON')
    .option('-t, --threshold <percentage>', 'Minimum coverage percentage (exit with error if below)')
    .option('-v, --verbose', 'Show all files in output')
    .action(async (options: CoverageOptions) => {
      try {
        const rootDir = resolve(options.dir || process.cwd());

        // Build FileTree and create fileReader
        const service = new FilesystemService(new NodeFileSystemAdapter());
        const fileTree = await service.buildFileSystemTreeFromPath(rootDir);
        const fileReader = async (path: string) => readFile(resolve(rootDir, path), 'utf-8');

        // Analyze coverage
        const metrics = await analyzeCoverage(fileTree, fileReader);

        // Output results
        if (options.json) {
          console.log(JSON.stringify(metrics, null, 2));
        } else {
          printCoverageReport(metrics, rootDir, options);
        }

        // Check for validation errors
        if (metrics.validationErrors && metrics.validationErrors.length > 0) {
          if (!options.json) {
            console.error(
              chalk.red(
                `\n✗ Found ${metrics.validationErrors.length} validation error(s). Fix these before checking coverage.`
              )
            );
          }
          process.exit(1);
        }

        // Check threshold
        if (options.threshold) {
          const threshold = parseFloat(options.threshold);
          if (isNaN(threshold) || threshold < 0 || threshold > 100) {
            console.error(chalk.red('Error: Threshold must be a number between 0 and 100'));
            process.exit(1);
          }

          if (metrics.coveragePercentage < threshold) {
            if (!options.json) {
              console.error(
                chalk.red(
                  `\n✗ Coverage ${metrics.coveragePercentage.toFixed(1)}% is below threshold ${threshold}%`
                )
              );
            }
            process.exit(1);
          }
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
