/**
 * Cross-platform "open this URL in the default browser" helper.
 *
 * Used by `topic open` and `trail open-web`. Detaches + unrefs the child so
 * the CLI returns immediately rather than waiting on the browser process.
 * Headless machines (CI, ssh sessions) will see a friendly stderr warning;
 * the URL itself is still printed to stdout by the caller, so the user can
 * always copy it.
 */

import { spawn } from 'node:child_process';

export function openInBrowser(url: string): void {
  let cmd: string;
  let args: string[];
  switch (process.platform) {
    case 'darwin':
      cmd = 'open';
      args = [url];
      break;
    case 'win32':
      // `start` is a cmd builtin; the empty quoted string is the window title
      // slot, which would otherwise eat the URL on some shells.
      cmd = 'cmd';
      args = ['/c', 'start', '""', url];
      break;
    default:
      cmd = 'xdg-open';
      args = [url];
      break;
  }

  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        process.stderr.write(
          `Could not auto-open the browser (no \`${cmd}\` on PATH). The URL is printed above.\n`,
        );
      } else {
        process.stderr.write(
          `Could not auto-open the browser: ${err.message}\n`,
        );
      }
    });
    child.unref();
  } catch (err) {
    process.stderr.write(
      `Could not auto-open the browser: ${(err as Error).message}\n`,
    );
  }
}
