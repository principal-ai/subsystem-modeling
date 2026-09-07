import { Command } from 'commander';
import { createValidateCommand } from './validate.js';
import { createInspectCommand } from './inspect.js';
import { createRenderCommand } from './render.js';
import { createTestCommand } from './test.js';
import { createListCommand } from './list.js';
import { createImplementationCommand } from './implementation.js';

export function createWorkflowCommand(): Command {
  const command = new Command('workflow');

  command
    .description('Validate, test, and debug workflow templates')
    .addCommand(createValidateCommand())
    .addCommand(createInspectCommand())
    .addCommand(createRenderCommand())
    .addCommand(createTestCommand())
    .addCommand(createListCommand())
    .addCommand(createImplementationCommand());

  return command;
}
