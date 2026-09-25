import type { Meta, StoryObj } from "@storybook/react";
import { SettingsModal } from "./SettingsModal";

const meta = {
  title: "Maintenance/SettingsModal",
  component: SettingsModal,
  parameters: { layout: "fullscreen" },
  args: { onClose: () => {} },
} satisfies Meta<typeof SettingsModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Reads settings from the mock RPC on mount. */
export const Default: Story = {};
