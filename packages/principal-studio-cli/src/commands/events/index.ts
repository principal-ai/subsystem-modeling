import { Command } from 'commander';
import { createValidateCommand } from './validate.js';

export function createEventsCommand(): Command {
  const command = new Command('events');

  command
    .description('Manage and validate event namespace canvases')
    .addCommand(createValidateCommand());

  return command;
}
