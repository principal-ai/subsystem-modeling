/**
 * trace list - List recent traces from electron-app
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { checkHealth, getServiceStats, DEFAULT_COLLECTOR_PORT } from '../collector/utils.js';

interface ListOptions {
  limit?: string;
  port?: string;
  json?: boolean;
}

interface StoredTrace {
  traceId: string;
  data: {
    resourceSpans?: Array<{
      resource?: {
        attributes?: Array<{ key: string; value: { stringValue?: string } }>;
      };
      scopeSpans?: Array<{
        spans?: Array<{
          name: string;
          startTimeUnixNano: string;
          endTimeUnixNano: string;
        }>;
      }>;
    }>;
  };
}

interface TracesResponse {
  success: boolean;
  traces: StoredTrace[];
  count: number;
  error?: string;
}

const DEFAULT_APP_PORT = 3043;

export function createListCommand(): Command {
  const command = new Command('list');

  command
    .description('List recent traces from electron-app')
    .option('-n, --limit <count>', 'Number of traces to show (default: 10)')
    .option('-p, --port <port>', 'Electron-app port (default: 3043, dev: 3045)')
    .option('--json', 'Output as JSON')
    .action(async (options: ListOptions) => {
      try {
        const limit = options.limit ? parseInt(options.limit, 10) : 10;
        const appPort = options.port ? parseInt(options.port, 10) : DEFAULT_APP_PORT;

        // Check if electron-app is reachable
        let appHealthy = false;
        try {
          const response = await fetch(`http://localhost:${appPort}/health`, {
            signal: AbortSignal.timeout(2000),
          });
          appHealthy = response.ok;
        } catch {
          appHealthy = false;
        }

        // Get collector stats for context
        const collectorHealth = await checkHealth(DEFAULT_COLLECTOR_PORT);
        const collectorHealthy = collectorHealth !== null;
        const collectorStats = collectorHealthy ? await getServiceStats(DEFAULT_COLLECTOR_PORT) : null;

        // Try to fetch traces from electron-app
        let tracesResponse: TracesResponse | null = null;
        if (appHealthy) {
          try {
            const response = await fetch(
              `http://localhost:${appPort}/otel/traces?limit=${limit}`,
              { signal: AbortSignal.timeout(5000) }
            );
            if (response.ok) {
              tracesResponse = (await response.json()) as TracesResponse;
            }
          } catch {
            // Endpoint may not be implemented yet
          }
        }

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: tracesResponse?.success ?? false,
                traces: tracesResponse?.traces ?? [],
                count: tracesResponse?.count ?? 0,
                collector: {
                  healthy: collectorHealthy,
                  totalTraces: collectorStats?.summary?.totalTraces ?? 0,
                  services: Object.keys(collectorStats?.services ?? {}),
                },
                app: {
                  healthy: appHealthy,
                  endpoint: `http://localhost:${appPort}/otel/traces`,
                },
              },
              null,
              2
            )
          );
          return;
        }

        console.log(chalk.bold('\nTrace List'));
        console.log('━'.repeat(60));

        // Show current pipeline status
        console.log(chalk.bold('\n  Pipeline Status:'));

        if (collectorHealthy && collectorStats) {
          const serviceCount = Object.keys(collectorStats.services).length;
          console.log(
            `    Collector:    ${chalk.green('✓')} receiving traces (${collectorStats.summary.totalTraces} total, ${serviceCount} services)`
          );
        } else {
          console.log(`    Collector:    ${chalk.red('✗')} not reachable`);
        }

        if (appHealthy) {
          console.log(`    Electron-app: ${chalk.green('✓')} running`);
        } else {
          console.log(`    Electron-app: ${chalk.red('✗')} not reachable`);
        }

        // Show traces if available
        if (tracesResponse?.success && tracesResponse.traces.length > 0) {
          console.log(chalk.bold(`\n  Recent Traces (${tracesResponse.count}):`));

          for (const trace of tracesResponse.traces) {
            const serviceName = extractServiceName(trace);
            const spanCount = countSpans(trace);
            const timestamp = extractTimestamp(trace);

            console.log(`    ${chalk.cyan(trace.traceId.slice(0, 16))}...`);
            console.log(`      Service: ${serviceName}`);
            console.log(`      Spans:   ${spanCount}`);
            if (timestamp) {
              console.log(`      Time:    ${timestamp}`);
            }
            console.log();
          }
        } else if (tracesResponse?.success && tracesResponse.traces.length === 0) {
          console.log(chalk.bold('\n  Recent Traces:'));
          console.log(chalk.gray('    No traces stored yet.'));
          console.log(chalk.gray('    Traces will appear here once your instrumented'));
          console.log(chalk.gray('    application sends data to the collector.'));
        } else if (appHealthy && !tracesResponse) {
          // Endpoint not implemented
          console.log(chalk.bold('\n  Trace Retrieval:'));
          console.log(chalk.yellow('    Endpoint not available.'));
          console.log();
          console.log(chalk.gray('    The electron-app needs to be restarted to'));
          console.log(chalk.gray('    enable the /otel/traces endpoint.'));
        } else {
          console.log(chalk.bold('\n  Trace Retrieval:'));
          console.log(chalk.red('    Cannot connect to electron-app.'));
        }

        console.log('\n' + '━'.repeat(60));
        console.log();
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}

function extractServiceName(trace: StoredTrace): string {
  const attrs = trace.data.resourceSpans?.[0]?.resource?.attributes ?? [];
  const serviceAttr = attrs.find((a) => a.key === 'service.name');
  return serviceAttr?.value?.stringValue ?? 'unknown';
}

function countSpans(trace: StoredTrace): number {
  let count = 0;
  for (const rs of trace.data.resourceSpans ?? []) {
    for (const ss of rs.scopeSpans ?? []) {
      count += ss.spans?.length ?? 0;
    }
  }
  return count;
}

function extractTimestamp(trace: StoredTrace): string | null {
  const startNano = trace.data.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0]?.startTimeUnixNano;
  if (!startNano) return null;

  const ms = parseInt(startNano, 10) / 1_000_000;
  return new Date(ms).toISOString();
}
