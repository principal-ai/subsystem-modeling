import { Command } from 'commander';
import chalk from 'chalk';
import { resolve, dirname } from 'node:path';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
// Node.js-specific imports (validator)
import {
  WorkflowValidator,
  CanvasDiscovery,
  EventRegistry,
  getScopeNames,
} from '@principal-ai/subsystems-core/node';
import { FilesystemService, NodeFileSystemAdapter } from '@principal-ai/codebase-composition/node';
import { NodeFileSystemAdapter as RepoFsAdapter } from '@principal-ai/repository-abstraction/node';
import yaml from 'js-yaml';
// Browser-safe imports
import { computeAggregates } from '@principal-ai/subsystems-core';
import type { ExtendedCanvas, ComponentLibrary, OwnedScopes } from '@principal-ai/subsystems-core';
import { loadWorkflow, resolvePath, loadExecution, executionToEvents } from './utils.js';

interface ValidateOptions {
  canvas?: string;
  execution?: string;
  json?: boolean;
  quiet?: boolean;
  dir?: string;
}

export function createValidateCommand(): Command {
  const command = new Command('validate');

  command
    .description('Validate workflow template syntax, schema, and references')
    .argument('<file>', 'Path to .workflow.json file')
    .option('--canvas <path>', 'Override canvas file path for validation')
    .option('--execution <path>', 'Execution file (.otel.json) for validating attribute references')
    .option('--json', 'Output violations as JSON')
    .option('-q, --quiet', 'Only show errors, suppress warnings')
    .option('-d, --dir <path>', 'Project directory (default: cwd)')
    .action(async (file: string, options: ValidateOptions) => {
      try {
        const baseDir = options.dir || process.cwd();
        const workflowPath = resolvePath(file, baseDir);

        // Load workflow
        const workflow = await loadWorkflow(workflowPath);

        // Resolve canvas path
        // Canvas paths are always relative to repository root
        let canvasPath: string | undefined;
        let canvas: ExtendedCanvas | undefined;
        if (options.canvas) {
          canvasPath = resolvePath(options.canvas, baseDir);
        } else if (workflow.canvas) {
          canvasPath = resolve(baseDir, workflow.canvas);
        }

        // Load canvas if path exists
        if (canvasPath) {
          try {
            const canvasContent = readFileSync(canvasPath, 'utf-8');
            canvas = JSON.parse(canvasContent) as ExtendedCanvas;
          } catch (error) {
            // Canvas not found or invalid - will be flagged by validator
            canvas = undefined;
          }
        }

        // Load execution data if provided
        let executionData: {
          aggregates: Record<string, unknown>;
          eventAttributes: Map<string, Record<string, unknown>>;
        } | undefined;

        if (options.execution) {
          try {
            const executionPath = resolvePath(options.execution, baseDir);
            const execution = await loadExecution(executionPath);
            const events = executionToEvents(execution);
            const aggregates = computeAggregates(events);

            // Build event-specific attribute map
            const eventAttributes = new Map<string, Record<string, unknown>>();
            for (const event of events) {
              if (!eventAttributes.has(event.name)) {
                eventAttributes.set(event.name, {});
              }
              const attrs = eventAttributes.get(event.name)!;
              // Merge attributes from this event occurrence
              if (event.attributes) {
                Object.assign(attrs, event.attributes);
              }
            }

            executionData = { aggregates, eventAttributes };
          } catch (error) {
            console.error(
              chalk.yellow('Warning:'),
              `Failed to load execution file: ${(error as Error).message}`
            );
            console.error(chalk.gray('  Attribute validation will be skipped'));
          }
        }

        // Discover co-located execution files for template completeness validation
        const workflowDir = dirname(workflowPath);
        const executionFiles: string[] = [];
        try {
          const filesInDir = readdirSync(workflowDir);
          for (const file of filesInDir) {
            if (file.endsWith('.otel.json')) {
              executionFiles.push(resolve(workflowDir, file));
            }
          }
        } catch (error) {
          // Directory not readable, skip co-located file discovery
        }

        // Build EventRegistry and discover workflows for cross-canvas event lookup
        let eventRegistry: EventRegistry | undefined;
        let allWorkflowEvents: Set<string> | undefined;

        try {
          // Load library
          let library: ComponentLibrary | undefined;
          const libraryPath = resolve(baseDir, '.principal-views/library.yaml');
          if (existsSync(libraryPath)) {
            try {
              const libraryContent = readFileSync(libraryPath, 'utf-8');
              library = yaml.load(libraryContent) as ComponentLibrary;
            } catch {
              // Library failed to parse, continue without it
            }
          }

          // Discover all canvases and workflows in the project
          const service = new FilesystemService(new NodeFileSystemAdapter());
          const fileTree = await service.buildFileSystemTreeFromPath(baseDir);
          const fileReader = async (path: string) => readFile(resolve(baseDir, path), 'utf-8');
          const discovery = new CanvasDiscovery();
          const discoveryResult = await discovery.discover(fileTree, {
            fileReader,
            includeContent: true,
          });

          // Parse all canvases for EventRegistry
          const parsedCanvases = new Map<string, ExtendedCanvas>();
          for (const discoveredCanvas of discoveryResult.canvases) {
            if (discoveredCanvas.type === 'otel') {
              try {
                const canvasFullPath = resolve(baseDir, discoveredCanvas.path);
                if (existsSync(canvasFullPath)) {
                  const content = readFileSync(canvasFullPath, 'utf-8');
                  const parsed = JSON.parse(content) as ExtendedCanvas;
                  parsedCanvases.set(discoveredCanvas.path, parsed);
                }
              } catch {
                // Skip canvases that fail to parse
              }
            }
          }

          // Build the registry
          eventRegistry = EventRegistry.build(
            library,
            parsedCanvases,
            library ? libraryPath : undefined
          );

          // Find all workflows for the same canvas (multi-workflow pattern support)
          if (workflow.canvas) {
            // Find the storyboard(s) that use this canvas
            const storyboardsForCanvas = discoveryResult.storyboards.filter(
              sb => sb.canvas.path === workflow.canvas
            );

            // If multiple workflows reference this canvas, collect all their events
            const allWorkflows = storyboardsForCanvas.flatMap(sb => sb.workflows);

            if (allWorkflows.length > 1) {
              allWorkflowEvents = new Set<string>();

              for (const discoveredWorkflow of allWorkflows) {
                // Read workflow content
                try {
                  const workflowFullPath = resolve(baseDir, discoveredWorkflow.path);
                  const workflowContent = readFileSync(workflowFullPath, 'utf-8');
                  const wf = JSON.parse(workflowContent);

                  if (wf.scenarios) {
                    for (const scenario of wf.scenarios) {
                      // From template.events
                      if (scenario.template?.events) {
                        for (const eventName of Object.keys(scenario.template.events)) {
                          if (!eventName.includes('*')) {
                            allWorkflowEvents.add(eventName);
                          }
                        }
                      }
                    }
                  }
                } catch {
                  // Skip workflows that fail to parse
                }
              }
            }
          }
        } catch (error) {
          // Discovery failed - continue without it
          // Validation will still work, just without cross-canvas suggestions
        }

        // Extract owned-scopes from library resources
        let ownedScopes: string[] | undefined;
        if (eventRegistry) {
          // Get library from the registry's internal state
          // The registry was built with the library, so we can extract scopes from resources
          const libraryPath = resolve(baseDir, '.principal-views/library.yaml');
          if (existsSync(libraryPath)) {
            try {
              const libraryContent = readFileSync(libraryPath, 'utf-8');
              const lib = yaml.load(libraryContent) as ComponentLibrary;
              if (lib?.resources) {
                ownedScopes = [];
                for (const [_resourceKey, attrs] of Object.entries(lib.resources)) {
                  // Handle both legacy (string[]) and new (Record<string, ScopeDefinition>) formats
                  const scopes = (attrs as Record<string, unknown>)['owned-scopes'] as OwnedScopes | undefined;
                  const scopeNames = getScopeNames(scopes);
                  ownedScopes.push(...scopeNames);

                  // Also add the service name itself as a valid scope
                  const serviceName = (attrs as Record<string, unknown>)['service.name'];
                  if (typeof serviceName === 'string') {
                    ownedScopes.push(serviceName);
                  }
                }
                // Remove duplicates
                ownedScopes = [...new Set(ownedScopes)];
              }
            } catch {
              // Failed to extract scopes, continue without
            }
          }
        }

        // Create validator
        const validator = new WorkflowValidator(new RepoFsAdapter());

        // Validate
        const context = {
          workflow,
          workflowPath,
          canvasPath,
          canvas,
          basePath: baseDir,
          executionData,
          executionFiles,
          eventRegistry,
          allWorkflowEvents,
          ownedScopes,
        };

        const result = await validator.validate(context);

        // Filter violations if quiet mode
        const violations = options.quiet
          ? result.violations.filter((v) => v.severity === 'error')
          : result.violations;

        const errors = violations.filter((v) => v.severity === 'error');
        const warnings = violations.filter((v) => v.severity === 'warn');

        // Output
        if (options.json) {
          const output = {
            file: file,
            valid: errors.length === 0,
            violations: violations.map((v) => ({
              severity: v.severity,
              ruleId: v.ruleId,
              file: v.file,
              path: v.path,
              message: v.message,
              impact: v.impact,
              suggestion: v.suggestion,
              fixable: v.fixable,
            })),
            summary: {
              errors: errors.length,
              warnings: warnings.length,
              scenarioCount: workflow.scenarios.length,
              scope: workflow.scope || null,
              status: workflow.status || 'draft',
              attributeValidation: executionData ? 'enabled' : 'skipped',
            },
          };
          console.log(JSON.stringify(output, null, 2));
        } else {
          // Text output
          console.log(chalk.bold(`\nValidating: ${file}\n`));

          if (errors.length === 0 && warnings.length === 0) {
            console.log(chalk.green('✓'), 'Schema validation passed');
            console.log(
              chalk.green('✓'),
              `${workflow.scenarios.length} scenarios found`
            );
            const priorities = workflow.scenarios.map((s) => s.priority);
            const allUnique = new Set(priorities).size === priorities.length;
            console.log(
              chalk.green('✓'),
              allUnique ? 'All priorities unique' : 'Duplicate priorities found'
            );

            if (canvasPath) {
              console.log(
                chalk.green('✓'),
                `Canvas: ${workflow.canvas || canvasPath} ✓`
              );
            }
          } else {
            // Show violations
            for (const violation of violations) {
              const label =
                violation.severity === 'error'
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
          console.log(chalk.bold('\nSummary:'));
          if (errors.length > 0) {
            console.log(chalk.red(`  • ${errors.length} error(s)`));
          } else {
            console.log(chalk.green('  • 0 errors'));
          }

          if (warnings.length > 0) {
            console.log(chalk.yellow(`  • ${warnings.length} warning(s)`));
          } else if (!options.quiet) {
            console.log(chalk.green('  • 0 warnings'));
          }

          console.log(
            chalk.gray(`  • ${workflow.scenarios.length} scenario(s)`)
          );

          if (canvasPath) {
            console.log(chalk.gray(`  • Canvas: ${workflow.canvas || canvasPath}`));
          }

          // Show scope information
          if (workflow.scope) {
            console.log(chalk.gray(`  • Scope: ${workflow.scope}`));
          } else {
            const status = workflow.status || 'draft';
            if (status === 'approved' || status === 'implemented') {
              console.log(chalk.yellow(`  • Scope: not specified (required for ${status} status)`));
            } else {
              console.log(chalk.gray('  • Scope: not specified'));
            }
          }

          // Show status
          const status = workflow.status || 'draft';
          const statusColor = status === 'implemented' ? chalk.green :
                              status === 'approved' ? chalk.cyan :
                              chalk.gray;
          console.log(chalk.gray('  • Status:'), statusColor(status));

          if (executionData) {
            console.log(
              chalk.gray('  • Attribute validation:'),
              chalk.green('enabled')
            );
          } else {
            console.log(
              chalk.gray('  • Attribute validation:'),
              chalk.gray('skipped (use --execution to enable)')
            );
          }

          if (executionFiles.length > 0) {
            console.log(
              chalk.gray(`  • Co-located executions: ${executionFiles.length} file(s) checked`)
            );
          }

          console.log();
        }

        // Exit with error code if validation failed
        if (errors.length > 0) {
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
