import { Command } from 'commander';
import chalk from 'chalk';
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import yaml from 'js-yaml';
import {
  ScopesCanvasValidator,
  validateScopeNamespaceNesting,
  CanvasDiscovery,
  getScopeNames,
} from '@principal-ai/subsystems-core/node';
import type {
  ExtendedCanvas,
  ComponentLibrary,
  DiscoveredCanvasWithContent,
  ScopesCanvasViolation,
  ScopeEventsCanvasPair,
  OwnedScopes,
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
    .description('Validate scopes.canvas against library.yaml owned-scopes')
    .option('--json', 'Output as JSON')
    .option('-d, --dir <path>', 'Project directory (default: cwd)')
    .action(async (options: ValidateOptions) => {
      try {
        const baseDir = options.dir || process.cwd();

        // Load library.yaml to get owned-scopes
        const libraryPath = resolve(baseDir, '.principal-views/library.yaml');
        let ownedScopes: string[] = [];

        if (existsSync(libraryPath)) {
          try {
            const libraryContent = readFileSync(libraryPath, 'utf-8');
            const library = yaml.load(libraryContent) as ComponentLibrary;

            // Collect from resources owned-scopes (references)
            if (library?.resources) {
              for (const [_resourceKey, attrs] of Object.entries(library.resources)) {
                const scopes = (attrs as Record<string, unknown>)['owned-scopes'] as OwnedScopes | undefined;
                const scopeNames = getScopeNames(scopes);
                ownedScopes.push(...scopeNames);
              }
            }

            // Remove duplicates
            ownedScopes = [...new Set(ownedScopes)];
          } catch {
            console.error(chalk.red('Error:'), 'Failed to parse library.yaml');
            process.exit(1);
          }
        }

        // Discover scopes canvas
        const service = new FilesystemService(new NodeFileSystemAdapter());
        const fileTree = await service.buildFileSystemTreeFromPath(baseDir);
        const discovery = new CanvasDiscovery();
        const discoveryResult = await discovery.discover(fileTree, {
          fileReader: async (path: string) => readFileSync(resolve(baseDir, path), 'utf-8'),
          includeContent: true,
        });

        // Find scopes canvas
        const scopesCanvas = discoveryResult.canvases.find(c => c.type === 'scopes');
        let scopesCanvasContent: ExtendedCanvas | undefined;
        let scopesCanvasPath: string | undefined;

        if (scopesCanvas) {
          scopesCanvasPath = scopesCanvas.path;
          // Check if content is already loaded
          const canvasWithContent = scopesCanvas as DiscoveredCanvasWithContent;
          if (canvasWithContent.content) {
            scopesCanvasContent = canvasWithContent.content;
          } else {
            // Load content if not already loaded
            try {
              const fullPath = resolve(baseDir, scopesCanvas.path);
              const content = readFileSync(fullPath, 'utf-8');
              scopesCanvasContent = JSON.parse(content) as ExtendedCanvas;
            } catch {
              // Will be handled by validator
            }
          }
        }

        // Validate
        const validator = new ScopesCanvasValidator(new RepoNodeFileSystemAdapter());
        const result = await validator.validate({
          scopesCanvas: scopesCanvasContent,
          scopesCanvasPath,
          ownedScopes,
          basePath: baseDir,
        });

        // Cross-canvas: scope-namespace nesting check
        // Pair each owned scope with its events canvas (filename convention:
        // "scope.with.dots" -> "scope-with-dots.events.canvas") and verify
        // that every namespace.paths entry stays inside its scope.paths.
        if (scopesCanvasContent && ownedScopes.length > 0) {
          const eventsCanvases: ScopeEventsCanvasPair[] = [];
          for (const scope of ownedScopes) {
            const expectedBasename = scope.replace(/\./g, '-');
            const discovered = discoveryResult.canvases.find(
              c => c.type === 'events' && c.basename === expectedBasename,
            );
            if (!discovered) continue;

            const withContent = discovered as DiscoveredCanvasWithContent;
            let eventsCanvas: ExtendedCanvas | undefined = withContent.content;
            if (!eventsCanvas) {
              try {
                const fullPath = resolve(baseDir, discovered.path);
                eventsCanvas = JSON.parse(readFileSync(fullPath, 'utf-8')) as ExtendedCanvas;
              } catch {
                continue;
              }
            }
            eventsCanvases.push({
              scope,
              eventsCanvas,
              eventsCanvasPath: discovered.path,
            });
          }

          const nestingViolations = validateScopeNamespaceNesting({
            scopesCanvas: scopesCanvasContent,
            scopesCanvasPath,
            eventsCanvases,
          });
          if (nestingViolations.length > 0) {
            result.violations.push(...nestingViolations);
            if (nestingViolations.some(v => v.severity === 'error')) {
              result.valid = false;
            }
          }
        }

        // Output results
        if (options.json) {
          console.log(JSON.stringify({
            valid: result.valid,
            violations: result.violations,
            coverage: result.coverage,
          }, null, 2));
        } else {
          console.log(chalk.bold('\nScopes Canvas Validation\n'));
          console.log('━'.repeat(60));

          // Coverage summary
          console.log(chalk.bold('\nCoverage:'));
          console.log(chalk.gray('  • Owned scopes:'), result.coverage.totalOwnedScopes);
          console.log(chalk.gray('  • Documented:'), result.coverage.documentedScopes.length);

          if (result.coverage.missingScopes.length > 0) {
            console.log(chalk.red('  • Missing:'), result.coverage.missingScopes.join(', '));
          }

          if (result.coverage.extraScopes.length > 0) {
            console.log(chalk.yellow('  • Extra:'), result.coverage.extraScopes.join(', '));
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
          const errors = result.violations.filter((v: ScopesCanvasViolation) => v.severity === 'error');
          const warnings = result.violations.filter((v: ScopesCanvasViolation) => v.severity === 'warn');

          console.log(chalk.bold('\nSummary:'));
          if (result.valid) {
            console.log(chalk.green('  ✓ Scopes canvas is valid'));
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
