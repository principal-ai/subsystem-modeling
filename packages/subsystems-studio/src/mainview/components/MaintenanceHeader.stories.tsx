import type { Meta, StoryObj } from "@storybook/react";
import { MaintenanceHeader } from "./MaintenanceHeader";

const meta = {
	title: "Maintenance/MaintenanceHeader",
	component: MaintenanceHeader,
	parameters: { layout: "fullscreen" },
	args: {
		modelCount: 4,
		auditAllActive: false,
		auditAllStarting: false,
		auditAuditedCount: 0,
		auditAuditTotal: 4,
		repoBatchActive: false,
		repoBatchStopping: false,
		repoBatchDone: 0,
		repoBatchSkipped: 0,
		repoBatchStopped: 0,
		pendingCount: 3,
		confidentPendingCount: 2,
		confidenceThreshold: 0.85,
		onAuditAll: () => {},
		onRunAll: () => {},
		onStopAll: () => {},
		onDeleteAll: () => {},
		onAcceptConfident: () => {},
		onOpenLane: () => {},
	},
} satisfies Meta<typeof MaintenanceHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Idle header: title + lane help buttons, the action cluster, Delete all and
 *  Accept confident both present. */
export const Default: Story = {};

/** No models in the selected repo — the batch buttons are disabled. */
export const NoModels: Story = {
	args: {
		modelCount: 0,
		auditAuditTotal: 0,
		pendingCount: 0,
		confidentPendingCount: 0,
	},
};

/** A batch run is in flight — Run maintenance shows progress and Stop appears. */
export const BatchRunning: Story = {
	args: {
		repoBatchActive: true,
		repoBatchDone: 2,
		repoBatchStopping: false,
	},
};

/** The batch was stopped — Stop is busy and the "stopped" tally shows. */
export const BatchStopping: Story = {
	args: {
		repoBatchActive: true,
		repoBatchDone: 2,
		repoBatchStopping: true,
	},
};

/** The batch finished with some models skipped for pending proposals. */
export const BatchSkippedStopped: Story = {
	args: {
		repoBatchActive: false,
		repoBatchSkipped: 1,
		repoBatchStopped: 1,
	},
};

/** The deterministic dry-run audit is sweeping the visible models. */
export const AuditAllRunning: Story = {
	args: {
		auditAllActive: true,
		auditAuditedCount: 3,
		auditAuditTotal: 4,
		auditAllStarting: false,
	},
};

/** Nothing pending — Delete all / Accept confident are absent. */
export const NothingPending: Story = {
	args: { pendingCount: 0, confidentPendingCount: 0 },
};
