import type { Meta, StoryObj } from "@storybook/react";
import { RunMaintenanceConfirm } from "./RunMaintenanceConfirm";

const meta = {
  title: "Maintenance/RunMaintenanceConfirm",
  component: RunMaintenanceConfirm,
  parameters: { layout: "fullscreen" },
  args: {
    kind: "single",
    count: 1,
    busy: false,
    onCancel: () => {},
    onConfirm: () => {},
    onViewProposals: () => {},
  },
} satisfies Meta<typeof RunMaintenanceConfirm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Single model with existing proposals — the review affordance is present. */
export const Single: Story = {};

export const SingleBusy: Story = { args: { busy: true } };

/** Batch run across many models — no single target, so no View button. */
export const Batch: Story = {
  args: { kind: "batch", count: 4, onViewProposals: undefined },
};
