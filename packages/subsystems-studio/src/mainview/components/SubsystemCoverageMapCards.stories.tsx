import type { ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { GitFileTreeBuilder } from "@principal-ai/repository-abstraction";
import {
	MultiVersionCityBuilder,
	type CityData,
} from "@principal-ai/file-city-react";
import {
	SubsystemCoverageMapCard,
	SubsystemCoverageMapCards,
	type SubsystemCoverageRepo,
} from "./SubsystemCoverageMapCards";

/** Lay a repo-relative path list out as a File City, exactly like the host. */
function city(paths: readonly string[]): CityData {
	const tree = new GitFileTreeBuilder().build({
		files: paths.map((path) => ({ path })),
		rootPath: "/local",
		commitSha: "local",
		branch: "main",
	});
	return MultiVersionCityBuilder.build(new Map([["working", tree]])).unionCity;
}

/** Uncovered filler so coverage percentages land in a believable range. */
function filler(prefix: string, count: number, extension = "ts"): string[] {
	return Array.from(
		{ length: count },
		(_, index) => `${prefix}/file-${String(index + 1).padStart(2, "0")}.${extension}`,
	);
}

/* ------------------------------ acme/payments ------------------------------ */

const PAYMENTS_FILES = [
	"README.md",
	"package.json",
	"src/index.ts",
	"src/routes/payments.ts",
	"src/routes/refunds.ts",
	"src/routes/webhooks.ts",
	"src/services/paymentService.ts",
	"src/services/refundService.ts",
	"src/services/webhookService.ts",
	"src/domain/money.ts",
	"src/domain/payment.ts",
	"src/domain/refund.ts",
	"src/repositories/paymentRepository.ts",
	"src/repositories/refundRepository.ts",
	"src/lib/stripe.ts",
	"src/lib/logger.ts",
	"src/lib/config.ts",
	"src/middleware/auth.ts",
	"src/middleware/rateLimit.ts",
	"src/utils/format.ts",
	"src/utils/errors.ts",
	"test/payments.test.ts",
	"test/refunds.test.ts",
	"docs/architecture.md",
	"docs/api.md",
	"scripts/migrate.ts",
	...filler("src/components", 8, "tsx"),
	...filler("src/hooks", 5),
	...filler("docs/guides", 4, "md"),
];

const PAYMENTS_REPO: SubsystemCoverageRepo = {
	repoKey: "pkg:github/acme/payments",
	label: "acme/payments",
	name: "payments",
	avatarUrl: "https://github.com/acme.png?size=96",
	cityData: city(PAYMENTS_FILES),
	models: [
		{
			id: "sg-payments",
			title: "Payments Service",
			files: [
				"src/routes/payments.ts",
				"src/services/paymentService.ts",
				"src/domain/payment.ts",
				"src/domain/money.ts",
				"src/repositories/paymentRepository.ts",
				"src/lib/stripe.ts",
				"src/middleware/auth.ts",
				"src/utils/errors.ts",
			],
		},
		{
			id: "sg-refund-worker",
			title: "Refund Worker",
			files: [
				"src/routes/refunds.ts",
				"src/services/refundService.ts",
				"src/domain/refund.ts",
				"src/repositories/refundRepository.ts",
				"src/lib/logger.ts",
			],
		},
		{
			id: "sg-webhooks",
			title: "Provider Webhooks",
			files: [
				"src/routes/webhooks.ts",
				"src/services/webhookService.ts",
				"src/lib/config.ts",
				"src/middleware/rateLimit.ts",
			],
		},
	],
};

/* ------------------------------ acme/checkout ------------------------------ */

const CHECKOUT_FILES = [
	"README.md",
	"package.json",
	"src/index.ts",
	"src/routes/checkout.ts",
	"src/routes/cart.ts",
	"src/services/checkoutService.ts",
	"src/services/cartService.ts",
	"src/services/taxService.ts",
	"src/domain/cart.ts",
	"src/domain/order.ts",
	"src/domain/tax.ts",
	"src/repositories/cartRepository.ts",
	"src/repositories/orderRepository.ts",
	"src/lib/config.ts",
	"src/lib/logger.ts",
	"src/middleware/session.ts",
	"src/utils/format.ts",
	"test/checkout.test.ts",
	"docs/checkout.md",
	...filler("src/components/checkout", 7, "tsx"),
	...filler("src/hooks", 4),
	...filler("docs/guides", 3, "md"),
];

const CHECKOUT_REPO: SubsystemCoverageRepo = {
	repoKey: "pkg:github/acme/checkout",
	label: "acme/checkout",
	name: "checkout",
	avatarUrl: "https://github.com/acme.png?size=96",
	cityData: city(CHECKOUT_FILES),
	models: [
		{
			id: "sg-checkout",
			title: "Checkout Orchestrator",
			files: [
				"src/routes/checkout.ts",
				"src/services/checkoutService.ts",
				"src/services/taxService.ts",
				"src/domain/order.ts",
				"src/repositories/orderRepository.ts",
				"src/middleware/session.ts",
			],
		},
		{
			id: "sg-cart",
			title: "Cart & Tax",
			files: [
				"src/routes/cart.ts",
				"src/services/cartService.ts",
				"src/domain/cart.ts",
				"src/domain/tax.ts",
				"src/repositories/cartRepository.ts",
			],
		},
	],
};

/* ------------------------------- acme/ledger ------------------------------- */

const LEDGER_FILES = [
	"README.md",
	"package.json",
	"src/index.ts",
	"src/routes/journal.ts",
	"src/routes/accounts.ts",
	"src/services/postingService.ts",
	"src/services/periodCloseService.ts",
	"src/services/balanceService.ts",
	"src/domain/entry.ts",
	"src/domain/account.ts",
	"src/domain/period.ts",
	"src/repositories/entryRepository.ts",
	"src/repositories/accountRepository.ts",
	"src/lib/db.ts",
	"src/lib/logger.ts",
	"src/utils/decimal.ts",
	"test/posting.test.ts",
	"docs/ledger.md",
	...filler("src/components/ledger", 5, "tsx"),
	...filler("src/hooks", 3),
	...filler("docs/guides", 3, "md"),
];

const LEDGER_REPO: SubsystemCoverageRepo = {
	repoKey: "pkg:github/acme/ledger",
	label: "acme/ledger",
	name: "ledger",
	avatarUrl: "https://github.com/acme.png?size=96",
	cityData: city(LEDGER_FILES),
	models: [
		{
			id: "sg-ledger",
			title: "Ledger Posting",
			files: [
				"src/routes/journal.ts",
				"src/services/postingService.ts",
				"src/services/periodCloseService.ts",
				"src/domain/entry.ts",
				"src/domain/account.ts",
				"src/repositories/entryRepository.ts",
				"src/utils/decimal.ts",
			],
		},
	],
};

/* --------------------------- acme/notifications ---------------------------- */

const NOTIFICATIONS_FILES = [
	"README.md",
	"package.json",
	"src/index.ts",
	"src/routes/notifications.ts",
	"src/services/emailService.ts",
	"src/services/pushService.ts",
	"src/services/templateService.ts",
	"src/domain/notification.ts",
	"src/repositories/notificationRepository.ts",
	"src/lib/sendgrid.ts",
	"src/lib/logger.ts",
	"src/utils/format.ts",
	"test/notifications.test.ts",
	...filler("src/components", 4, "tsx"),
	...filler("docs/guides", 2, "md"),
];

const NOTIFICATIONS_REPO: SubsystemCoverageRepo = {
	repoKey: "pkg:github/acme/notifications",
	label: "acme/notifications",
	name: "notifications",
	avatarUrl: "https://github.com/acme.png?size=96",
	cityData: city(NOTIFICATIONS_FILES),
	models: [
		{
			id: "sg-notification-dispatch",
			title: "Notification Dispatch",
			files: [
				"src/routes/notifications.ts",
				"src/services/emailService.ts",
				"src/services/pushService.ts",
				"src/services/templateService.ts",
				"src/domain/notification.ts",
				"src/repositories/notificationRepository.ts",
				"src/lib/sendgrid.ts",
			],
		},
	],
};

/* -------------------- principal-ai/subsystem-modeling ---------------------- */

const STUDIO_FILES = [
	"README.md",
	"package.json",
	"packages/subsystems-core/src/schema.ts",
	"packages/subsystems-core/src/validate.ts",
	"packages/subsystems-core/src/model.ts",
	"packages/subsystems-react/src/graph/Graph.tsx",
	"packages/subsystems-react/src/graph/layout.ts",
	"packages/subsystems-react/src/graph/edges.ts",
	"packages/subsystems-react/src/trails/TrailBar.tsx",
	"packages/subsystems-studio/src/mainview/App.tsx",
	"packages/subsystems-studio/src/mainview/rpc.ts",
	"packages/subsystems-studio/src/bun/index.ts",
	"packages/subsystems-studio/src/bun/audit.ts",
	"packages/subsystems-studio/src/shared/contract.ts",
	...filler("packages/subsystems-studio/src/mainview/components", 10, "tsx"),
	...filler("packages/subsystems-studio/src/mainview/views", 6, "tsx"),
	...filler("packages/subsystems-react/src/subsystem", 8, "tsx"),
	...filler("packages/subsystems-core/src", 5),
	...filler("site/src/pages", 4, "tsx"),
];

const STUDIO_REPO: SubsystemCoverageRepo = {
	repoKey: "pkg:github/principal-ai/subsystem-modeling",
	label: "principal-ai/subsystem-modeling",
	name: "subsystem-modeling",
	avatarUrl: "https://github.com/principal-ai.png?size=96",
	cityData: city(STUDIO_FILES),
	models: [
		{
			id: "sg-schema",
			title: "Subsystem Model Schema",
			files: [
				"packages/subsystems-core/src/schema.ts",
				"packages/subsystems-core/src/validate.ts",
				"packages/subsystems-core/src/model.ts",
			],
		},
		{
			id: "sg-graph-canvas",
			title: "Graph Canvas",
			files: [
				"packages/subsystems-react/src/graph/Graph.tsx",
				"packages/subsystems-react/src/graph/layout.ts",
				"packages/subsystems-react/src/graph/edges.ts",
				"packages/subsystems-react/src/trails/TrailBar.tsx",
			],
		},
		{
			id: "sg-studio-host",
			title: "Studio Host",
			files: [
				"packages/subsystems-studio/src/mainview/App.tsx",
				"packages/subsystems-studio/src/mainview/rpc.ts",
				"packages/subsystems-studio/src/bun/index.ts",
				"packages/subsystems-studio/src/shared/contract.ts",
			],
		},
	],
};

const ALL_REPOS: SubsystemCoverageRepo[] = [
	PAYMENTS_REPO,
	CHECKOUT_REPO,
	LEDGER_REPO,
	NOTIFICATIONS_REPO,
	STUDIO_REPO,
];

const meta = {
	title: "Subsystems Tab/SubsystemCoverageMapCards",
	component: SubsystemCoverageMapCards,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story: () => ReactElement) => (
			<div style={{ height: "100vh", display: "flex" }}>
				<Story />
			</div>
		),
	],
	args: {
		repos: ALL_REPOS,
		selectedRepoKey: "pkg:github/acme/payments",
		onSelectRepo: (repoKey: string) => console.info("select repo", repoKey),
		onOpenModel: (modelId: string) => console.info("open model", modelId),
	},
} satisfies Meta<typeof SubsystemCoverageMapCards>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The Map pane as repo cards. Each card is a File City with one glow layer per
 * subsystem model — blue, purple, green in `acme/payments` — and uncovered
 * buildings muted by the collapse isolation mode. The header's Models pill
 * opens the color legend.
 */
