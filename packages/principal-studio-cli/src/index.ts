/**
 * Principal AI CLI — Subsystem Models, Studio, tours, and agent sessions.
 */

import { Command } from 'commander';
import { createTourCommand } from './commands/tour.js';
import { createTopicCommand } from './commands/topic.js';
import { createOpencodeCommand } from './commands/opencode/index.js';
import { createAgentSessionsCommand } from './commands/agent-sessions.js';
import { createAgentSessionCommand } from './commands/agent-session.js';
import { createOpenStudioCommand } from './commands/open-studio.js';
import { createSubsystemModelCommand } from './commands/subsystem-model.js';

// Keep in sync with package.json "version"
declare const __CLI_VERSION__: string | undefined;
// Injected at bundle time via esbuild `define`; falls back for tsx dev runs.
const VERSION = typeof __CLI_VERSION__ !== "undefined" ? __CLI_VERSION__ : "0.0.0-dev";

const program = new Command();

program
  .name('principal-ai')
  .description(
    'Principal AI CLI — subsystem models, Subsystems Studio, tours, and agent sessions',
  )
  .version(VERSION);

program.addCommand(createSubsystemModelCommand());
program.addCommand(createOpenStudioCommand());
program.addCommand(createTourCommand());
program.addCommand(createTopicCommand());
program.addCommand(createOpencodeCommand());
program.addCommand(createAgentSessionsCommand());
program.addCommand(createAgentSessionCommand());

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
