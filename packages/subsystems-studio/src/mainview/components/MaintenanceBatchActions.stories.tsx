import type { Meta, StoryObj } from "@storybook/react";
import { MaintenanceBatchActions } from "./MaintenanceHeader";

const meta = {
	title: "Maintenance/MaintenanceBatchActions",
	component: MaintenanceBatchActions,
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
		onAuditAll: () => {},
		onRunAll: () => {},
		onStopAll: () => {},
	},
} satisfies Meta<typeof MaintenanceBatchActions>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Idle controls — both batch buttons enabled, no progress or tallies. */
export const Default: Story = {};

/** No models in the selected repo — both buttons are disabled. */
export const NoModels: Story = {
	args: {
		modelCount: 0,
		auditAuditTotal: 0,
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

/** The batch was stopped — Stop is busy. */
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