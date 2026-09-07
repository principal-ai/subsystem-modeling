/**
 * collector status - Check OTEL collector health and service statistics
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  DEFAULT_COLLECTOR_PORT,
  checkHealth,
  getServiceStats,
  formatRelativeTime,
} from './utils.js';

interface StatusOptions {
  port?: string;
  json?: boolean;
}

export function createStatusCommand(): Command {
  const command = new Command('status');

  command
    .description('Check OTEL collector health and active services')
    .option('-p, --port <port>', `Collector port (default: ${DEFAULT_COLLECTOR_PORT})`)
    .option('--json', 'Output as JSON')
    .action(async (options: StatusOptions) => {
      try {
        const port = options.port ? parseInt(options.port, 10) : DEFAULT_COLLECTOR_PORT;
        const endpoint = `http://localhost:${port}`;

        // Get health status
        const health = await checkHealth(port);
        const stats = health ? await getServiceStats(port) : null;

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                endpoint,
                healthy: health !== null,
                tracesReceived: health?.tracesReceived ?? 0,
                logsReceived: health?.logsReceived ?? 0,
                services: stats ?? null,
              },
              null,
              2
            )
          );
        } else {
          console.log(chalk.bold('\nOTEL Collector Status'));
          console.log('━'.repeat(60));

          console.log(`\n  Endpoint:        ${endpoint}`);

          if (health) {
            console.log(`  Status:          ${chalk.green('✓ healthy')}`);
            console.log(`  Traces received: ${health.tracesReceived ?? 0}`);
            console.log(`  Logs received:   ${health.logsReceived ?? 0}`);

            if (stats && stats.summary.totalServices > 0) {
              console.log(
                `\n  Services (${stats.summary.aliveServices} active, ${stats.summary.totalServices} total):`
              );

              const sortedServices = Object.entries(stats.services).sort((a, b) => {
                // Sort by lastSeen (most recent first)
                return new Date(b[1].lastSeen).getTime() - new Date(a[1].lastSeen).getTime();
              });

              for (const [serviceName, info] of sortedServices) {
                const statusIcon = info.isAlive ? chalk.green('✓') : chalk.gray('○');
                const lastSeen = formatRelativeTime(info.lastSeen);
                const traceCount = `(${info.totalTraces} traces)`;

                console.log(
                  `    ${statusIcon} ${serviceName.padEnd(20)} ${chalk.gray(`last seen ${lastSeen}`)}    ${chalk.gray(traceCount)}`
                );
              }
            } else {
              console.log(chalk.gray('\n  No services have sent traces yet.'));
            }

            console.log('\n' + '━'.repeat(60));
            console.log(chalk.green('Collector is ready to receive traces.'));
          } else {
            console.log(`  Status:          ${chalk.red('✗ unreachable')}`);
            console.log('\n' + '━'.repeat(60));
            console.log(chalk.bold('\n  Troubleshooting:'));
            console.log(chalk.gray('    • Verify the collector is running'));
            console.log(chalk.gray(`    • Check if port ${port} is in use by another process`));
            console.log(chalk.gray(`    • Try: curl ${endpoint}/health`));
          }

          console.log();
        }

        // Exit with error if not healthy
        if (!health) {
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
