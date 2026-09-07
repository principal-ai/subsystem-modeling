/**
 * `principal-ai open-studio` — open Principal Studio.
 *
 * Launches the standalone principal-studio bundle with its default tabs. If
 * Studio is already running, focuses its window via the IPC socket instead of
 * spawning a second instance (and without switching tabs).
 */

import { spawn } from 'node:child_process';
import { Command } from 'commander';
import { handoffToRunning } from '../lib/viewer-ipc.js';
import { resolveViewerLaunch } from './trail.js';

export function createOpenStudioCommand(): Command {
  return new Command('open-studio')
    .description('Open Principal Studio (or focus it if already running)')
    .option(
      '--viewer-dir <path>',
      'Path to the @principal-ai/subsystems-studio package (overrides PRINCIPAL_STUDIO_DIR)',
    )
    .action(async (options: { viewerDir?: string }) => {
      if (await handoffToRunning({ kind: 'FOCUS' })) {
        process.stderr.write('Principal Studio focused.\n');
        return;
      }

      const launch = resolveViewerLaunch(options.viewerDir);
      const env = process.env as Record<string, string>;

      process.stderr.write('Launching Principal Studio…\n');
      const child =
        launch.kind === 'installed'
          ? spawn(launch.bin, [], { env, stdio: 'inherit' })
          : spawn('bun', ['start'], { cwd: launch.dir, env, stdio: 'inherit' });
      child.on('error', (err) => {
        process.stderr.write(`Failed to launch Principal Studio: ${err.message}\n`);
        process.exit(1);
      });
    });
}