export const Default: Story = {};

/** One repo — useful for judging a single card at grid width. */
export const SingleRepo: Story = {
	args: { repos: [PAYMENTS_REPO], selectedRepoKey: null },
};

/** A repo whose checkout is still loading shows the placeholder, not a blank card. */
export const LoadingCity: Story = {
	args: {
		repos: [PAYMENTS_REPO, { ...CHECKOUT_REPO, cityData: null }],
	},
};

/** No repos in the filtered window. */
export const Empty: Story = {
	args: { repos: [] },
};

/** Narrow map pane: the grid collapses to one column. */
export const Narrow: Story = {
	decorators: [
		(Story: () => ReactElement) => (
			<div style={{ height: "100vh", width: 430, display: "flex" }}>
				<Story />
			</div>
		),
	],
};

/** Wide pane: auto-fill adds columns before cards grow past a comfortable size. */
export const Wide: Story = {
	decorators: [
		(Story: () => ReactElement) => (
			<div style={{ height: "100vh", width: 1180, display: "flex" }}>
				<Story />
			</div>
		),
	],
};

/**
 * The Models legend open on both cards: colored dot, model title, and how many
 * of that model's anchored files actually exist in the checkout. Clicking a row
 * opens the model.
 */
export const ModelsLegend: Story = {
	render: () => (
		<div
			style={{
				height: "100vh",
				display: "grid",
				gridTemplateColumns: "repeat(2, minmax(0, 400px))",
				gap: 16,
				padding: 16,
				alignContent: "start",
			}}
		>
			{ALL_REPOS.slice(0, 2).map((repo) => (
				<SubsystemCoverageMapCard
					key={repo.repoKey}
					repo={repo}
					defaultModelsOpen
					onSelectRepo={() => {}}
					onOpenModel={(modelId) => console.info("open model", modelId)}
				/>
			))}
		</div>
	),
};
