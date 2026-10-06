import type { Meta, StoryObj } from "@storybook/react";
import type { SubsystemModelSummary } from "../../shared/contract";
import { SubsystemModelCard } from "./SubsystemModelCard";

const T0 = "2026-09-30T09:00:00.000Z";

const PAYMENTS = "pkg:github/acme/payments";

const BASE: SubsystemModelSummary = {
	id: "sg-payments",
	title: "Payments Service",
	componentCount: 7,
	edgeCount: 9,
	createdAt: T0,
	updatedAt: T0,
	lastOpenedAt: T0,
	path: "~/.principal/subsystem-models/sg-payments.json",
	files: [
		{
			file: "src/routes/payments.ts",
			purl: PAYMENTS,
			components: [
				{
					alias: "payments-routes",
					name: "paymentRoutes",
					construct: "function",
					startLine: 12,
				},
			],
		},
		{
			file: "src/services/paymentService.ts",
			purl: PAYMENTS,
			components: [
				{
					alias: "payment-service",
					name: "PaymentService",
					construct: "class",
					startLine: 8,
				},
			],
		},
		{
			file: "src/domain/money.ts",
			purl: PAYMENTS,
			components: [
				{ alias: "money", name: "Money", construct: "class", startLine: 5 },
			],
		},
	],
	trails: [
		{
			id: "tl-charge",
			title: "POST /payments",
			stepCount: 3,
			files: [
				{ file: "src/routes/payments.ts", purl: PAYMENTS, lines: [12] },
				{ file: "src/services/paymentService.ts", purl: PAYMENTS, lines: [8] },
			],
			steps: [
				{ file: "src/routes/payments.ts", purl: PAYMENTS, line: 12 },
				{ file: "src/services/paymentService.ts", purl: PAYMENTS, line: 8 },
				{ file: "src/repositories/paymentRepository.ts", purl: PAYMENTS, line: 20 },
			],
		},
		{
			id: "tl-refund",
			title: "POST /refunds",
			stepCount: 2,
			files: [{ file: "src/routes/payments.ts", purl: PAYMENTS, lines: [40] }],
			steps: [
				{ file: "src/routes/payments.ts", purl: PAYMENTS, line: 40 },
				{ file: "src/services/paymentService.ts", purl: PAYMENTS, line: 30 },
			],
		},
	],
};

const ROUTES_FILE = { repoKey: PAYMENTS, displayPath: "src/routes/payments.ts" };

const DESCRIPTION =
	"Card capture, refunds, and the webhook surface that reconciles them.";

/** The base model plus a description — the split body's left column. */
const WITH_DESC: SubsystemModelSummary = { ...BASE, description: DESCRIPTION };

const meta = {
	title: "Subsystem/SubsystemModelCard",
	component: SubsystemModelCard,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story: () => JSX.Element) => (
			<div style={{ padding: 24, maxWidth: 720 }}>
				<Story />
			</div>
		),
	],
	args: {
		graph: BASE,
		selectedFile: null,
		openFile: null,
		rowExpanded: false,
		copied: false,
		sharing: false,
		onRowClick: () => {},
		onRowDoubleClick: () => {},
		onOpen: () => {},
		onCopyPath: () => {},
		onShareGist: () => {},
		onDelete: () => {},
		onOpenTrail: () => {},
		onOpenComponent: () => {},
	},
} satisfies Meta<typeof SubsystemModelCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Baseline row, collapsed: title and the copy-path / gist / delete actions. */
export const Default: Story = {};

/** Expanded: the description sits on the left, the trail list on the right. */
export const DescriptionAndTrails: Story = {
	args: { graph: WITH_DESC, rowExpanded: true },
};

/** Expanded with a description but no trails yet — description left, the
 *  empty note right. */
export const DescriptionOnly: Story = {
	args: { graph: { ...WITH_DESC, trails: [] }, rowExpanded: true },
};

/** The row's own disclosure is open with no description — the trail list takes
 *  the full width. */
export const TrailsExpanded: Story = {
	args: { rowExpanded: true },
};

/** Expanded, but the model declares no trails yet. */
export const NoTrails: Story = {
	args: { rowExpanded: true, graph: { ...BASE, trails: [] } },
};

/** A file is open on this row: only the trails that use it are listed, and the
 *  step segments sited in the previewed file light up. */
export const FileTrails: Story = {
	args: { graph: WITH_DESC, selectedFile: ROUTES_FILE, openFile: ROUTES_FILE },
};

/** A file is open on this row and no trail uses it — fall back to the
 *  components the model declares there. */
export const FileComponent: Story = {
	args: {
		graph: WITH_DESC,
		selectedFile: { repoKey: PAYMENTS, displayPath: "src/domain/money.ts" },
	},
};

/** A file is open on this row that the model references nowhere — the empty
 *  expansion note. */
export const FileUnreferenced: Story = {
	args: {
		graph: WITH_DESC,
		selectedFile: { repoKey: PAYMENTS, displayPath: "src/unknown.ts" },
	},
};

/** The copy-path action just succeeded. */
export const Copied: Story = { args: { copied: true } };

/** A gist share is in flight. */
export const Sharing: Story = { args: { sharing: true } };

/** The model has been shared — the action reads "Update gist". */
export const SharedGist: Story = {
	args: { graph: { ...BASE, gist: { id: "abc123", fileName: "payments.json" } } },
};
