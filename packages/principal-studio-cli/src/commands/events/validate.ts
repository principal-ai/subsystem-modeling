import { Command } from 'commander';
import chalk from 'chalk';
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import {
  EventsCanvasValidator,
  CanvasDiscovery,
} from '@principal-ai/subsystems-core/node';
import type {
  ExtendedCanvas,
  DiscoveredCanvasWithContent,
  EventsCanvasViolation,
} from '@principal-ai/subsystems-core';
import { FilesystemService, NodeFileSystemAdapter } from '@principal-ai/codebase-composition/node';
import { NodeFileSystemAdapter as RepoNodeFileSystemAdapter } from '@principal-ai/repository-abstraction/node';

interface ValidateOptions {
  json?: boolean;
  dir?: string;
}

export function createValidateCommand(): Command {
  const command = new Command('validate');

  command
    .description('Validate events.canvas namespace structure and event organization')
    .option('--json', 'Output as JSON')
    .option('-d, --dir <path>', 'Project directory (default: cwd)')
    .action(async (options: ValidateOptions) => {
      try {
        const baseDir = options.dir || process.cwd();

        // Discover events canvas
        const service = new FilesystemService(new NodeFileSystemAdapter());
        const fileTree = await service.buildFileSystemTreeFromPath(baseDir);
        const discovery = new CanvasDiscovery();
        const discoveryResult = await discovery.discover(fileTree, {
          fileReader: async (path: string) => readFileSync(resolve(baseDir, path), 'utf-8'),
          includeContent: true,
        });

        // Find events canvas
        const eventsCanvas = discoveryResult.canvases.find(c => c.type === 'events');
        let eventsCanvasContent: ExtendedCanvas | undefined;
        let eventsCanvasPath: string | undefined;

        if (eventsCanvas) {
          eventsCanvasPath = eventsCanvas.path;
          // Check if content is already loaded
          const canvasWithContent = eventsCanvas as DiscoveredCanvasWithContent;
          if (canvasWithContent.content) {
            eventsCanvasContent = canvasWithContent.content;
          } else {
            // Load content if not already loaded
            try {
              const fullPath = resolve(baseDir, eventsCanvas.path);
              const content = readFileSync(fullPath, 'utf-8');
              eventsCanvasContent = JSON.parse(content) as ExtendedCanvas;
            } catch {
              // Will be handled by validator
            }
          }
        }

        // Validate
        const validator = new EventsCanvasValidator(new RepoNodeFileSystemAdapter());
        const result = await validator.validate({
          eventsCanvas: eventsCanvasContent,
          eventsCanvasPath,
          basePath: baseDir,
        });

        // Output results
        if (options.json) {
          console.log(JSON.stringify({
            valid: result.valid,
            violations: result.violations,
            metrics: result.metrics,
          }, null, 2));
        } else {
          console.log(chalk.bold('\nEvents Canvas Validation\n'));
          console.log('━'.repeat(60));

          // Metrics summary
          console.log(chalk.bold('\nMetrics:'));
          console.log(chalk.gray('  • Total namespaces:'), result.metrics.totalNamespaces);
          console.log(chalk.gray('  • Documented:'), result.metrics.documentedNamespaces.length);
          console.log(chalk.gray('  • Total events:'), result.metrics.totalEvents);
          console.log(chalk.gray('  • Registered:'), result.metrics.registeredEvents.length);

          if (result.metrics.missingNamespaces.length > 0) {
            console.log(chalk.red('  • Missing namespaces:'), result.metrics.missingNamespaces.join(', '));
          }

          if (result.metrics.unregisteredEvents.length > 0) {
            console.log(chalk.red('  • Unregistered events:'), result.metrics.unregisteredEvents.length);
          }

          // Violations
          if (result.violations.length > 0) {
            console.log(chalk.bold('\nIssues:'));
            console.log('━'.repeat(60));

            for (const violation of result.violations) {
              const label = violation.severity === 'error'
                ? chalk.red('error')
                : chalk.yellow('warning');

              console.log(`\n${label}: ${violation.message}`);
              if (violation.path) {
                console.log(chalk.gray(`  Location: ${violation.path}`));
              }
              if (violation.impact) {
                console.log(chalk.gray(`  Impact: ${violation.impact}`));
              }
              if (violation.suggestion) {
                console.log(chalk.cyan(`  Suggestion: ${violation.suggestion}`));
              }
            }
          }

          // Summary
          const errors = result.violations.filter((v: EventsCanvasViolation) => v.severity === 'error');
          const warnings = result.violations.filter((v: EventsCanvasViolation) => v.severity === 'warn');

          console.log(chalk.bold('\nSummary:'));
          if (result.valid) {
            console.log(chalk.green('  ✓ Events canvas is valid'));
          } else {
            console.log(chalk.red(`  ✗ ${errors.length} error(s)`));
          }

          if (warnings.length > 0) {
            console.log(chalk.yellow(`  ⚠ ${warnings.length} warning(s)`));
          }

          console.log();
        }

        // Exit with error code if validation failed
        if (!result.valid) {
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
