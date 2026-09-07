import { Command } from 'commander';
import { createValidateCommand } from './validate.js';

export function createScopesCommand(): Command {
  const command = new Command('scopes');

  command
    .description('Manage and validate instrumentation scopes')
    .addCommand(createValidateCommand());

  return command;
}
