import type { Meta, StoryObj } from "@storybook/react";
import { MaintainModelPickerModal } from "./MaintainModelPickerModal";

const meta = {
  title: "Maintenance/MaintainModelPickerModal",
  component: MaintainModelPickerModal,
  parameters: { layout: "fullscreen" },
  args: {
    graphId: "sg-1788974222416-tvd82jthf",
    title: "Subsystem list click to graph load",
    mode: "verify",
    agent: "construct-verifier",
    onClose: () => {},
    onStarted: () => {},
  },
} satisfies Meta<typeof MaintainModelPickerModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Exact next agent known — the title names it. */
export const Verify: Story = {};

/** No route (fully verified / unknown) — falls back to the tier list. */
export const TierFallback: Story = { args: { agent: null } };

export const Issues: Story = {
  args: { mode: "issues", agent: "construct-fixer" },
};
