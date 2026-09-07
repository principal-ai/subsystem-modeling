/**
 * Trace commands - List, inspect, and validate traces
 */

import { Command } from 'commander';
import { createListCommand } from './list.js';
import { createFlowCommand } from './flow.js';
import { createValidateCommand } from './validate.js';
import { createInspectCommand } from './inspect.js';
import { createRegistrationsCommand } from './registrations.js';

export function createTraceCommand(): Command {
  const command = new Command('trace');

  command
    .description('List, inspect, and validate traces from collector and electron-app')
    .addCommand(createListCommand())
    .addCommand(createFlowCommand())
    .addCommand(createValidateCommand())
    .addCommand(createInspectCommand())
    .addCommand(createRegistrationsCommand());

  return command;
}
