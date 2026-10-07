import type { Meta, StoryObj } from "@storybook/react";
import { SettingsModal } from "./SettingsModal";

const meta = {
  title: "App Header/SettingsModal",
  component: SettingsModal,
  parameters: { layout: "fullscreen" },
  args: { onClose: () => {} },
} satisfies Meta<typeof SettingsModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default pane — which permanent tabs the app restores on launch. */
export const Default: Story = {};

/**
 * The Auditing pane — regular-audit enable + interval, the Maintainer model,
 * and "Surface one-click fixes during audit" with its expandable list of the
 * conditions that get a deterministic fix.
 */
export const Auditing: Story = { args: { initialTab: "auditing" } };

/** The Jev (TypeSafe) pane — the Jev API key and the proposal auto-accept gate. */
export const Jev: Story = { args: { initialTab: "jev" } };
