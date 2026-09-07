import { Command } from 'commander';
import { createValidateCommand } from './validate.js';

export function createAuxiliaryCommand(): Command {
  const command = new Command('auxiliary');

  command
    .description('Manage and validate the auxiliary manifest (project regions outside the OTEL surface)')
    .addCommand(createValidateCommand());

  return command;
}
