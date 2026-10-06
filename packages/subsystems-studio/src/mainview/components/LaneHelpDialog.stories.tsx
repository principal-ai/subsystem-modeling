import type { Meta, StoryObj } from "@storybook/react";
import { Box } from "lucide-react";
import { LaneHelpDialog } from "./LaneHelpDialog";

const meta = {
  title: "Maintenance/LaneHelpDialog",
  component: LaneHelpDialog,
  parameters: { layout: "fullscreen" },
  args: {
    Icon: Box,
    name: "Construct verification",
    blurb:
      "Layer 1 — each component's source declaration: the file exists, the symbol is declared, the construct matches, and the signature types agree.",
    legend: [
      { status: "verified", label: "Verified", desc: "Evidence confirms every claim.", color: "#10b981" },
      { status: "partial", label: "Partial", desc: "Some claims are unconfirmed — agent work remains.", color: "#f59e0b" },
      { status: "issues", label: "Issues", desc: "A hard failure — must be fixed.", color: "#ef4444" },
      { status: "blocked", label: "Blocked", desc: "Cannot check yet (repo / graphify cache unavailable).", color: "#6b7280" },
    ],
    onClose: () => {},
  },
} satisfies Meta<typeof LaneHelpDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
