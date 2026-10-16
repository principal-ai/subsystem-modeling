import type { Meta, StoryObj } from "@storybook/react";
import type { VerifiedConstruct } from "../../shared/contract";
import { ConstructComplexityControl } from "./ConstructComplexityControl";

const construct: VerifiedConstruct = {
	modelId: "example",
	modelTitle: "Example",
	alias: "example",
	name: "example",
	symbol: "example",
	construct: "function",
	file: "simple.ts",
	packageRelativeFile: "simple.ts",
	purl: "pkg:github/example/repo",
	repoKey: "pkg:github/example/repo",
	startLine: 1,
	endLine: 3,
	contentHash: "1234567890abcdef1234567890abcdef",
	auditedAt: "2026-10-15T00:00:00Z",
};

const meta = {
	title: "Constructs/Complexity",
	component: ConstructComplexityControl,
	args: { construct, enabled: true },
	decorators: [
		(Story) => (
			<div style={{ padding: 24 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 16, maxWidth: 900 }}>
					<strong style={{ flex: 1 }}>example()</strong>
					<Story />
				</div>
				<p>Mock Jev response. Click to assess; green is simpler, red is more complex.</p>
			</div>
		),
	],
} satisfies Meta<typeof ConstructComplexityControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Simple: Story = {};
export const Moderate: Story = { args: { construct: { ...construct, file: "moderate.ts" } } };
export const Complex: Story = { args: { construct: { ...construct, file: "complex.ts" } } };
export const MissingKey: Story = { args: { construct: { ...construct, file: "error.ts" } } };
export const Unverified: Story = { args: { enabled: false } };
