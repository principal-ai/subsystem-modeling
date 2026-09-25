import type { Meta, StoryObj } from "@storybook/react";
import { AcceptConfidentDialog } from "./AcceptConfidentDialog";

const entries = [
  { id: "sp-1", title: "Subsystem list click to graph load", confidencePct: 97 },
  { id: "sp-2", title: "Proposal second-opinion gate", confidencePct: 92 },
  { id: "sp-3", title: "Maintain repo filter", confidencePct: 91 },
];

const meta = {
  title: "Maintenance/AcceptConfidentDialog",
  component: AcceptConfidentDialog,
  parameters: { layout: "fullscreen" },
  args: {
    entries,
    threshold: 0.9,
    batch: {},
    running: false,
    onCancel: () => {},
    onAccept: () => {},
  },
} satisfies Meta<typeof AcceptConfidentDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const InProgress: Story = {
  args: {
    running: true,
    batch: {
      "sp-1": { status: "done" },
      "sp-2": { status: "running" },
    },
  },
};

export const WithError: Story = {
  args: {
    batch: {
      "sp-1": { status: "done" },
      "sp-2": { status: "error", error: "Accept failed: unknown proposal" },
    },
  },
};
