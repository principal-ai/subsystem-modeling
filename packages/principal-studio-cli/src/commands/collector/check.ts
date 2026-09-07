/**
 * collector check - Send a test trace to verify end-to-end connectivity
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  DEFAULT_COLLECTOR_PORT,
  checkHealth,
  getServiceStats,
  createTestTrace,
  sendTestTrace,
} from './utils.js';

interface CheckOptions {
  port?: string;
  service?: string;
  authToken?: string;
  json?: boolean;
}

const DEFAULT_TEST_SERVICE = 'principal-cli-test';

export function createCheckCommand(): Command {
  const command = new Command('check');

  command
    .description('Send a test trace to verify collector connectivity')
    .option('-p, --port <port>', `Collector port (default: ${DEFAULT_COLLECTOR_PORT})`)
    .option('-s, --service <name>', `Service name for test trace (default: ${DEFAULT_TEST_SERVICE})`)
    .option('--auth-token <token>', 'Bearer token if auth is required')
    .option('--json', 'Output as JSON')
    .action(async (options: CheckOptions) => {
      try {
        const port = options.port ? parseInt(options.port, 10) : DEFAULT_COLLECTOR_PORT;
        const serviceName = options.service || DEFAULT_TEST_SERVICE;
        const endpoint = `http://localhost:${port}`;

        const checks = {
          health: { passed: false, latencyMs: 0, error: undefined as string | undefined },
          sendTrace: {
            passed: false,
            traceId: undefined as string | undefined,
            latencyMs: 0,
            error: undefined as string | undefined,
          },
          verifyReceipt: {
            passed: false,
            foundInStats: false,
            error: undefined as string | undefined,
          },
        };

        const suggestions: string[] = [];

        // Step 1: Health check
        const healthStart = Date.now();
        const health = await checkHealth(port);
        checks.health.latencyMs = Date.now() - healthStart;
        checks.health.passed = health !== null;

        if (!checks.health.passed) {
          checks.health.error = 'Collector not reachable';
          suggestions.push(`Verify the collector is running on port ${port}`);
          suggestions.push(`Try: curl ${endpoint}/health`);
        }

        // Step 2: Send test trace
        if (checks.health.passed) {
          const trace = createTestTrace(serviceName);
          const traceId = trace.resourceSpans[0].scopeSpans[0].spans[0].traceId;

          const result = await sendTestTrace(port, trace, options.authToken);

          checks.sendTrace.passed = result.success;
          checks.sendTrace.latencyMs = result.latencyMs;
          checks.sendTrace.traceId = traceId;

          if (!result.success) {
            checks.sendTrace.error = result.error;

            if (result.statusCode === 401) {
              suggestions.push('The collector requires authentication.');
              suggestions.push('Use --auth-token <token> to provide a Bearer token.');
            } else if (result.statusCode === 403) {
              suggestions.push('Access forbidden. Check collector auth configuration.');
            } else {
              suggestions.push(`Failed to send trace: ${result.error}`);
            }
          }
        }

        // Step 3: Verify trace was received
        if (checks.sendTrace.passed) {
          // Wait a moment for the trace to be processed
          await new Promise((resolve) => setTimeout(resolve, 100));

          const stats = await getServiceStats(port);

          if (stats && stats.services[serviceName]) {
            checks.verifyReceipt.passed = true;
            checks.verifyReceipt.foundInStats = true;
          } else {
            checks.verifyReceipt.passed = false;
            checks.verifyReceipt.error = 'Trace not found in service stats';
            suggestions.push('The trace was accepted but not stored.');
            suggestions.push(`Service "${serviceName}" may not be in the allowlist.`);
            suggestions.push('Check collector configuration for allowedServices setting.');
          }
        }

        const overallPassed =
          checks.health.passed && checks.sendTrace.passed && checks.verifyReceipt.passed;

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                checks,
                endpoint: `${endpoint}/v1/traces`,
                overallPassed,
                suggestions,
              },
              null,
              2
            )
          );
        } else {
          console.log(chalk.bold('\nCollector Connectivity Check'));
          console.log('━'.repeat(60));

          // Health check
          const healthStatus = checks.health.passed
            ? chalk.green('✓ healthy')
            : chalk.red('✗ unreachable');
          console.log(`\n  1. Health check.............. ${healthStatus}`);

          // Send trace
          if (checks.health.passed) {
            const sendStatus = checks.sendTrace.passed
              ? chalk.green(`✓ accepted`) +
                chalk.gray(` (trace: ${checks.sendTrace.traceId?.slice(0, 8)}...)`)
              : chalk.red(`✗ ${checks.sendTrace.error}`);
            console.log(`  2. Sending test trace........ ${sendStatus}`);
          } else {
            console.log(`  2. Sending test trace........ ${chalk.gray('─ skipped')}`);
          }

          // Verify receipt
          if (checks.sendTrace.passed) {
            const verifyStatus = checks.verifyReceipt.passed
              ? chalk.green('✓ trace found in /services/stats')
              : chalk.red('✗ trace not found');
            console.log(`  3. Verifying receipt......... ${verifyStatus}`);
          } else {
            console.log(`  3. Verifying receipt......... ${chalk.gray('─ skipped')}`);
          }

          // Latency
          if (checks.sendTrace.passed) {
            console.log(`  4. Roundtrip latency......... ${checks.sendTrace.latencyMs}ms`);
          }

          console.log('\n' + '━'.repeat(60));

          if (overallPassed) {
            console.log(chalk.green('✓ Collector is correctly configured and receiving traces.'));
            console.log(chalk.gray(`\nYour client should send traces to:`));
            console.log(`  ${endpoint}/v1/traces`);
          } else {
            if (suggestions.length > 0) {
              console.log();
              for (const suggestion of suggestions) {
                console.log(chalk.yellow(`  ${suggestion}`));
              }
            }
          }

          console.log();
        }

        if (!overallPassed) {
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
