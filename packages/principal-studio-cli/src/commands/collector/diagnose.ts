/**
 * collector diagnose - Comprehensive diagnostic for troubleshooting collector issues
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  DEFAULT_COLLECTOR_PORT,
  checkHealth,
  getServiceStats,
  checkPort,
  createTestTrace,
  sendTestTrace,
  formatRelativeTime,
} from './utils.js';

interface DiagnoseOptions {
  port?: string;
  json?: boolean;
}

interface PortCheck {
  port: number;
  name: string;
  status: 'listening' | 'closed' | 'unknown';
  service?: string;
}

interface EndpointCheck {
  method: string;
  path: string;
  status: 'ok' | 'error' | 'skipped';
  statusCode?: number;
  note?: string;
}

export function createDiagnoseCommand(): Command {
  const command = new Command('diagnose');

  command
    .description('Run comprehensive diagnostics on the OTEL collector')
    .option('-p, --port <port>', `Collector port (default: ${DEFAULT_COLLECTOR_PORT})`)
    .option('--json', 'Output as JSON')
    .action(async (options: DiagnoseOptions) => {
      try {
        const port = options.port ? parseInt(options.port, 10) : DEFAULT_COLLECTOR_PORT;

        // Port checks
        const portChecks: PortCheck[] = [];
        const portsToCheck = [
          { port, name: 'OTLP' },
          { port: port + 1, name: 'wrapper' },
          { port: port + 2, name: 'internal' },
        ];

        for (const { port: p, name } of portsToCheck) {
          const result = await checkPort(p);
          portChecks.push({
            port: p,
            name,
            status: result.open ? 'listening' : 'closed',
            service: result.service,
          });
        }

        // Endpoint checks
        const endpointChecks: EndpointCheck[] = [];
        const mainPortOpen = portChecks[0].status === 'listening';

        // Health endpoint
        if (mainPortOpen) {
          const health = await checkHealth(port);
          endpointChecks.push({
            method: 'GET',
            path: '/health',
            status: health ? 'ok' : 'error',
            statusCode: health ? 200 : undefined,
          });
        } else {
          endpointChecks.push({
            method: 'GET',
            path: '/health',
            status: 'skipped',
            note: 'Port not open',
          });
        }

        // Services stats endpoint
        if (mainPortOpen) {
          const stats = await getServiceStats(port);
          endpointChecks.push({
            method: 'GET',
            path: '/services/stats',
            status: stats ? 'ok' : 'error',
            statusCode: stats ? 200 : undefined,
          });
        } else {
          endpointChecks.push({
            method: 'GET',
            path: '/services/stats',
            status: 'skipped',
            note: 'Port not open',
          });
        }

        // Traces endpoint
        if (mainPortOpen) {
          const trace = createTestTrace('principal-cli-diagnose');
          const result = await sendTestTrace(port, trace);
          endpointChecks.push({
            method: 'POST',
            path: '/v1/traces',
            status: result.success ? 'ok' : 'error',
            statusCode: result.statusCode,
            note: result.success ? 'test trace accepted' : result.error,
          });
        } else {
          endpointChecks.push({
            method: 'POST',
            path: '/v1/traces',
            status: 'skipped',
            note: 'Port not open',
          });
        }

        // Logs endpoint (just check if it responds, don't actually send)
        if (mainPortOpen) {
          try {
            const response = await fetch(`http://localhost:${port}/v1/logs`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ resourceLogs: [] }),
              signal: AbortSignal.timeout(2000),
            });
            endpointChecks.push({
              method: 'POST',
              path: '/v1/logs',
              status: response.ok ? 'ok' : 'error',
              statusCode: response.status,
            });
          } catch {
            endpointChecks.push({
              method: 'POST',
              path: '/v1/logs',
              status: 'error',
              note: 'Request failed',
            });
          }
        } else {
          endpointChecks.push({
            method: 'POST',
            path: '/v1/logs',
            status: 'skipped',
            note: 'Port not open',
          });
        }

        // Get recent activity
        const stats = mainPortOpen ? await getServiceStats(port) : null;
        const health = mainPortOpen ? await checkHealth(port) : null;

        let recentActivity: {
          lastTrace?: string;
          tracesTotal: number;
          logsTotal: number;
          services: Array<{ name: string; lastSeen: string; traces: number }>;
        } | null = null;

        if (stats && health) {
          const sortedServices = Object.entries(stats.services)
            .sort((a, b) => new Date(b[1].lastSeen).getTime() - new Date(a[1].lastSeen).getTime())
            .slice(0, 5);

          recentActivity = {
            lastTrace:
              sortedServices.length > 0 ? formatRelativeTime(sortedServices[0][1].lastSeen) : undefined,
            tracesTotal: health.tracesReceived ?? 0,
            logsTotal: health.logsReceived ?? 0,
            services: sortedServices.map(([name, info]) => ({
              name,
              lastSeen: formatRelativeTime(info.lastSeen),
              traces: info.totalTraces,
            })),
          };
        }

        // Determine issues
        const issues: string[] = [];

        if (!mainPortOpen) {
          issues.push(`Main OTLP port (${port}) is not responding`);
        }

        const failedEndpoints = endpointChecks.filter((e) => e.status === 'error');
        for (const endpoint of failedEndpoints) {
          issues.push(`${endpoint.method} ${endpoint.path} failed: ${endpoint.note || `HTTP ${endpoint.statusCode}`}`);
        }

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                ports: portChecks,
                endpoints: endpointChecks,
                recentActivity,
                issues,
                healthy: issues.length === 0,
              },
              null,
              2
            )
          );
        } else {
          console.log(chalk.bold('\nCollector Diagnostics'));
          console.log('━'.repeat(60));

          // Port availability
          console.log(chalk.bold('\nPort Availability:'));
          for (const check of portChecks) {
            const icon =
              check.status === 'listening' ? chalk.green('✓') : chalk.red('✗');
            const status =
              check.status === 'listening'
                ? chalk.green('listening') + chalk.gray(` (${check.service})`)
                : chalk.red('closed');
            console.log(`  ${check.port} (${check.name}).......... ${icon} ${status}`);
          }

          // Endpoints
          console.log(chalk.bold('\nEndpoints:'));
          for (const check of endpointChecks) {
            const icon =
              check.status === 'ok'
                ? chalk.green('✓')
                : check.status === 'skipped'
                  ? chalk.gray('─')
                  : chalk.red('✗');
            const status =
              check.status === 'ok'
                ? chalk.green(`${check.statusCode} OK`)
                : check.status === 'skipped'
                  ? chalk.gray('skipped')
                  : chalk.red(check.note || `${check.statusCode}`);
            const note = check.status === 'ok' && check.note ? chalk.gray(` (${check.note})`) : '';
            console.log(`  ${check.method.padEnd(4)} ${check.path.padEnd(15)} ${icon} ${status}${note}`);
          }

          // Recent activity
          if (recentActivity) {
            console.log(chalk.bold('\nRecent Activity:'));
            if (recentActivity.lastTrace) {
              console.log(`  Last trace:         ${recentActivity.lastTrace}`);
            } else {
              console.log(chalk.gray('  Last trace:         no traces received'));
            }
            console.log(`  Traces total:       ${recentActivity.tracesTotal}`);
            console.log(`  Logs total:         ${recentActivity.logsTotal}`);

            if (recentActivity.services.length > 0) {
              console.log(chalk.bold('\n  Recent Services:'));
              for (const svc of recentActivity.services) {
                console.log(
                  chalk.gray(`    • ${svc.name}: ${svc.traces} traces, last seen ${svc.lastSeen}`)
                );
              }
            }
          }

          console.log('\n' + '━'.repeat(60));

          if (issues.length === 0) {
            console.log(chalk.green('No issues detected.'));
          } else {
            console.log(chalk.red(`${issues.length} issue(s) detected:`));
            for (const issue of issues) {
              console.log(chalk.yellow(`  • ${issue}`));
            }
          }

          console.log();
        }

        if (issues.length > 0) {
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
