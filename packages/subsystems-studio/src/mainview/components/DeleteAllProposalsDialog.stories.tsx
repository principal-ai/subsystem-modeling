import type { Meta, StoryObj } from "@storybook/react";
import { DeleteAllProposalsDialog } from "./DeleteAllProposalsDialog";

const meta = {
  title: "Maintenance/DeleteAllProposalsDialog",
  component: DeleteAllProposalsDialog,
  parameters: { layout: "fullscreen" },
  args: {
    count: 3,
    running: false,
    error: null,
    onCancel: () => {},
    onConfirm: () => {},
  },
} satisfies Meta<typeof DeleteAllProposalsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Busy: Story = { args: { running: true } };

export const WithError: Story = {
  args: { error: "Failed to delete proposals" },
};
