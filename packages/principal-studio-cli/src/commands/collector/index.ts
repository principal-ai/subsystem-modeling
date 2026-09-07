/**
 * Collector commands - Check OTEL collector status and connectivity
 */

import { Command } from 'commander';
import { createStatusCommand } from './status.js';
import { createCheckCommand } from './check.js';
import { createDiagnoseCommand } from './diagnose.js';

export function createCollectorCommand(): Command {
  const command = new Command('collector');

  command
    .description('Check OTEL collector status and connectivity')
    .addCommand(createStatusCommand())
    .addCommand(createCheckCommand())
    .addCommand(createDiagnoseCommand());

  return command;
}
