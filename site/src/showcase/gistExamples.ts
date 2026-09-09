/** Curated public gists shown as clickable examples on /gist. */
export interface GistExample {
  id: string
  title: string
  /** `owner/repo` — owner drives the avatar. */
  repo: string
}

export const GIST_EXAMPLES: GistExample[] = [
  {
    id: '0d43c2ff26a019f10c6dbd35c35164e0',
    title: 'T3 Code orchestration turn-start',
    repo: 'pingdotgg/t3code',
  },
  {
    id: '41a19214f5b44bdc851dd7862fa12d23',
    title: 'OpenCode session drain',
    repo: 'anomalyco/opencode',
  },
]

export function gistExampleOwner(repo: string): string {
  return repo.split('/')[0] ?? repo
}
