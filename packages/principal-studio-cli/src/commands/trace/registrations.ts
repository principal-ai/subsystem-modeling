/**
 * trace registrations - Show active port registrations for trace routing
 */

import { Command } from 'commander';
import chalk from 'chalk';

interface RegistrationsOptions {
  port?: string;
  json?: boolean;
}

interface PortRegistration {
  windowId: string;
  serviceName: string;
  registeredAt: number;
}

interface RegistrationsResponse {
  success: boolean;
  registrations: PortRegistration[];
  services: string[];
  timestamp: number;
  error?: string;
}

const DEFAULT_APP_PORT = 3043;

export function createRegistrationsCommand(): Command {
  const command = new Command('registrations');

  command
    .description('Show active port registrations for trace routing')
    .option('-p, --port <port>', 'Electron-app port (default: 3043, dev: 3045)')
    .option('--json', 'Output as JSON')
    .action(async (options: RegistrationsOptions) => {
      try {
        const appPort = options.port ? parseInt(options.port, 10) : DEFAULT_APP_PORT;

        const data = await fetchRegistrations(appPort);

        if (options.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          outputText(data);
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}

async function fetchRegistrations(port: number): Promise<RegistrationsResponse> {
  const url = `http://localhost:${port}/otel/registrations`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      throw new Error(`Failed to fetch registrations: ${response.statusText}`);
    }

    return (await response.json()) as RegistrationsResponse;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error('Request timeout - electron-app not responding');
    }
    throw error;
  }
}

function outputText(data: RegistrationsResponse): void {
  console.log(chalk.bold('\nPort Registrations'));
  console.log('━'.repeat(60));

  if (data.registrations.length === 0) {
    console.log(chalk.yellow('\nNo active registrations found.'));
    console.log(chalk.gray('Windows register when they start listening for traces from a service.'));
    console.log();
    return;
  }

  // Group by window
  const byWindow = new Map<string, PortRegistration[]>();
  for (const reg of data.registrations) {
    const existing = byWindow.get(reg.windowId) || [];
    existing.push(reg);
    byWindow.set(reg.windowId, existing);
  }

  // Output by window
  for (const [windowId, regs] of byWindow) {
    console.log();
    console.log(chalk.cyan(`Window: ${windowId}`));

    for (const reg of regs) {
      const time = new Date(reg.registeredAt).toLocaleTimeString();
      const isWildcard = reg.serviceName === '*';
      const serviceName = isWildcard ? chalk.yellow('* (all services)') : reg.serviceName;
      console.log(chalk.gray(`  └─ ${serviceName}`) + chalk.gray(` @ ${time}`));
    }
  }

  // Summary
  console.log();
  console.log('━'.repeat(60));
  console.log(chalk.gray(`Windows: ${byWindow.size}`));
  console.log(chalk.gray(`Registrations: ${data.registrations.length}`));
  console.log(chalk.gray(`Active services: ${data.services.join(', ') || 'none'}`));
  console.log();
}
