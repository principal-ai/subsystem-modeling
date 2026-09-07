import { Command } from 'commander';
import chalk from 'chalk';
import { renderWorkflow } from '@principal-ai/subsystems-core';
import {
  loadWorkflow,
  loadExecution,
  executionToEvents,
  resolvePath,
} from './utils.js';

interface RenderOptions {
  scenario?: string;
  json?: boolean;
  format?: string;
  showMetadata?: boolean;
}

export function createRenderCommand(): Command {
  const command = new Command('render');

  command
    .description('Render workflow template using execution data')
    .argument('<workflow>', 'Path to .workflow.json file')
    .argument('<execution>', 'Path to .otel.json execution file')
    .option('--scenario <id>', 'Force specific scenario (skip auto-selection)')
    .option('--json', 'Output structured result as JSON')
    .option('--format <format>', 'Output format: text (default), markdown, json', 'text')
    .option('--show-metadata', 'Include rendering metadata in output')
    .action(async (workflowPath: string, executionPath: string, options: RenderOptions) => {
      try {
        const workflow = await loadWorkflow(resolvePath(workflowPath));
        const executionData = await loadExecution(resolvePath(executionPath));
        const events = executionToEvents(executionData);

        // Render workflow
        const result = renderWorkflow(workflow, events);

        // Get the selected scenario from the result
        const selectedScenario = workflow.scenarios.find((s) => s.id === result.scenarioId);

        // Force scenario if specified
        if (options.scenario) {
          const scenario = workflow.scenarios.find((s) => s.id === options.scenario);
          if (!scenario) {
            throw new Error(`Scenario not found: ${options.scenario}`);
          }
          // Note: This would require a way to force scenario in renderWorkflow API
          // For now, we'll just validate the scenario exists
        }

        if (options.json) {
          const output: Record<string, unknown> = {
            workflow: workflowPath,
            execution: executionPath,
            scenario: {
              id: selectedScenario?.id,
              priority: selectedScenario?.priority,
              matched: true,
            },
            text: result.text,
          };

          if (options.showMetadata) {
            output.metadata = result.metadata;
          }

          console.log(JSON.stringify(output, null, 2));
        } else {
          // Text output
          if (!options.format || options.format === 'text') {
            console.log(chalk.gray(`Rendering: ${workflowPath}`));
            console.log(chalk.gray(`Execution: ${executionPath}`));
            if (selectedScenario) {
              console.log(
                chalk.gray(
                  `Scenario: ${selectedScenario.id} (priority: ${selectedScenario.priority})`
                )
              );
            }
            console.log();
            console.log('━'.repeat(60));
            console.log();
            console.log(result.text);
            console.log();
            console.log('━'.repeat(60));

            if (options.showMetadata && result.metadata) {
              console.log();
              console.log(chalk.bold('Metadata:'));
              console.log(
                chalk.gray('  • Event Count:'),
                result.metadata.eventCount
              );
              console.log(
                chalk.gray('  • Span Count:'),
                result.metadata.spanCount
              );
              if (result.metadata.timeRange) {
                console.log(
                  chalk.gray('  • Time Range:'),
                  `${result.metadata.timeRange.start} → ${result.metadata.timeRange.end}`
                );
              }
            }
            console.log();
          } else if (options.format === 'markdown') {
            console.log(result.text);
          } else if (options.format === 'json') {
            console.log(JSON.stringify({ text: result.text }, null, 2));
          }
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
