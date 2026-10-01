import type { Meta, StoryObj } from "@storybook/react";
import { MaintenanceHeader } from "./MaintenanceHeader";

const meta = {
	title: "Maintenance/MaintenanceHeader",
	component: MaintenanceHeader,
	parameters: { layout: "fullscreen" },
	args: {
		pendingCount: 3,
		confidentPendingCount: 2,
		confidenceThreshold: 0.85,
		onDeleteAll: () => {},
		onAcceptConfident: () => {},
		onOpenLane: () => {},
	},
} satisfies Meta<typeof MaintenanceHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Idle header: title + lane help buttons, then Delete all / Accept confident. */
export const Default: Story = {};

/** Nothing pending — Delete all / Accept confident are absent, so the header is
 *  just the title and its lane legend. The batch controls live on the models
 *  section's label row (see MaintenanceBatchActions). */
export const NothingPending: Story = {
	args: { pendingCount: 0, confidentPendingCount: 0 },
};