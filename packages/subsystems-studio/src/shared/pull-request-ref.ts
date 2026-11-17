/**
 * Stable identity for a pull-request → subsystem-model association.
 *
 * GitHub owner/repo names are case-insensitive, so the key lowercases both.
 * Shared by the bun store, the HTTP routes, and the merge-tab renderer so a
 * badge always resolves against the same key the bot wrote.
 */

export interface PullRequestIdentity {
	owner: string;
	repo: string;
	number: number;
}

/** `owner/repo#123`, lowercased for owner/repo. */
export function pullRequestRefKey(ref: PullRequestIdentity): string {
	return `${ref.owner.trim().toLowerCase()}/${ref.repo.trim().toLowerCase()}#${ref.number}`;
}
