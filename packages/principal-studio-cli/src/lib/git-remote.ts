/**
 * Git remote helpers — recover `owner/name` from a working tree's `origin`
 * remote. Used to anchor a tour's primary repo when authoring.
 */

import { spawnSync } from 'node:child_process';

export function gitRemoteUrl(cwd: string): string | null {
  const result = spawnSync('git', ['-C', cwd, 'remote', 'get-url', 'origin'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

export function ownerRepoFromGitRemote(remoteUrl: string): { owner: string; name: string } | null {
  const match = remoteUrl.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!match) return null;
  return { owner: match[1]!, name: match[2]! };
}
