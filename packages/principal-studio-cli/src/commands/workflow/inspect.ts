import { Command } from 'commander';
import chalk from 'chalk';
import { computeAggregates } from '@principal-ai/subsystems-core';
import {
  loadExecution,
  executionToEvents,
  resolvePath,
  formatTimestamp,
  formatDuration,
  groupAttributesByPrefix,
  filterAttributes,
  countEventsByType,
  formatValue,
  capitalize,
} from './utils.js';

interface InspectOptions {
  events?: boolean;
  aggregates?: boolean;
  json?: boolean;
  filter?: string;
}

export function createInspectCommand(): Command {
  const command = new Command('inspect');

  command
    .description('Inspect execution file and show available attributes for templates')
    .argument('<execution>', 'Path to .otel.json execution file')
    .option('--events', 'Show all events')
    .option('--aggregates', 'Show computed aggregates (default)', true)
    .option('--json', 'Output as JSON')
    .option('--filter <pattern>', 'Filter attributes by pattern (e.g., auth.*)')
    .action(async (execution: string, options: InspectOptions) => {
      try {
        const executionPath = resolvePath(execution);

        // Load execution
        const executionData = await loadExecution(executionPath);
        const events = executionToEvents(executionData);

        // Compute aggregates
        const aggregates = computeAggregates(events);

        // Apply filter if provided
        const filteredAggregates = options.filter
          ? filterAttributes(aggregates, options.filter)
          : aggregates;

        // Count events by type
        const eventCounts = countEventsByType(events);

        // Calculate time range
        const timestamps = events.map((e) =>
          typeof e.timestamp === 'string' ? parseInt(e.timestamp, 10) : e.timestamp
        );
        const minTime = Math.min(...timestamps);
        const maxTime = Math.max(...timestamps);
        const duration = maxTime - minTime;

        if (options.json) {
          const output: Record<string, unknown> = {
            file: execution,
            summary: {
              eventCount: events.length,
              spanCount: executionData.spans.length,
              timeRange: {
                start: minTime,
                end: maxTime,
                duration: duration,
              },
              status: executionData.metadata?.status || 'UNKNOWN',
              scope: executionData.metadata?.scopeName || null,
              scopeVersion: executionData.metadata?.scopeVersion || null,
              serviceName: executionData.metadata?.serviceName || null,
            },
            eventTypes: Array.from(eventCounts.entries()).map(([name, count]) => ({
              name,
              count,
            })),
            attributes: filteredAggregates,
          };

          if (options.events) {
            output.events = events.map((e) => ({
              name: e.name,
              timestamp: e.timestamp,
              attributes: e.attributes,
            }));
          }

          console.log(JSON.stringify(output, null, 2));
        } else {
          // Text output
          console.log(chalk.bold(`\nInspecting: ${execution}\n`));

          // Execution Summary
          console.log(chalk.bold('Execution Summary:'));
          console.log('━'.repeat(60));
          console.log(chalk.gray('  • Total Events:'), events.length);
          console.log(chalk.gray('  • Total Spans:'), executionData.spans.length);
          console.log(
            chalk.gray('  • Time Range:'),
            `${formatTimestamp(minTime)} → ${formatTimestamp(maxTime)} (${formatDuration(duration)})`
          );
          const status = executionData.metadata?.status || 'UNKNOWN';
          const statusColor = status === 'OK' ? chalk.green : chalk.red;
          console.log(chalk.gray('  • Status:'), statusColor(status));

          // Show scope information
          const scopeName = executionData.metadata?.scopeName;
          const scopeVersion = executionData.metadata?.scopeVersion;
          const serviceName = executionData.metadata?.serviceName;

          if (serviceName) {
            console.log(chalk.gray('  • Service:'), serviceName);
          }
          if (scopeName) {
            const scopeDisplay = scopeVersion ? `${scopeName}@${scopeVersion}` : scopeName;
            console.log(chalk.gray('  • Scope:'), scopeDisplay);
          }

          // Event Types
          console.log(chalk.bold('\nEvent Types:'));
          console.log('━'.repeat(60));
          for (const [name, count] of eventCounts) {
            console.log(chalk.gray('  •'), `${name} (${count})`);
          }

          // Available Attributes
          console.log(chalk.bold('\nAvailable Attributes (for templates):'));
          console.log('━'.repeat(60));

          const grouped = groupAttributesByPrefix(filteredAggregates);

          for (const [prefix, attrs] of Object.entries(grouped)) {
            console.log(chalk.bold(`\n${capitalize(prefix)}:`));
            for (const [key, value] of Object.entries(attrs)) {
              console.log(chalk.gray('  •'), `${key}: ${formatValue(value)}`);
            }
          }

          // Show events if requested
          if (options.events) {
            console.log(chalk.bold('\nEvents:'));
            console.log('━'.repeat(60));
            for (const event of events) {
              console.log(
                chalk.cyan(
                  `\n[${formatTimestamp(typeof event.timestamp === 'string' ? parseInt(event.timestamp, 10) : event.timestamp)}]`
                ),
                chalk.bold(event.name)
              );
              for (const [key, value] of Object.entries(event.attributes || {})) {
                console.log(chalk.gray('  •'), `${key}: ${formatValue(value)}`);
              }
            }
          }

          console.log();
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
