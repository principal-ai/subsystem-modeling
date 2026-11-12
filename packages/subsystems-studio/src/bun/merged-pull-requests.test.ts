import { describe, expect, test } from "bun:test";
import { repoIdentityFromIssue } from "./merged-pull-requests";

describe("repoIdentityFromIssue", () => {
	test("parses GitHub API repository URLs", () => {
		expect(
			repoIdentityFromIssue({
				repository_url: "https://api.github.com/repos/anomalyco/opencode",
				html_url: "https://github.com/anomalyco/opencode/pull/63311",
			}),
		).toEqual({ owner: "anomalyco", name: "opencode" });
	});

	test("falls back to the pull request HTML URL", () => {
		expect(
			repoIdentityFromIssue({
				html_url: "https://github.com/anomalyco/opencode/pull/63311",
			}),
		).toEqual({ owner: "anomalyco", name: "opencode" });
	});

	test("ignores URLs that are not GitHub repositories", () => {
		expect(
			repoIdentityFromIssue({ html_url: "https://example.com/acme/repo/pull/1" }),
		).toBeNull();
	});
});
