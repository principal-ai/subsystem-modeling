/**
 * `principal-ai agent-sessions` — open the Agent Sessions viewer.
 *
 * Launches the standalone principal-studio bundle pointed straight at the Agent
 * Sessions tab (recent opencode sessions rendered as File City). If a viewer
 * is already running, hands the tab switch off to it via the IPC socket
 * instead of spawning a second instance.
 */

import { spawn } from 'node:child_process';
import { Command } from 'commander';
import { handoffToRunning } from '../lib/viewer-ipc.js';
import { resolveViewerLaunch } from './trail.js';

const AGENT_SESSIONS_TAB_ID = 'agent-sessions';

export function createAgentSessionsCommand(): Command {
  return new Command('agent-sessions')
    .description(
      'Open the Agent Sessions viewer — recent opencode sessions rendered as File City',
    )
    .option(
      '--viewer-dir <path>',
      'Path to the @principal-ai/subsystems-studio package (overrides PRINCIPAL_STUDIO_DIR)',
    )
    .action(async (options: { viewerDir?: string }) => {
      // Prefer a running viewer: switch it to the Agent Sessions tab and exit
      // without spawning — a second instance couldn't bind the IPC socket.
      if (await handoffToRunning({ kind: 'ACTIVATE_TAB', tabId: AGENT_SESSIONS_TAB_ID })) {
        process.stderr.write('Agent Sessions opened in the running viewer.\n');
        return;
      }

      const launch = resolveViewerLaunch(options.viewerDir);
      const env: Record<string, string> = {
        ...(process.env as Record<string, string>),
        PRINCIPAL_STUDIO_START_TAB: AGENT_SESSIONS_TAB_ID,
      };

      process.stderr.write('Launching Agent Sessions viewer…\n');
      const child =
        launch.kind === 'installed'
          ? spawn(launch.bin, [], { env, stdio: 'inherit' })
          : spawn('bun', ['start'], { cwd: launch.dir, env, stdio: 'inherit' });
      child.on('error', (err) => {
        process.stderr.write(`Failed to launch viewer: ${err.message}\n`);
        process.exit(1);
      });
    });
}
