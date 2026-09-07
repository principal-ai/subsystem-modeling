/**
 * trace flow - Check end-to-end trace flow through the pipeline
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  checkHealth,
  getServiceStats,
  DEFAULT_COLLECTOR_PORT,
} from '../collector/utils.js';

interface FlowOptions {
  port?: string;
  json?: boolean;
}

const DEFAULT_APP_PORT = 3043;

interface FlowDiagnostic {
  collector: {
    healthy: boolean;
    traceCount: number;
    serviceCount: number;
    aliveServices: number;
    endpoint: string;
  };
  app: {
    healthy: boolean;
    traceCount: number;
    endpoint: string;
  };
  healthy: boolean;
  issues: string[];
}

export function createFlowCommand(): Command {
  const command = new Command('flow');

  command
    .description('Check end-to-end trace flow through the pipeline')
    .option('-p, --port <port>', 'Electron-app port (default: 3043, dev: 3045)')
    .option('--json', 'Output as JSON')
    .action(async (options: FlowOptions) => {
      try {
        const appPort = options.port ? parseInt(options.port, 10) : DEFAULT_APP_PORT;
        const diagnostic = await runFlowDiagnostic(appPort);

        if (options.json) {
          console.log(JSON.stringify(diagnostic, null, 2));
        } else {
          printFlowDiagnostic(diagnostic);
        }

        if (!diagnostic.healthy) {
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}

async function runFlowDiagnostic(appPort: number): Promise<FlowDiagnostic> {
  const issues: string[] = [];

  // Check collector
  const collectorHealth = await checkHealth(DEFAULT_COLLECTOR_PORT);
  const collectorHealthy = collectorHealth !== null;
  const collectorStats = collectorHealthy
    ? await getServiceStats(DEFAULT_COLLECTOR_PORT)
    : null;

  const collector = {
    healthy: collectorHealthy,
    traceCount: collectorStats?.summary?.totalTraces ?? 0,
    serviceCount: collectorStats?.summary?.totalServices ?? 0,
    aliveServices: collectorStats?.summary?.aliveServices ?? 0,
    endpoint: `http://localhost:${DEFAULT_COLLECTOR_PORT}`,
  };

  if (!collectorHealthy) {
    issues.push('Collector is not reachable');
  }

  // Check electron-app
  let appHealthy = false;
  let appTraceCount = 0;
  try {
    const response = await fetch(`http://localhost:${appPort}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    appHealthy = response.ok;

    // Try to get trace count from the app
    if (appHealthy) {
      try {
        const tracesResponse = await fetch(`http://localhost:${appPort}/otel/traces?limit=1`, {
          signal: AbortSignal.timeout(2000),
        });
        if (tracesResponse.ok) {
          const data = (await tracesResponse.json()) as { count?: number };
          appTraceCount = data.count ?? 0;
        }
      } catch {
        // Endpoint may not be available
      }
    }
  } catch {
    appHealthy = false;
  }

  const app = {
    healthy: appHealthy,
    traceCount: appTraceCount,
    endpoint: `http://localhost:${appPort}`,
  };

  if (!appHealthy) {
    issues.push('Electron-app is not reachable');
  }

  // Determine overall health
  const healthy = collectorHealthy && appHealthy;

  if (collectorHealthy && collector.traceCount > 0 && !appHealthy) {
    issues.push('Traces reaching collector but electron-app is unreachable');
  }

  return {
    collector,
    app,
    healthy,
    issues,
  };
}

function printFlowDiagnostic(diagnostic: FlowDiagnostic): void {
  console.log(chalk.bold('\nTrace Flow Diagnostic'));
  console.log('━'.repeat(60));

  // Step 1: Collector
  console.log(chalk.bold('\n  1. Collector'));
  if (diagnostic.collector.healthy) {
    console.log(`     Status:   ${chalk.green('✓')} healthy`);
    console.log(`     Traces:   ${diagnostic.collector.traceCount} received`);
    console.log(
      `     Services: ${diagnostic.collector.serviceCount} total, ${diagnostic.collector.aliveServices} active`
    );
  } else {
    console.log(`     Status:   ${chalk.red('✗')} unreachable`);
  }

  // Step 2: Electron-app
  console.log(chalk.bold('\n  2. Electron-app'));
  if (diagnostic.app.healthy) {
    console.log(`     Status:   ${chalk.green('✓')} healthy`);
    if (diagnostic.app.traceCount > 0) {
      console.log(`     Traces:   ${diagnostic.app.traceCount} stored`);
    } else {
      console.log(chalk.gray('     Traces:   0 stored (buffer may be empty)'));
    }
  } else {
    console.log(`     Status:   ${chalk.red('✗')} unreachable`);
  }

  // Step 3: Flow summary
  console.log(chalk.bold('\n  3. Pipeline'));
  if (diagnostic.healthy) {
    console.log(`     Status:   ${chalk.green('✓')} both endpoints reachable`);
  } else {
    console.log(`     Status:   ${chalk.red('✗')} issues detected`);
  }

  // Issues
  if (diagnostic.issues.length > 0) {
    console.log(chalk.bold('\n  Issues:'));
    for (const issue of diagnostic.issues) {
      console.log(chalk.yellow(`    • ${issue}`));
    }

    console.log(chalk.bold('\n  Troubleshooting:'));
    if (diagnostic.issues.some((i) => i.toLowerCase().includes('collector'))) {
      console.log(chalk.gray('    • Run: principal-ai collector status'));
      console.log(chalk.gray('    • Run: principal-ai collector diagnose'));
    }
    if (diagnostic.issues.some((i) => i.toLowerCase().includes('electron'))) {
      console.log(chalk.gray('    • Check if the Principal desktop app is running'));
    }
  }

  console.log('\n' + '━'.repeat(60));

  if (diagnostic.healthy) {
    console.log(chalk.green('✓ Pipeline is healthy.'));
  } else {
    console.log(chalk.red(`${diagnostic.issues.length} issue(s) detected.`));
  }

  console.log();
}
