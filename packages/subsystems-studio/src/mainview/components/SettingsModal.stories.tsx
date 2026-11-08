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
 * The Auditing pane — regular-audit enable + interval and "Surface one-click
 * fixes during audit" with its expandable list of the conditions that get a
 * deterministic fix.
 */
export const Auditing: Story = { args: { initialTab: "auditing" } };

/**
 * The Second opinion pane — Jev | Ollama judge picker, the judge's key or
 * model, a one-shot "Test the judge", and the proposal auto-accept gate.
 */
export const SecondOpinion: Story = { args: { initialTab: "jev" } };

/**
 * The Maintainer pane — OpenCode V2 install state plus the maintainer model
 * choice: free tier, a catalog model, or a local Ollama model (with the
 * server's availability shown inline).
 */
export const Maintainer: Story = { args: { initialTab: "maintainer" } };

/** Shared S3/R2 model-source configuration. */
export const SharedModels: Story = { args: { initialTab: "sharedModels" } };
