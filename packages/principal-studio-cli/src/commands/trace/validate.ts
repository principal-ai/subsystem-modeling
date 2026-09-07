/**
 * trace validate - Validate traces against workflow.json definitions
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  selectScenario,
  computeAggregates,
  ExecutionValidator,
  type WorkflowTemplate,
  type ExecutionData,
  type OtelEvent,
} from '@principal-ai/subsystems-core';

interface ValidateOptions {
  workflow: string;
  port?: string;
  limit?: string;
  traceId?: string;
  showAll?: boolean;
  json?: boolean;
}

interface StoredTrace {
  traceId: string;
  data: {
    resourceSpans?: unknown[];
  };
}

interface TracesResponse {
  success: boolean;
  traces: StoredTrace[];
  count: number;
  error?: string;
}

const DEFAULT_APP_PORT = 3043;

export function createValidateCommand(): Command {
  const command = new Command('validate');

  command
    .description('Validate traces against a workflow.json definition')
    .requiredOption('-w, --workflow <path>', 'Path to .workflow.json file')
    .option('-p, --port <port>', 'Electron-app port (default: 3043, dev: 3045)')
    .option('-n, --limit <count>', 'Number of traces to validate (default: 10)')
    .option('-t, --trace-id <id>', 'Validate a specific trace by ID')
    .option('--show-all', 'Show all scenario match details')
    .option('--json', 'Output as JSON')
    .action(async (options: ValidateOptions) => {
      try {
        const appPort = options.port ? parseInt(options.port, 10) : DEFAULT_APP_PORT;
        const limit = options.limit ? parseInt(options.limit, 10) : 10;

        // Load workflow
        const workflow = await loadWorkflow(resolve(options.workflow));

        // Fetch traces from electron-app
        const traces = await fetchTraces(appPort, limit, options.traceId);

        if (traces.length === 0) {
          if (options.json) {
            console.log(JSON.stringify({ success: false, error: 'No traces found', results: [] }, null, 2));
          } else {
            console.log(chalk.yellow('\nNo traces found to validate.'));
            console.log(chalk.gray('Ensure the electron-app is receiving traces.'));
          }
          process.exit(1);
        }

        // Validate each trace
        const results = await validateTraces(traces, workflow);

        if (options.json) {
          outputJson(results, workflow, options);
        } else {
          outputText(results, workflow, options);
        }

        // Exit with error if any trace failed validation
        const hasFailures = results.some((r) => !r.success);
        if (hasFailures) {
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}

async function loadWorkflow(filePath: string): Promise<WorkflowTemplate> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as WorkflowTemplate;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Workflow file not found: ${filePath}`);
    }
    throw new Error(`Failed to parse workflow file: ${(error as Error).message}`);
  }
}

async function fetchTraces(port: number, limit: number, traceId?: string): Promise<StoredTrace[]> {
  const url = traceId
    ? `http://localhost:${port}/otel/traces/${traceId}`
    : `http://localhost:${port}/otel/traces?limit=${limit}`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      throw new Error(`Failed to fetch traces: ${response.statusText}`);
    }

    const data = await response.json();

    if (traceId) {
      // Single trace response
      const singleResponse = data as { success: boolean; trace?: StoredTrace; error?: string };
      if (!singleResponse.success || !singleResponse.trace) {
        throw new Error(singleResponse.error || 'Trace not found');
      }
      return [singleResponse.trace];
    } else {
      // List response
      const listResponse = data as TracesResponse;
      if (!listResponse.success) {
        throw new Error(listResponse.error || 'Failed to fetch traces');
      }
      return listResponse.traces;
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error('Request timeout - electron-app not responding');
    }
    throw error;
  }
}

interface TraceValidationResult {
  traceId: string;
  success: boolean;
  serviceName: string;
  spanCount: number;
  eventCount: number;
  matchResult: {
    fullMatches: ScenarioMatch[];
    partialMatches: ScenarioMatch[];
    recommendedScenario: ScenarioMatch | null;
    totalTraceEvents: number;
  };
  error?: string;
}

interface ScenarioMatch {
  scenarioId: string;
  priority: number;
  matchPercentage: number;
  matchedEventCount: number;
  totalRequiredEvents: number;
  matchedEventNames: string[];
  missingEventNames: string[];
  isFullMatch: boolean;
}

async function validateTraces(
  traces: StoredTrace[],
  workflow: WorkflowTemplate
): Promise<TraceValidationResult[]> {
  const results: TraceValidationResult[] = [];
  const validator = new ExecutionValidator();

  for (const trace of traces) {
    try {
      // Convert OTLP format to ExecutionData
      // The trace.data contains resourceSpans in OTLP format
      const executionData = validator.validateOrThrow(trace.data, `trace:${trace.traceId}`);

      // Convert to OtelEvent array
      const events = executionToEvents(executionData);

      // Run scenario matching
      const matchResult = selectScenario(workflow, events);

      // Extract service name
      const serviceName = extractServiceName(trace);

      // Count spans and events
      const spanCount = executionData.spans.length;
      const eventCount = events.length;

      // Determine success: has at least one full match
      const success = matchResult.fullMatches.length > 0;

      results.push({
        traceId: trace.traceId,
        success,
        serviceName,
        spanCount,
        eventCount,
        matchResult: {
          fullMatches: matchResult.fullMatches.map(toScenarioMatch),
          partialMatches: matchResult.partialMatches.map(toScenarioMatch),
          recommendedScenario: matchResult.recommendedScenario
            ? toScenarioMatch(matchResult.recommendedScenario)
            : null,
          totalTraceEvents: matchResult.totalTraceEvents,
        },
      });
    } catch (error) {
      results.push({
        traceId: trace.traceId,
        success: false,
        serviceName: extractServiceName(trace),
        spanCount: 0,
        eventCount: 0,
        matchResult: {
          fullMatches: [],
          partialMatches: [],
          recommendedScenario: null,
          totalTraceEvents: 0,
        },
        error: (error as Error).message,
      });
    }
  }

  return results;
}

function executionToEvents(execution: ExecutionData): OtelEvent[] {
  const events: OtelEvent[] = [];

  for (const span of execution.spans) {
    for (const event of span.events) {
      events.push({
        name: event.name,
        timestamp: event.time,
        type: 'log',
        attributes: {
          ...event.attributes,
          'span.id': span.id,
          'span.name': span.name,
        },
      });
    }
  }

  return events;
}

function toScenarioMatch(match: {
  scenario: { id: string; priority: number };
  matchPercentage: number;
  matchedEventCount: number;
  totalRequiredEvents: number;
  matchedEventNames: string[];
  missingEventNames: string[];
  isFullMatch: boolean;
}): ScenarioMatch {
  return {
    scenarioId: match.scenario.id,
    priority: match.scenario.priority,
    matchPercentage: match.matchPercentage,
    matchedEventCount: match.matchedEventCount,
    totalRequiredEvents: match.totalRequiredEvents,
    matchedEventNames: match.matchedEventNames,
    missingEventNames: match.missingEventNames,
    isFullMatch: match.isFullMatch,
  };
}

function extractServiceName(trace: StoredTrace): string {
  try {
    const resourceSpans = trace.data.resourceSpans as Array<{
      resource?: {
        attributes?: Array<{ key: string; value: { stringValue?: string } }>;
      };
    }>;
    const attrs = resourceSpans?.[0]?.resource?.attributes ?? [];
    const serviceAttr = attrs.find((a) => a.key === 'service.name');
    return serviceAttr?.value?.stringValue ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function outputJson(
  results: TraceValidationResult[],
  workflow: WorkflowTemplate,
  options: ValidateOptions
): void {
  const passed = results.filter((r) => r.success).length;
  const failed = results.length - passed;

  console.log(
    JSON.stringify(
      {
        workflow: {
          name: workflow.name || options.workflow,
          scenarios: workflow.scenarios.length,
        },
        summary: {
          total: results.length,
          passed,
          failed,
          passRate: results.length > 0 ? ((passed / results.length) * 100).toFixed(1) : '0',
        },
        results: results.map((r) => ({
          traceId: r.traceId,
          success: r.success,
          serviceName: r.serviceName,
          spanCount: r.spanCount,
          eventCount: r.eventCount,
          matchResult: r.matchResult,
          error: r.error,
        })),
      },
      null,
      2
    )
  );
}

function outputText(
  results: TraceValidationResult[],
  workflow: WorkflowTemplate,
  options: ValidateOptions
): void {
  const passed = results.filter((r) => r.success).length;
  const failed = results.length - passed;

  console.log(chalk.bold('\nTrace Validation'));
  console.log('━'.repeat(60));
  console.log(chalk.gray(`Workflow: ${workflow.name || options.workflow}`));
  console.log(chalk.gray(`Scenarios: ${workflow.scenarios.length}`));
  console.log();

  for (const result of results) {
    const statusIcon = result.success ? chalk.green('✓') : chalk.red('✗');
    const traceIdShort = result.traceId.slice(0, 16);

    console.log(`${statusIcon} ${chalk.cyan(traceIdShort)}... ${chalk.gray(`(${result.serviceName})`)}`);

    if (result.error) {
      console.log(chalk.red(`    Error: ${result.error}`));
      continue;
    }

    console.log(chalk.gray(`    Spans: ${result.spanCount}, Events: ${result.eventCount}`));

    if (result.matchResult.fullMatches.length > 0) {
      for (const match of result.matchResult.fullMatches) {
        console.log(
          chalk.green(`    ✓ ${match.scenarioId}`) +
            chalk.gray(` (${match.matchedEventCount}/${match.totalRequiredEvents} events)`)
        );
      }
    } else if (result.matchResult.partialMatches.length > 0) {
      const top = result.matchResult.partialMatches[0];
      console.log(
        chalk.yellow(`    ~ ${top.scenarioId}`) +
          chalk.gray(` (${top.matchPercentage.toFixed(0)}% - ${top.matchedEventCount}/${top.totalRequiredEvents})`)
      );

      if (options.showAll && top.missingEventNames.length > 0) {
        console.log(chalk.gray('      Missing events:'));
        for (const event of top.missingEventNames.slice(0, 5)) {
          console.log(chalk.red(`        ✗ ${event}`));
        }
        if (top.missingEventNames.length > 5) {
          console.log(chalk.gray(`        ... and ${top.missingEventNames.length - 5} more`));
        }
      }
    } else {
      console.log(chalk.red('    ✗ No matching scenario'));
    }

    console.log();
  }

  console.log('━'.repeat(60));

  if (failed === 0) {
    console.log(chalk.green(`✓ All ${passed} trace(s) validated successfully`));
  } else {
    console.log(chalk.red(`✗ ${failed}/${results.length} trace(s) failed validation`));
    console.log(chalk.gray('  Use --show-all to see missing events'));
  }

  console.log();
}
