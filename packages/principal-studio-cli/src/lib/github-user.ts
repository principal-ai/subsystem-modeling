/**
 * GitHub user lookup helpers shared by web-ade-facing CLI commands.
 *
 * Both `trail list` and `topic list` accept `--user <login>` or default to
 * "the authenticated user." Login → numeric id resolution and the bare-/me/
 * lookup both go through the public GitHub API with the same token chain
 * the rest of the CLI already uses (gh CLI → git credential helper). These
 * lookups are pure HTTP — no SDK dependency, no state — and identical
 * across commands, so they live here once.
 */

const GITHUB_API = 'https://api.github.com';

export interface GitHubUserId {
  id: number;
  login: string;
}

export async function fetchGitHubMe(token: string): Promise<GitHubUserId> {
  const response = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'principal-ai-cli',
    },
  });
  if (!response.ok) {
    process.stderr.write(`GitHub /user failed: HTTP ${response.status}\n`);
    process.exit(1);
  }
  const body = (await response.json()) as { id?: number; login?: string };
  if (typeof body.id !== 'number' || typeof body.login !== 'string') {
    process.stderr.write('GitHub /user returned an unexpected shape\n');
    process.exit(1);
  }
  return { id: body.id, login: body.login };
}

export async function fetchGitHubUserByLogin(
  login: string,
  token: string,
): Promise<GitHubUserId> {
  const response = await fetch(
    `${GITHUB_API}/users/${encodeURIComponent(login)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'principal-ai-cli',
      },
    },
  );
  if (response.status === 404) {
    process.stderr.write(`GitHub user not found: ${login}\n`);
    process.exit(1);
  }
  if (!response.ok) {
    process.stderr.write(
      `GitHub /users/${login} failed: HTTP ${response.status}\n`,
    );
    process.exit(1);
  }
  const body = (await response.json()) as { id?: number; login?: string };
  if (typeof body.id !== 'number' || typeof body.login !== 'string') {
    process.stderr.write('GitHub /users returned an unexpected shape\n');
    process.exit(1);
  }
  return { id: body.id, login: body.login };
}
